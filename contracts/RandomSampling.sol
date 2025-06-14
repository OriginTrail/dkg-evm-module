// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {INamed} from "./interfaces/INamed.sol";
import {IVersioned} from "./interfaces/IVersioned.sol";
import {ContractStatus} from "./abstract/ContractStatus.sol";
import {IInitializable} from "./interfaces/IInitializable.sol";
import {RandomSamplingLib} from "./libraries/RandomSamplingLib.sol";
import {ProfileLib} from "./libraries/ProfileLib.sol";
import {IdentityStorage} from "./storage/IdentityStorage.sol";
import {RandomSamplingStorage} from "./storage/RandomSamplingStorage.sol";
import {KnowledgeCollectionStorage} from "./storage/KnowledgeCollectionStorage.sol";
import {StakingStorage} from "./storage/StakingStorage.sol";
import {ProfileStorage} from "./storage/ProfileStorage.sol";
import {EpochStorage} from "./storage/EpochStorage.sol";
import {Chronos} from "./storage/Chronos.sol";
import {AskStorage} from "./storage/AskStorage.sol";
import {DelegatorsInfo} from "./storage/DelegatorsInfo.sol";
import {ParametersStorage} from "./storage/ParametersStorage.sol";
import {ShardingTableStorage} from "./storage/ShardingTableStorage.sol";
import {ICustodian} from "./interfaces/ICustodian.sol";
import {HubLib} from "./libraries/HubLib.sol";

