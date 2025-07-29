// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {INamed} from "./interfaces/INamed.sol";
import {IVersioned} from "./interfaces/IVersioned.sol";
import {ContractStatus} from "./abstract/ContractStatus.sol";
import {IInitializable} from "./interfaces/IInitializable.sol";
import {RandomSamplingLib} from "./libraries/RandomSamplingLib.sol";
import {ProfileLib} from "./libraries/ProfileLib.sol";
import {IdentityStorage} from "./storage/IdentityStorage.sol";
import {V6_RandomSamplingStorage} from "./storage/V6_RandomSamplingStorage.sol";
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

contract V6_RandomSampling is INamed, IVersioned, ContractStatus, IInitializable {
    string private constant _NAME = "V6_RandomSampling";
    string private constant _VERSION = "1.0.0";
    uint256 public constant SCALE18 = 1e18;

    IdentityStorage public identityStorage;
    V6_RandomSamplingStorage public v6_randomSamplingStorage;
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

    /**
     * @dev Constructor initializes the contract with essential parameters for random sampling
     * Only called once during deployment
     * @param hubAddress Address of the Hub contract for access control
     */
    constructor(address hubAddress) ContractStatus(hubAddress) {}

    modifier profileExists(uint72 identityId) {
        _checkProfileExists(identityId);
        _;
    }

    /**
     * @dev Modifier to check if a node exists in the sharding table
     * Used by functions to ensure operations target valid nodes
     * Reverts with NodeDoesntExist error if node is not found
     * @param identityId Node identity to check existence for
     */
    modifier nodeExistsInShardingTable(uint72 identityId) {
        _checkNodeExistsInShardingTable(identityId);
        _;
    }

    // @dev Only transactions by HubController owner or one of the owners of the MultiSig Wallet
    modifier onlyOwnerOrMultiSigOwner() {
        _checkOwnerOrMultiSigOwner();
        _;
    }

    /**
     * @dev Initializes the contract by connecting to all required Hub dependencies
     * Called once during deployment to set up contract references for storage and computation
     * Only the Hub can call this function
     */
    function initialize() public onlyHub {
        identityStorage = IdentityStorage(hub.getContractAddress("IdentityStorage"));
        v6_randomSamplingStorage = V6_RandomSamplingStorage(hub.getContractAddress("V6_RandomSamplingStorage"));
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

    /**
     * @dev Returns the name of this contract
     * Used for contract identification and versioning
     */
    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    /**
     * @dev Returns the version of this contract
     * Used for contract identification and versioning
     */
    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    /**
     * @dev Checks if there is a pending proofing period duration that hasn't taken effect yet
     * @return True if there is a pending duration change, false otherwise
     */
    function isPendingProofingPeriodDuration() public view returns (bool) {
        return chronos.getCurrentEpoch() < v6_randomSamplingStorage.getLatestProofingPeriodDurationEffectiveEpoch();
    }

    /**
     * @dev Sets the duration of proofing periods in blocks with a one-epoch delay
     * Only contracts registered in the Hub can call this function
     * If a pending change exists, replaces it; otherwise adds a new duration
     * Changes take effect in the next epoch to ensure smooth transitions
     * @param durationInBlocks New proofing period duration in blocks (must be > 0)
     */
    function setProofingPeriodDurationInBlocks(uint16 durationInBlocks) external onlyOwnerOrMultiSigOwner {
        require(durationInBlocks > 0, "Duration in blocks must be greater than 0");

        // Calculate the effective epoch (current epoch + delay)
        uint256 effectiveEpoch = chronos.getCurrentEpoch() + 1;

        // Check if there's a pending change
        if (isPendingProofingPeriodDuration()) {
            v6_randomSamplingStorage.replacePendingProofingPeriodDuration(durationInBlocks, effectiveEpoch);
        } else {
            v6_randomSamplingStorage.addProofingPeriodDuration(durationInBlocks, effectiveEpoch);
        }
    }

    /**
     * @dev Creates a new challenge for the calling node in the current proofing period
     * Caller must have a registered profile and cannot have an active unsolved challenge
     * Generates a random knowledge collection and chunk to be proven
     * Can only create one challenge per proofing period
     */
    function createChallenge()
        external
        profileExists(identityStorage.getIdentityId(msg.sender))
        nodeExistsInShardingTable(identityStorage.getIdentityId(msg.sender))
    {
        uint72 identityId = identityStorage.getIdentityId(msg.sender);
        //TODO check if a node is V6 node and in the sharding table
        RandomSamplingLib.Challenge memory nodeChallenge = v6_randomSamplingStorage.getNodeChallenge(identityId);

        if (nodeChallenge.activeProofPeriodStartBlock == updateAndGetActiveProofPeriodStartBlock()) {
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
        RandomSamplingLib.Challenge memory challenge = _generateChallenge(msg.sender);

        // Store the new challenge in the storage contract
        v6_randomSamplingStorage.setNodeChallenge(identityId, challenge);
    }

    /**
     * @dev Submits proof for an active challenge to earn score used for later reward calculation
     * Validates the submitted chunk and merkle proof against the expected Merkle root
     * On successful proof: marks challenge as solved, increments valid proofs count,
     * calculates and adds node score, and updates epoch scoring data
     * @param chunk The data chunk being proven (must match challenge requirements)
     * @param merkleProof Array of hashes for Merkle proof verification
     */
    function submitProof(
        string memory chunk,
        bytes32[] calldata merkleProof
    )
        external
        profileExists(identityStorage.getIdentityId(msg.sender))
        nodeExistsInShardingTable(identityStorage.getIdentityId(msg.sender))
    {
        // Get node identityId
        uint72 identityId = identityStorage.getIdentityId(msg.sender);
        //TODO check if a node is V6 node and in the sharding table
        // Get node challenge
        RandomSamplingLib.Challenge memory challenge = v6_randomSamplingStorage.getNodeChallenge(identityId);

        if (challenge.solved) {
            revert("This challenge has already been solved");
        }

        uint256 activeProofPeriodStartBlock = updateAndGetActiveProofPeriodStartBlock();

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
            v6_randomSamplingStorage.setNodeChallenge(identityId, challenge);

            uint256 epoch = chronos.getCurrentEpoch();
            v6_randomSamplingStorage.incrementEpochNodeValidProofsCount(epoch, identityId);
            uint256 score18 = calculateNodeScore(identityId);
            v6_randomSamplingStorage.addToNodeEpochProofPeriodScore(
                epoch,
                activeProofPeriodStartBlock,
                identityId,
                score18
            );
            v6_randomSamplingStorage.addToNodeEpochScore(epoch, identityId, score18);
            v6_randomSamplingStorage.addToAllNodesEpochScore(epoch, score18);

            // Calculate and add to nodeEpochScorePerStake
            uint96 totalNodeStake = stakingStorage.getNodeStake(identityId);
            if (totalNodeStake > 0) {
                uint256 nodeScorePerStake36 = (score18 * SCALE18) / totalNodeStake;
                v6_randomSamplingStorage.addToNodeEpochScorePerStake(epoch, identityId, nodeScorePerStake36);
            }
        } else {
            revert MerkleRootMismatchError(computedMerkleRoot, expectedMerkleRoot);
        }
    }

    /**
     * @dev Internal function to compute Merkle root from a chunk and its proof
     * Reconstructs the Merkle tree root by hashing the chunk with its ID and
     * traversing up the tree using the provided proof hashes
     * Uses standard Merkle tree construction where smaller hash goes left
     * @param chunk The data chunk to verify
     * @param chunkId Unique identifier for the chunk position
     * @param merkleProof Array of sibling hashes for tree traversal
     * @return computedRoot The computed Merkle root hash
     */
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

    /**
     * @dev Internal function to generate a new random challenge for a node
     * Uses blockchain properties (block hash, difficulty, timestamp, gas price) for randomness
     * Selects a random active knowledge collection and chunk within it
     * Creates challenge with current epoch and active proof period information
     * @param originalSender The original caller address for randomness seed
     * @return challenge The generated challenge struct
     */
    function _generateChallenge(address originalSender) internal returns (RandomSamplingLib.Challenge memory) {
        uint256 knowledgeCollectionsCount = knowledgeCollectionStorage.getLatestKnowledgeCollectionId();
        if (knowledgeCollectionsCount == 0) {
            revert("No knowledge collections exist");
        }

        bytes32 pseudoRandomVariable = keccak256(
            abi.encodePacked(
                block.difficulty,
                blockhash(block.number - ((block.difficulty % 256) + 1)), // +1 to avoid blockhash(block.number) situation
                originalSender,
                block.timestamp,
                tx.gasprice,
                uint8(1) // sector = 1 by default
            )
        );
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

        uint88 kcByteSize = knowledgeCollectionStorage.getByteSize(knowledgeCollectionId);
        if (kcByteSize == 0) {
            revert("Knowledge collection byte size is 0");
        }

        uint256 chunkId;
        uint256 chunkByteSize = v6_randomSamplingStorage.CHUNK_BYTE_SIZE();
        // KC with byteSize < chunkByteSize will always have chunkId = 0
        if (kcByteSize > chunkByteSize) {
            chunkId = uint256(pseudoRandomVariable) % (kcByteSize / chunkByteSize);
        }

        return
            RandomSamplingLib.Challenge(
                knowledgeCollectionId,
                chunkId,
                address(knowledgeCollectionStorage),
                currentEpoch,
                updateAndGetActiveProofPeriodStartBlock(),
                getActiveProofingPeriodDurationInBlocks(),
                false
            );
    }

    /**
     * @dev Internal function to find an active knowledge collection using breadth-first search
     * Uses BFS with a queue-based approach to efficiently search for collections that are
     * still active (current epoch <= collection's end epoch)
     * Splits ranges recursively and uses randomness to select from each range
     * Limits iterations to prevent infinite loops and ensures gas efficiency
     * @param randomSeed Random seed for picking a collection from current range
     * @param start Start of the range (inclusive) - collection ID range to search
     * @param end End of the range (inclusive) - collection ID range to search
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

    /**
     * @dev Calculates the node score based on stake, ask price, and publishing activity
     * Score = nodeStakeFactor + nodeAskFactor + nodePublishingFactor
     *
     * nodeStakeFactor: 2 * (nodeStake / maxStake)^2 - rewards higher stake
     * nodeAskFactor: (nodeStake/maxStake) * ((upperBound - nodeAsk) / (upperBound - lowerBound))^2 - rewards lower ask prices
     * nodePublishingFactor: nodeStakeFactor * (nodePublishing / maxNodePublishing) - rewards active publishers
     *
     * All calculations use 18-decimal precision for accuracy
     * @param identityId The node identity to calculate score for
     * @return score18 The calculated node score scaled by 18-decimal for precision
     */
    function calculateNodeScore(uint72 identityId) public view returns (uint256) {
        // 1. Node stake factor calculation
        // Formula: nodeStakeFactor = 2 * (nodeStake / maximumStake)^2
        uint256 maximumStake = uint256(parametersStorage.maximumStake());
        uint256 nodeStake = uint256(stakingStorage.getNodeStake(identityId));
        nodeStake = nodeStake > maximumStake ? maximumStake : nodeStake;
        uint256 stakeRatio18 = (nodeStake * SCALE18) / maximumStake;
        uint256 nodeStakeFactor18 = (2 * stakeRatio18 * stakeRatio18) / SCALE18;

        // 2. Node ask factor calculation
        // Formula: nodeStake * ((upperAskBound - nodeAsk) / (upperAskBound - lowerAskBound))^2 / maximumStake
        uint256 nodeAsk18 = uint256(profileStorage.getAsk(identityId)) * SCALE18;
        (uint256 askLowerBound18, uint256 askUpperBound18) = askStorage.getAskBounds();
        uint256 nodeAskFactor18;
        if (askUpperBound18 > askLowerBound18 && nodeAsk18 >= askLowerBound18 && nodeAsk18 <= askUpperBound18) {
            uint256 askDiffRatio18 = ((askUpperBound18 - nodeAsk18) * SCALE18) / (askUpperBound18 - askLowerBound18);
            nodeAskFactor18 = (stakeRatio18 * (askDiffRatio18 ** 2)) / (SCALE18 ** 2);
        }

        // 3. Node publishing factor calculation
        // Original: nodeStakeFactor * (nodePublishingFactor / MAX(allNodesPublishingFactors))
        uint256 maxNodePub = uint256(epochStorage.getCurrentEpochNodeMaxProducedKnowledgeValue());
        if (maxNodePub == 0) {
            return nodeStakeFactor18 + nodeAskFactor18;
        }
        uint256 nodePub = uint256(epochStorage.getNodeCurrentEpochProducedKnowledgeValue(identityId));
        uint256 pubRatio18 = (nodePub * SCALE18) / maxNodePub;
        uint256 nodePublishingFactor18 = (nodeStakeFactor18 * pubRatio18) / SCALE18;

        return nodeStakeFactor18 + nodeAskFactor18 + nodePublishingFactor18;
    }

    /**
     * @dev Updates and returns the current active proof period start block
     * Automatically advances to the next period if the current one has ended
     * @return Current active proof period start block number
     */
    function updateAndGetActiveProofPeriodStartBlock() public returns (uint256) {
        uint256 activeProofingPeriodDurationInBlocks = getActiveProofingPeriodDurationInBlocks();

        if (activeProofingPeriodDurationInBlocks == 0) {
            revert("Active proofing period duration in blocks should not be 0");
        }

        uint256 activeProofPeriodStartBlock = v6_randomSamplingStorage.getActiveProofPeriodStartBlock();

        if (block.number > activeProofPeriodStartBlock + activeProofingPeriodDurationInBlocks - 1) {
            // Calculate how many complete periods have passed since the last active period started
            uint256 blocksSinceLastStart = block.number - activeProofPeriodStartBlock;
            uint256 completePeriodsPassed = blocksSinceLastStart / activeProofingPeriodDurationInBlocks;

            uint256 newActiveProofPeriodStartBlock = activeProofPeriodStartBlock +
                completePeriodsPassed *
                activeProofingPeriodDurationInBlocks;

            v6_randomSamplingStorage.setActiveProofPeriodStartBlock(newActiveProofPeriodStartBlock);

            return newActiveProofPeriodStartBlock;
        }

        return activeProofPeriodStartBlock;
    }

    /**
     * @dev Returns the status of the current active proof period including start block and whether it's still active
     * @return ProofPeriodStatus struct containing start block and active status
     */
    function getActiveProofPeriodStatus() external view returns (RandomSamplingLib.ProofPeriodStatus memory) {
        uint256 activeProofPeriodStartBlock = v6_randomSamplingStorage.getActiveProofPeriodStartBlock();
        return
            RandomSamplingLib.ProofPeriodStatus(
                activeProofPeriodStartBlock,
                block.number < activeProofPeriodStartBlock + getActiveProofingPeriodDurationInBlocks()
            );
    }

    /**
     * @dev Calculates the start block of a historical proof period based on current period and offset
     * Used to determine proof periods from the past for validation purposes
     * @param proofPeriodStartBlock Start block of a valid proof period (must be > 0 and aligned to period boundaries)
     * @param offset Number of periods to go back (must be > 0)
     * @return Start block of the historical proof period
     */
    function getHistoricalProofPeriodStartBlock(
        uint256 proofPeriodStartBlock,
        uint256 offset
    ) external view returns (uint256) {
        require(proofPeriodStartBlock > 0, "Proof period start block must be greater than 0");
        require(
            proofPeriodStartBlock % getActiveProofingPeriodDurationInBlocks() == 0,
            "Proof period start block is not valid"
        );
        require(offset > 0, "Offset must be greater than 0");
        return proofPeriodStartBlock - offset * getActiveProofingPeriodDurationInBlocks();
    }

    /**
     * @dev Returns the currently active proofing period duration in blocks
     * Automatically selects the appropriate duration based on current epoch
     * @return Duration in blocks of the currently active proofing period
     */
    function getActiveProofingPeriodDurationInBlocks() public view returns (uint16) {
        return v6_randomSamplingStorage.getEpochProofingPeriodDurationInBlocks(chronos.getCurrentEpoch());
    }

    /**
     * @dev Internal function to validate that a node profile exists
     * Used by modifiers and functions to ensure operations target valid nodes
     * Reverts with ProfileDoesntExist error if profile is not found
     * @param identityId Node identity to check existence for
     */
    function _checkProfileExists(uint72 identityId) internal view virtual {
        if (!profileStorage.profileExists(identityId)) {
            revert ProfileLib.ProfileDoesntExist(identityId);
        }
    }

    /**
     * @dev Internal function to validate that a node exists in the sharding table
     * Used by modifiers and functions to ensure operations target valid nodes
     * Reverts with NodeDoesntExist error if node is not found
     * @param identityId Node identity to check existence for
     */
    function _checkNodeExistsInShardingTable(uint72 identityId) internal view virtual {
        if (!shardingTableStorage.nodeExists(identityId)) {
            revert("Node does not exist in sharding table");
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
