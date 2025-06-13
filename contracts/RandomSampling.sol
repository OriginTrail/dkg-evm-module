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

contract RandomSampling is INamed, IVersioned, ContractStatus, IInitializable {
    string private constant _NAME = "RandomSampling";
    string private constant _VERSION = "1.0.0";
    uint256 public constant SCALE18 = 1e18;
    uint8 public avgBlockTimeInSeconds;
    uint256 public w1;
    uint256 public w2;

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
    event AvgBlockTimeUpdated(uint8 avgBlockTimeInSeconds);
    event ProofingPeriodDurationInBlocksUpdated(uint8 durationInBlocks);
    event W1Updated(uint256 oldW1, uint256 newW1);
    event W2Updated(uint256 oldW2, uint256 newW2);

    constructor(address hubAddress, uint8 _avgBlockTimeInSeconds, uint256 _w1, uint256 _w2) ContractStatus(hubAddress) {
        require(_avgBlockTimeInSeconds > 0, "Average block time in seconds must be greater than 0");
        avgBlockTimeInSeconds = _avgBlockTimeInSeconds;
        w1 = _w1;
        w2 = _w2;
    }

    modifier profileExists(uint72 identityId) {
        _checkProfileExists(identityId);
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

    function setW1(uint256 _w1) external onlyHubOwner {
        uint256 oldW1 = w1;
        w1 = _w1;
        emit W1Updated(oldW1, w1);
    }

    function setW2(uint256 _w2) external onlyHubOwner {
        uint256 oldW2 = w2;
        w2 = _w2;
        emit W2Updated(oldW2, w2);
    }

    function setAvgBlockTimeInSeconds(uint8 blockTimeInSeconds) external onlyHubOwner {
        require(blockTimeInSeconds > 0, "Block time in seconds must be greater than 0");
        avgBlockTimeInSeconds = blockTimeInSeconds;
        emit AvgBlockTimeUpdated(blockTimeInSeconds);
    }

    function setProofingPeriodDurationInBlocks(uint16 durationInBlocks) external onlyContracts {
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
     * @dev Adaptive BFS search for an active collection.
     *      challengeRecencyFactor  5,000    → 50% chance to pop newer/older half first
     *                          10,000→ always pop newer half first
     *      bfsIterations          user-controllable gas/latency guard (default: 50)
     */
    function _findActiveKnowledgeCollection(
        bytes32 randomSeed,
        uint256 start,
        uint256 end,
        uint256 currentEpoch
    ) internal view returns (uint256) {
        uint8 bfsIterations = randomSamplingStorage.getBfsIterations();
        uint8 itCap = bfsIterations == 0 ? randomSamplingStorage.getDefaultBfsIterations() : bfsIterations;
        uint16 challengeRecencyFactor = randomSamplingStorage.getChallengeRecencyFactor();
        uint16 maxChallengeRecencyFactor = randomSamplingStorage.getMaxChallengeRecencyFactor();

        // Calculate proper queue size: we process at most itCap ranges, each can split into 2
        // Maximum queue size = initial range + ranges from splitting = 2 * (itCap + 1) slots
        uint256 queueSize = 2 * (uint256(itCap) + 1);
        uint256[] memory queue = new uint256[](queueSize);

        uint16 queueStart = 0; // front index
        uint16 queueEnd = 0; // back  index
        queue[queueEnd++] = start;
        queue[queueEnd++] = end;

        bytes32 currentRandomSeed = randomSeed;
        uint8 iterations = 0;

        while (queueStart < queueEnd && iterations < itCap) {
            uint256 lo = queue[queueStart++];
            uint256 hi = queue[queueStart++];
            uint256 span = hi - lo + 1;

            uint256 pick;
            uint256 roll = uint256(currentRandomSeed);
            if (challengeRecencyFactor == 0) {
                pick = lo + (roll % span); // uniform
            } else {
                // 1) decide which half we favour this iteration
                bool favourNewer = (roll % maxChallengeRecencyFactor) < challengeRecencyFactor;
                uint256 mid = lo + (span >> 1);

                if (favourNewer) {
                    // sample uniformly from newer half [mid+1,hi]
                    uint256 newerSpan = hi - mid;
                    pick = (newerSpan == 0) ? hi : mid + 1 + (roll % newerSpan);
                } else {
                    // sample from older half [lo,mid]
                    uint256 olderSpan = mid - lo + 1;
                    pick = lo + (roll % olderSpan);
                }
            }

            if (currentEpoch <= knowledgeCollectionStorage.getEndEpoch(pick)) {
                return pick;
            }

            // not active → split and enqueue, order depends on challengeRecencyFactor
            if (lo != hi && queueEnd <= queueSize - 4) {
                // Ensure we have space for 2 ranges (4 slots)
                uint256 mid = lo + (span >> 1);
                bool newerFirst = (uint256(currentRandomSeed) >> 128) % maxChallengeRecencyFactor <
                    challengeRecencyFactor;

                if (newerFirst) {
                    if (mid + 1 <= hi) {
                        queue[queueEnd++] = mid + 1;
                        queue[queueEnd++] = hi;
                    }
                    if (lo <= mid) {
                        queue[queueEnd++] = lo;
                        queue[queueEnd++] = mid;
                    }
                } else {
                    if (lo <= mid) {
                        queue[queueEnd++] = lo;
                        queue[queueEnd++] = mid;
                    }
                    if (mid + 1 <= hi) {
                        queue[queueEnd++] = mid + 1;
                        queue[queueEnd++] = hi;
                    }
                }
            }

            currentRandomSeed = keccak256(abi.encodePacked(currentRandomSeed));
            unchecked {
                ++iterations;
            }
        }
        return 0; // no active collection found
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
}