contract RandomSampling is INamed, IVersioned, ContractStatus, IInitializable {
    string private constant _NAME = "RandomSampling";
    string private constant _VERSION = "1.0.0";
    uint256 public constant SCALE18 = 1e18;

    IdentityStorage public identityStorage;
    RandomSamplingStorage public randomSamplingStorage;
    KnowledgeCollectionStorage public knowledgeCollectionStorage;
    StakingStorage public stakingStorage;
    ProfileStorage public profileStorage;
    EpochStorage public epochStorage;
    Chronos public chronos;
    AskStorage public askStorage;
    DelegatorsInfo public delegatorsInfo;
    ParametersStorage public parametersStorage;
    ShardingTableStorage public shardingTableStorage;

    error MerkleRootMismatchError(bytes32 computedMerkleRoot, bytes32 expectedMerkleRoot);

    event ChallengeCreated(
        uint256 indexed identityId,
        uint256 indexed epoch,
        uint256 knowledgeCollectionId,
        uint256 chunkId,
        uint256 indexed activeProofPeriodBlock,
        uint256 proofingPeriodDurationInBlocks
    );
    event ValidProofSubmitted(uint72 indexed identityId, uint256 indexed epoch, uint256 score);

    constructor(address hubAddress) ContractStatus(hubAddress) {}

    modifier profileExists(uint72 identityId) {
        _checkProfileExists(identityId);
        _;
    }

    // @dev Only transactions by HubController owner or one of the owners of the MultiSig Wallet
    modifier onlyOwnerOrMultiSigOwner() {
        _checkOwnerOrMultiSigOwner();
        _;
    }

    function initialize() public onlyHub {
        identityStorage = IdentityStorage(hub.getContractAddress("IdentityStorage"));
        randomSamplingStorage = RandomSamplingStorage(hub.getContractAddress("RandomSamplingStorage"));
        knowledgeCollectionStorage = KnowledgeCollectionStorage(
            hub.getAssetStorageAddress("KnowledgeCollectionStorage")
        );
        stakingStorage = StakingStorage(hub.getContractAddress("StakingStorage"));
        profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        epochStorage = EpochStorage(hub.getContractAddress("EpochStorageV8"));
        chronos = Chronos(hub.getContractAddress("Chronos"));
        askStorage = AskStorage(hub.getContractAddress("AskStorage"));
        delegatorsInfo = DelegatorsInfo(hub.getContractAddress("DelegatorsInfo"));
        parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));
        shardingTableStorage = ShardingTableStorage(hub.getContractAddress("ShardingTableStorage"));
    }

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function setProofingPeriodDurationInBlocks(uint16 durationInBlocks) external onlyOwnerOrMultiSigOwner {
        require(durationInBlocks > 0, "Duration in blocks must be greater than 0");

        // Calculate the effective epoch (current epoch + delay)
        uint256 effectiveEpoch = chronos.getCurrentEpoch() + 1;

        // Check if there's a pending change
        if (randomSamplingStorage.isPendingProofingPeriodDuration()) {
            randomSamplingStorage.replacePendingProofingPeriodDuration(durationInBlocks, effectiveEpoch);
        } else {
            randomSamplingStorage.addProofingPeriodDuration(durationInBlocks, effectiveEpoch);
        }
    }

    function createChallenge() external profileExists(identityStorage.getIdentityId(msg.sender)) {
        uint72 identityId = identityStorage.getIdentityId(msg.sender);

        RandomSamplingLib.Challenge memory nodeChallenge = randomSamplingStorage.getNodeChallenge(identityId);

        if (
            nodeChallenge.activeProofPeriodStartBlock == randomSamplingStorage.updateAndGetActiveProofPeriodStartBlock()
        ) {
            // Revert if node has already solved the challenge for this period
            if (nodeChallenge.solved) {
                revert("The challenge for this proof period has already been solved");
            }

            // Revert if a challenge for this node exists but has not been solved yet
            if (nodeChallenge.knowledgeCollectionId != 0) {
                revert("An unsolved challenge already exists for this node in the current proof period");
            }
        }

        // Generate a new challenge
        RandomSamplingLib.Challenge memory challenge = _generateChallenge(identityId, msg.sender);

        // Store the new challenge in the storage contract
        randomSamplingStorage.setNodeChallenge(identityId, challenge);
    }

    function submitProof(
        string memory chunk,
        bytes32[] calldata merkleProof
    ) external profileExists(identityStorage.getIdentityId(msg.sender)) {
        // Get node identityId
        uint72 identityId = identityStorage.getIdentityId(msg.sender);

        // Get node challenge
        RandomSamplingLib.Challenge memory challenge = randomSamplingStorage.getNodeChallenge(identityId);

        if (challenge.solved) {
            revert("This challenge has already been solved");
        }

        uint256 activeProofPeriodStartBlock = randomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();

        // verify that the challengeId matches the current challenge
        if (challenge.activeProofPeriodStartBlock != activeProofPeriodStartBlock) {
            revert("This challenge is no longer active");
        }

        // Construct the merkle root from chunk and merkleProof
        bytes32 computedMerkleRoot = _computeMerkleRootFromProof(chunk, challenge.chunkId, merkleProof);

        // Get the expected merkle root for this challenge
        bytes32 expectedMerkleRoot = knowledgeCollectionStorage.getLatestMerkleRoot(challenge.knowledgeCollectionId);

        // Verify the submitted root matches
        if (computedMerkleRoot == expectedMerkleRoot) {
            // Mark as correct submission and add points to the node
            challenge.solved = true;
            randomSamplingStorage.setNodeChallenge(identityId, challenge);

            uint256 epoch = chronos.getCurrentEpoch();
            randomSamplingStorage.incrementEpochNodeValidProofsCount(epoch, identityId);
            uint256 score18 = calculateNodeScore(identityId);
            randomSamplingStorage.addToNodeEpochProofPeriodScore(
                epoch,
                activeProofPeriodStartBlock,
                identityId,
                score18
            );
            randomSamplingStorage.addToAllNodesEpochProofPeriodScore(epoch, activeProofPeriodStartBlock, score18);
            randomSamplingStorage.addToNodeEpochScore(epoch, identityId, score18);
            randomSamplingStorage.addToAllNodesEpochScore(epoch, score18);

            // Calculate and add to nodeEpochScorePerStake
            uint96 totalNodeStake = stakingStorage.getNodeStake(identityId);
            if (totalNodeStake > 0) {
                uint256 nodeScorePerStake36 = (score18 * SCALE18) / totalNodeStake;
                randomSamplingStorage.addToNodeEpochScorePerStake(epoch, identityId, nodeScorePerStake36);
            }
            emit ValidProofSubmitted(identityId, epoch, score18);
        } else {
            revert MerkleRootMismatchError(computedMerkleRoot, expectedMerkleRoot);
        }
    }

    function _computeMerkleRootFromProof(
        string memory chunk,
        uint256 chunkId,
        bytes32[] calldata merkleProof
    ) internal pure returns (bytes32) {
        bytes32 computedHash = keccak256(abi.encodePacked(chunk, chunkId));

        for (uint256 i = 0; i < merkleProof.length; ) {
            if (computedHash < merkleProof[i]) {
                computedHash = keccak256(abi.encodePacked(computedHash, merkleProof[i]));
            } else {
                computedHash = keccak256(abi.encodePacked(merkleProof[i], computedHash));
            }

            unchecked {
                i++;
            }
        }

        return computedHash;
    }

    function _generateChallenge(
        uint72 identityId,
        address originalSender
    ) internal returns (RandomSamplingLib.Challenge memory) {
        // +1 to avoid blockhash(block.number) situation
        bytes32 myBlockHash = blockhash(block.number - ((identityId % 256) + 1));

        bytes32 pseudoRandomVariable = keccak256(
            abi.encodePacked(
                block.difficulty,
                myBlockHash,
                originalSender,
                block.timestamp,
                tx.gasprice,
                uint8(1) // sector = 1 by default
            )
        );
        uint256 knowledgeCollectionsCount = knowledgeCollectionStorage.getLatestKnowledgeCollectionId();
        if (knowledgeCollectionsCount == 0) {
            revert("No knowledge collections exist");
        }

        uint256 currentEpoch = chronos.getCurrentEpoch();

        // Optimized binary search approach for finding active knowledge collection
        uint256 knowledgeCollectionId = _findActiveKnowledgeCollection(
            pseudoRandomVariable,
            1,
            knowledgeCollectionsCount,
            currentEpoch
        );

        if (knowledgeCollectionId == 0) {
            revert("Failed to find a knowledge collection that is active in the current epoch");
        }

        uint88 chunksCount = knowledgeCollectionStorage.getKnowledgeCollection(knowledgeCollectionId).byteSize /
            randomSamplingStorage.CHUNK_BYTE_SIZE();
        uint256 chunkId = uint256(pseudoRandomVariable) % chunksCount;
        uint256 activeProofPeriodStartBlock = randomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();

        emit ChallengeCreated(
            identityId,
            currentEpoch,
            knowledgeCollectionId,
            chunkId,
            activeProofPeriodStartBlock,
            randomSamplingStorage.getActiveProofingPeriodDurationInBlocks()
        );

        return
            RandomSamplingLib.Challenge(
                knowledgeCollectionId,
                chunkId,
                address(knowledgeCollectionStorage),
                currentEpoch,
                activeProofPeriodStartBlock,
                randomSamplingStorage.getActiveProofingPeriodDurationInBlocks(),
                false
            );
    }

    /**
     * @dev BFS approach to finding an active knowledge collection
     * @param randomSeed Random seed for picking a collection from current range
     * @param start Start of the range (inclusive)
     * @param end End of the range (inclusive)
     * @param currentEpoch Current epoch to check collection activity against
     * @return knowledgeCollectionId ID of an active knowledge collection, or 0 if none found
     */
    function _findActiveKnowledgeCollection(
        bytes32 randomSeed,
        uint256 start,
        uint256 end,
        uint256 currentEpoch
    ) internal view returns (uint256) {
        // Queue using fixed array - [start1, end1, start2, end2, ...]
        uint256[100] memory queue; // Can hold 50 ranges max
        uint8 queueStart = 0; // Front of queue
        uint8 queueEnd = 0; // Back of queue

        // Push initial range
        queue[queueEnd++] = start;
        queue[queueEnd++] = end;

        bytes32 currentRandom = randomSeed;
        uint8 iterations = 0;

        while (queueStart < queueEnd && iterations < 50) {
            // Pop range from front of queue (BFS behavior)
            uint256 currentStart = queue[queueStart++];
            uint256 currentEnd = queue[queueStart++];

            // Pick random collection from current range
            uint256 randomKcId = currentStart + (uint256(currentRandom) % (currentEnd - currentStart + 1));

            // Check if this collection is active
            if (currentEpoch <= knowledgeCollectionStorage.getEndEpoch(randomKcId)) {
                return randomKcId;
            }

            // If single element and not active, continue to next range
            if (currentStart == currentEnd) {
                currentRandom = keccak256(abi.encodePacked(currentRandom));
                unchecked {
                    iterations++;
                }
                continue;
            }

            // Split range and push both halves to back of queue (BFS order)
            uint256 mid = currentStart + (currentEnd - currentStart) / 2;

            if (queueEnd < 96) {
                // Leave room for both ranges
                // Always push left half first, then right half (consistent BFS)
                if (currentStart <= mid) {
                    queue[queueEnd++] = currentStart;
                    queue[queueEnd++] = mid;
                }
                if (mid + 1 <= currentEnd) {
                    queue[queueEnd++] = mid + 1;
                    queue[queueEnd++] = currentEnd;
                }
            }

            currentRandom = keccak256(abi.encodePacked(currentRandom));
            unchecked {
                iterations++;
            }
        }

        return 0; // No active collection found
    }

    function calculateNodeScore(uint72 identityId) public view returns (uint256) {
        // 1. Node stake factor calculation
        // Formula: nodeStakeFactor = 2 * (nodeStake / 2,000,000)^2
        uint256 maximumStake = uint256(parametersStorage.maximumStake());
        uint256 nodeStake = uint256(stakingStorage.getNodeStake(identityId));
        nodeStake = nodeStake > maximumStake ? maximumStake : nodeStake;
        uint256 stakeRatio18 = (nodeStake * SCALE18) / maximumStake;
        uint256 nodeStakeFactor18 = (2 * stakeRatio18 * stakeRatio18) / SCALE18;

        // 2. Node ask factor calculation
        // Formula: nodeStake * ((upperAskBound - nodeAsk) / (upperAskBound - lowerAskBound))^2 / 2,000,000
        uint256 nodeAsk18 = uint256(profileStorage.getAsk(identityId)) * SCALE18;
        (uint256 askLowerBound18, uint256 askUpperBound18) = askStorage.getAskBounds();
        uint256 nodeAskFactor18;
        if (askUpperBound18 > askLowerBound18 && nodeAsk18 >= askLowerBound18 && nodeAsk18 <= askUpperBound18) {
            uint256 askDiffRatio18 = ((askUpperBound18 - nodeAsk18) * SCALE18) / (askUpperBound18 - askLowerBound18);
            nodeAskFactor18 = (stakeRatio18 * (askDiffRatio18 ** 2)) / (SCALE18 ** 2);
        }

        // 3. Node publishing factor calculation
        // Original: nodeStakeFactor * (nodePublishingFactor / MAX(allNodesPublishingFactors))
        uint256 nodePub = uint256(epochStorage.getNodeCurrentEpochProducedKnowledgeValue(identityId));
        uint256 maxNodePub = uint256(epochStorage.getCurrentEpochNodeMaxProducedKnowledgeValue());
        require(maxNodePub > 0, "max publish is 0");
        uint256 pubRatio18 = (nodePub * SCALE18) / maxNodePub;
        uint256 nodePublishingFactor18 = (nodeStakeFactor18 * pubRatio18) / SCALE18;

        return nodeStakeFactor18 + nodeAskFactor18 + nodePublishingFactor18;
    }

    function _checkProfileExists(uint72 identityId) internal view virtual {
        if (!profileStorage.profileExists(identityId)) {
            revert ProfileLib.ProfileDoesntExist(identityId);
        }
    }

    function _isMultiSigOwner(address multiSigAddress) internal view returns (bool) {
        try ICustodian(multiSigAddress).getOwners() returns (address[] memory multiSigOwners) {
            for (uint256 i = 0; i < multiSigOwners.length; i++) {
                if (msg.sender == multiSigOwners[i]) {
                    return true;
                }
            } // solhint-disable-next-line no-empty-blocks
        } catch {}

        return false;
    }

    function _checkOwnerOrMultiSigOwner() internal view virtual {
        address hubOwner = hub.owner();
        if (msg.sender != hubOwner && !_isMultiSigOwner(hubOwner)) {
            revert HubLib.UnauthorizedAccess("Only Hub Owner or Multisig Owner");
        }
    }
}
