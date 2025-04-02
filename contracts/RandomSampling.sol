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

contract RandomSampling is INamed, IVersioned, ContractStatus {
    string private constant _NAME = "RandomSampling";
    string private constant _VERSION = "1.0.0";
    uint8 public avgBlockTimeInSeconds;

    IdentityStorage public identityStorage;
    RandomSamplingStorage public rss;
    KnowledgeCollectionStorage public kcs;
    StakingStorage public stakingStorage;
    ProfileStorage public profileStorage;
    EpochStorage public epochStorage;
    Chronos public chronos;
    AskStorage public askStorage;

    event ChallengeCreated(uint256 knowledgeCollectionId, uint256 chunkId, uint256 activeProofPeriodBlock);
    event ValidProofSubmitted(uint72 indexed identityId, uint256 indexed epoch, uint256 score);
    event AvgBlockTimeUpdated(uint256 indexed chainId, uint8 avgBlockTimeInSeconds);
    event ProofingPeriodDurationInBlocksUpdated(uint8 durationInBlocks);

    constructor(address hubAddress, uint8 _avgBlockTimeInSeconds) ContractStatus(hubAddress) {
        avgBlockTimeInSeconds = _avgBlockTimeInSeconds;
    }

    function initialize(uint8 _proofingPeriodDurationInBlocks) external {
        identityStorage = IdentityStorage(hub.getContractAddress("IdentityStorage"));
        rss = RandomSamplingStorage(hub.getContractAddress("RandomSamplingStorage"));
        kcs = KnowledgeCollectionStorage(hub.getContractAddress("KnowledgeCollectionStorage"));
        stakingStorage = StakingStorage(hub.getContractAddress("StakingStorage"));
        profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        epochStorage = EpochStorage(hub.getContractAddress("EpochStorage"));
        chronos = Chronos(hub.getContractAddress("Chronos"));
        askStorage = AskStorage(hub.getContractAddress("AskStorage"));

        rss.setProofingPeriodDurationInBlocks(_proofingPeriodDurationInBlocks);
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

        RandomSamplingLib.Challenge memory nodeChallenge = rss.getNodeChallenge(identityId);

        if (nodeChallenge.activeProofPeriodStartBlock == rss.getActiveProofPeriodStartBlock()) {
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
        rss.setNodeChallenge(identityId, challenge);

        return challenge;
    }

    function computeMerkleRoot(bytes32 chunk, bytes32[] memory merkleProof) public pure returns (bytes32) {
        bytes32 computedHash = keccak256(abi.encodePacked(chunk));

        for (uint256 i = 0; i < merkleProof.length; i++) {
            if (computedHash < merkleProof[i]) {
                computedHash = keccak256(abi.encodePacked(computedHash, merkleProof[i]));
            } else {
                computedHash = keccak256(abi.encodePacked(merkleProof[i], computedHash));
            }
        }

        return computedHash;
    }

    function submitProof(bytes32 chunk, bytes32[] calldata merkleProof) public returns (bool) {
        // Get node identityId
        uint72 identityId = identityStorage.getIdentityId(msg.sender);

        // update the active proof period start block if necessary
        uint256 currentActiveBlock = rss.getActiveProofPeriodStartBlock();

        // Get node challenge
        RandomSamplingLib.Challenge memory challenge = rss.getNodeChallenge(identityId);

        // verify that the challengeId matches the current challenge
        if (challenge.activeProofPeriodStartBlock != currentActiveBlock) {
            // This challenge is no longer active
            return false;
        }

        // Construct the merkle root from chunk and merkleProof
        bytes32 computedMerkleRoot = computeMerkleRoot(chunk, merkleProof);

        // Get the expected merkle root for this challenge
        bytes32 expectedMerkleRoot = kcs.getLatestMerkleRoot(challenge.knowledgeCollectionId);

        // Verify the submitted root matches
        if (computedMerkleRoot == expectedMerkleRoot) {
            // Mark as correct submission and add points to the node
            challenge.solved = true;
            rss.setNodeChallenge(identityId, challenge);

            uint256 epoch = chronos.getCurrentEpoch();
            rss.incrementEpochNodeValidProofsCount(epoch, identityId);

            uint256 SCALING_FACTOR = 1e18;

            // Node stake factor
            uint256 nodeStake = stakingStorage.getNodeStake(identityId);
            uint256 nodeStakeFactor = (2 * ((nodeStake * SCALING_FACTOR) / 2000000) ** 2) / SCALING_FACTOR;

            // Node ask factor
            uint256 nodeAsk = profileStorage.getAsk(identityId);
            (uint256 askLowerBound, uint256 askUpperBound) = askStorage.getAskBounds();
            uint256 nodeAskFactor = (nodeStake *
                (((askUpperBound - nodeAsk) * SCALING_FACTOR) / (askUpperBound - askLowerBound)) ** 2) /
                2 /
                SCALING_FACTOR;

            // Node publishing factor
            uint256 nodePubFactor = epochStorage.getNodeCurrentEpochProducedKnowledgeValue(identityId);
            uint256 nodePublishingFactor = (nodeStakeFactor *
                (nodePubFactor * epochStorage.getCurrentEpochNodeMaxProducedKnowledgeValue())) / SCALING_FACTOR;

            // Node score
            uint256 score = nodeStakeFactor + nodePublishingFactor - nodeAskFactor;
            rss.addToEpochNodeTotalScore(epoch, identityId, score);

            emit ValidProofSubmitted(identityId, epoch, score);

            return true;
        }

        return false;
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

        uint256 knowledgeCollectionId = uint256(pseudoRandomVariable) % kcs.getLatestKnowledgeCollectionId();

        uint88 chunksCount = kcs.getKnowledgeCollection(knowledgeCollectionId).byteSize / rss.CHUNK_BYTE_SIZE();
        uint256 chunkId = uint256(pseudoRandomVariable) % chunksCount;
        uint256 activeProofPeriodStartBlock = rss.getActiveProofPeriodStartBlock();

        emit ChallengeCreated(knowledgeCollectionId, chunkId, activeProofPeriodStartBlock);

        return RandomSamplingLib.Challenge(knowledgeCollectionId, chunkId, activeProofPeriodStartBlock, false);
    }

    function getAllExpectedEpochProofsCount() internal view returns (uint256) {
        uint256 allNodesCount = identityStorage.lastIdentityId();
        uint256 epochLengthInSeconds = chronos.epochLength();
        uint256 maxPossibleNodeProofsInEpoch = epochLengthInSeconds /
            (rss.getProofingPeriodDurationInBlocks() * avgBlockTimeInSeconds);
        return allNodesCount * maxPossibleNodeProofsInEpoch;
    }

    function setAvgBlockTimeInSeconds(uint8 blockTimeInSeconds) external onlyHubOwner {
        avgBlockTimeInSeconds = blockTimeInSeconds;
        emit AvgBlockTimeUpdated(block.chainid, blockTimeInSeconds);
    }

    // get rewards amount

    // claim rewards
}
