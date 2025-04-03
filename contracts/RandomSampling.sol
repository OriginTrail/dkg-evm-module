// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {INamed} from "./interfaces/INamed.sol";
import {IVersioned} from "./interfaces/IVersioned.sol";
import {ContractStatus} from "./abstract/ContractStatus.sol";
import {IInitializable} from "./interfaces/IInitializable.sol";
import {RandomSamplingLib} from "./libraries/RandomSamplingLib.sol";
import {IdentityStorage} from "./storage/IdentityStorage.sol";
import {RandomSamplingStorage} from "./storage/RandomSamplingStorage.sol";
import {KnowledgeCollectionStorage} from "./storage/KnowledgeCollectionStorage.sol";
import {StakingStorage} from "./storage/StakingStorage.sol";
import {ProfileStorage} from "./storage/ProfileStorage.sol";
import {EpochStorage} from "./storage/EpochStorage.sol";
import {Chronos} from "./storage/Chronos.sol";
import {AskStorage} from "./storage/AskStorage.sol";
import {DelegatorsInfo} from "./storage/DelegatorsInfo.sol";

contract RandomSampling is INamed, IVersioned, ContractStatus {
    string private constant _NAME = "RandomSampling";
    string private constant _VERSION = "1.0.0";
    uint256 SCALING_FACTOR = 1e18;
    uint8 public avgBlockTimeInSeconds;

    IdentityStorage public identityStorage;
    RandomSamplingStorage public randomSamplingStorage;
    KnowledgeCollectionStorage public knowledgeCollectionStorage;
    StakingStorage public stakingStorage;
    ProfileStorage public profileStorage;
    EpochStorage public epochStorage;
    Chronos public chronos;
    AskStorage public askStorage;
    DelegatorsInfo public delegatorsInfo;

    event ChallengeCreated(
        uint256 indexed identityId,
        uint256 indexed epoch,
        uint256 knowledgeCollectionId,
        uint256 chunkId,
        uint256 indexed activeProofPeriodBlock
    );
    event ValidProofSubmitted(uint72 indexed identityId, uint256 indexed epoch, uint256 score);
    event AvgBlockTimeUpdated(uint8 avgBlockTimeInSeconds);
    event ProofingPeriodDurationInBlocksUpdated(uint8 durationInBlocks);

    constructor(address hubAddress, uint8 _avgBlockTimeInSeconds) ContractStatus(hubAddress) {
        avgBlockTimeInSeconds = _avgBlockTimeInSeconds;
    }

    function initialize() external {
        identityStorage = IdentityStorage(hub.getContractAddress("IdentityStorage"));
        randomSamplingStorage = RandomSamplingStorage(hub.getContractAddress("RandomSamplingStorage"));
        knowledgeCollectionStorage = KnowledgeCollectionStorage(hub.getContractAddress("KnowledgeCollectionStorage"));
        stakingStorage = StakingStorage(hub.getContractAddress("StakingStorage"));
        profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        epochStorage = EpochStorage(hub.getContractAddress("EpochStorage"));
        chronos = Chronos(hub.getContractAddress("Chronos"));
        askStorage = AskStorage(hub.getContractAddress("AskStorage"));
        delegatorsInfo = DelegatorsInfo(hub.getContractAddress("DelegatorsInfo"));
    }

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function createChallenge() external returns (RandomSamplingLib.Challenge memory) {
        // identityId
        uint72 identityId = identityStorage.getIdentityId(msg.sender);

        RandomSamplingLib.Challenge memory nodeChallenge = randomSamplingStorage.getNodeChallenge(identityId);

        if (
            nodeChallenge.activeProofPeriodStartBlock == randomSamplingStorage.updateAndGetActiveProofPeriodStartBlock()
        ) {
            // If node has already solved the challenge for this period, return an empty challenge
            if (nodeChallenge.solved == true) {
                return RandomSamplingLib.Challenge(0, 0, 0, false);
            }

            // If the challenge for this node exists but has not been solved yet, return the existing challenge
            if (nodeChallenge.knowledgeCollectionId != 0) {
                return nodeChallenge;
            }
        }

        // Generate a new challenge
        RandomSamplingLib.Challenge memory challenge = _generateChallenge(identityId, msg.sender);

        // Store the new challenge in the storage contract
        randomSamplingStorage.setNodeChallenge(identityId, challenge);

        return challenge;
    }

    function computeMerkleRoot(bytes32 chunk, bytes32[] memory merkleProof) public pure returns (bytes32) {
        bytes32 computedHash = keccak256(abi.encodePacked(chunk));

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

    function submitProof(bytes32 chunk, bytes32[] calldata merkleProof) public returns (bool) {
        // Get node identityId
        uint72 identityId = identityStorage.getIdentityId(msg.sender);

        // Get node challenge
        RandomSamplingLib.Challenge memory challenge = randomSamplingStorage.getNodeChallenge(identityId);

        uint256 activeProofPeriodStartBlock = randomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();

        // verify that the challengeId matches the current challenge
        if (challenge.activeProofPeriodStartBlock != activeProofPeriodStartBlock) {
            // This challenge is no longer active
            return false;
        }

        // Construct the merkle root from chunk and merkleProof
        bytes32 computedMerkleRoot = computeMerkleRoot(chunk, merkleProof);

        // Get the expected merkle root for this challenge
        bytes32 expectedMerkleRoot = knowledgeCollectionStorage.getLatestMerkleRoot(challenge.knowledgeCollectionId);

        // Verify the submitted root matches
        if (computedMerkleRoot == expectedMerkleRoot) {
            // Mark as correct submission and add points to the node
            challenge.solved = true;
            randomSamplingStorage.setNodeChallenge(identityId, challenge);

            uint256 epoch = chronos.getCurrentEpoch();
            randomSamplingStorage.incrementEpochNodeValidProofsCount(epoch, identityId);

            // Calculate node score at this proof period and store it
            uint256 score = _calculateNodeScore(identityId);
            randomSamplingStorage.addToNodeScore(epoch, activeProofPeriodStartBlock, identityId, score);

            // Calculate delegators' scores for the previous proof period and store them
            _calculateAndStoreDelegatorScores(identityId, epoch, activeProofPeriodStartBlock);

            emit ValidProofSubmitted(identityId, epoch, score);

            return true;
        }

        return false;
    }

    function getAllExpectedEpochProofsCount() internal view returns (uint256) {
        uint256 allNodesCount = identityStorage.lastIdentityId();
        uint256 epochLengthInSeconds = chronos.epochLength();
        uint256 maxPossibleNodeProofsInEpoch = epochLengthInSeconds /
            (randomSamplingStorage.getProofingPeriodDurationInBlocks() * avgBlockTimeInSeconds);
        return allNodesCount * maxPossibleNodeProofsInEpoch;
    }

    function setAvgBlockTimeInSeconds(uint8 blockTimeInSeconds) external onlyHubOwner {
        avgBlockTimeInSeconds = blockTimeInSeconds;
        emit AvgBlockTimeUpdated(blockTimeInSeconds);
    }

    function _calculateNodeScore(uint72 identityId) private view returns (uint256) {
        // 1. Node stake factor calculation
        // Formula: nodeStakeFactor = 2 * (nodeStake / 2,000,000)^2
        uint256 nodeStake = stakingStorage.getNodeStake(identityId);
        uint256 stakeRatio = nodeStake / 2000000;
        uint256 nodeStakeFactor = (2 * stakeRatio * stakeRatio) / SCALING_FACTOR;

        // 2. Node ask factor calculation
        // Formula: nodeStake * ((upperAskBound - nodeAsk) / (upperAskBound - lowerAskBound))^2 / 2,000,000
        uint256 nodeAskScaled = profileStorage.getAsk(identityId) * 1e18;
        (uint256 askLowerBound, uint256 askUpperBound) = askStorage.getAskBounds();
        uint256 nodeAskFactor = 0;
        if (nodeAskScaled <= askUpperBound && nodeAskScaled >= askLowerBound) {
            uint256 askBoundsDiff = askUpperBound - askLowerBound;
            if (askBoundsDiff == 0) {
                revert("Ask bounds difference is 0");
            }
            uint256 askDiffRatio = ((askUpperBound - nodeAskScaled) * SCALING_FACTOR) / askBoundsDiff;
            nodeAskFactor = (stakeRatio * (askDiffRatio ** 2)) / (SCALING_FACTOR ** 2);
        }

        // 3. Node publishing factor calculation
        // Original: nodeStakeFactor * (nodePublishingFactor / MAX(allNodesPublishingFactors))
        uint256 nodePubFactor = epochStorage.getNodeCurrentEpochProducedKnowledgeValue(identityId);
        uint256 maxNodePubFactor = epochStorage.getCurrentEpochNodeMaxProducedKnowledgeValue();
        if (maxNodePubFactor == 0) {
            revert("Max node publishing factor is 0");
        }
        uint256 pubRatio = (nodePubFactor * SCALING_FACTOR) / maxNodePubFactor;
        uint256 nodePublishingFactor = (nodeStakeFactor * pubRatio) / SCALING_FACTOR;

        return nodeStakeFactor + nodePublishingFactor - nodeAskFactor;
    }

    function _calculateAndStoreDelegatorScores(
        uint72 identityId,
        uint256 epoch,
        uint256 activeProofPeriodStartBlock
    ) private {
        uint256 lastProofPeriodStartBlock = randomSamplingStorage.getHistoricalProofPeriodStartBlock(
            activeProofPeriodStartBlock,
            1
        );
        uint256 myNodeScore = randomSamplingStorage.getNodeEpochProofPeriodScore(
            identityId,
            epoch,
            lastProofPeriodStartBlock
        );
        uint256 allNodesScore = randomSamplingStorage.getEpochAllNodesProofPeriodScore(
            epoch,
            lastProofPeriodStartBlock
        );
        uint256 lastProofPeriodScoreRatio = (myNodeScore * SCALING_FACTOR) / allNodesScore;

        // update all delegators' scores
        address[] memory delegatorsAddresses = delegatorsInfo.getDelegators(identityId);
        for (uint8 i = 0; i < delegatorsAddresses.length; ) {
            bytes32 delegatorKey = keccak256(abi.encodePacked(delegatorsAddresses[i]));

            uint256 delegatorStake = stakingStorage.getDelegatorTotalStake(identityId, delegatorKey);
            uint256 nodeStake = stakingStorage.getNodeStake(identityId);
            // Need to divide by SCALING_FACTOR^2 to get the correct score
            uint256 delegatorScore = (lastProofPeriodScoreRatio * delegatorStake * SCALING_FACTOR) / nodeStake;

            randomSamplingStorage.addToEpochNodeDelegatorScore(epoch, identityId, delegatorKey, delegatorScore);

            unchecked {
                i++;
            }
        }
    }

    function _generateChallenge(
        uint72 identityId,
        address originalSender
    ) internal returns (RandomSamplingLib.Challenge memory) {
        bytes32 myBlockHash = blockhash(block.number - (identityId % 256));

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

        uint256 knowledgeCollectionId = uint256(pseudoRandomVariable) %
            knowledgeCollectionStorage.getLatestKnowledgeCollectionId();

        uint88 chunksCount = knowledgeCollectionStorage.getKnowledgeCollection(knowledgeCollectionId).byteSize /
            randomSamplingStorage.CHUNK_BYTE_SIZE();
        uint256 chunkId = uint256(pseudoRandomVariable) % chunksCount;
        uint256 activeProofPeriodStartBlock = randomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();

        emit ChallengeCreated(
            identityId,
            chronos.getCurrentEpoch(),
            knowledgeCollectionId,
            chunkId,
            activeProofPeriodStartBlock
        );

        return RandomSamplingLib.Challenge(knowledgeCollectionId, chunkId, activeProofPeriodStartBlock, false);
    }

    // get rewards amount

    // claim rewards
}
