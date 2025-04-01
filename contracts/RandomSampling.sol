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

contract RandomSampling is INamed, IVersioned, ContractStatus, IInitializable {
    string private constant _NAME = "RandomSampling";
    string private constant _VERSION = "1.0.0";

    IdentityStorage public identityStorage;
    RandomSamplingStorage public rss;
    KnowledgeCollectionStorage public kcs;

    event ChallengeCreated(uint256 knowledgeCollectionId, uint256 chunkId, uint256 activeProofPeriodBlock);

    constructor(address hubAddress) ContractStatus(hubAddress) {}

    function initialize() external override {
        identityStorage = IdentityStorage(hub.getContractAddress("IdentityStorage"));
        rss = RandomSamplingStorage(hub.getContractAddress("RandomSamplingStorage"));
        kcs = KnowledgeCollectionStorage(hub.getContractAddress("KnowledgeCollectionStorage"));
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

        // update the active proof period start block if necessary
        uint8 chainProofingPeriodDurationInBlocks = rss.getChainProofingPeriodDurationInBlocks(block.chainid);
        if (block.number > rss.getActiveProofPeriodStartBlock() + chainProofingPeriodDurationInBlocks) {
            rss.setActiveProofPeriodStartBlock(block.number - (block.number % chainProofingPeriodDurationInBlocks));
        }

        RandomSamplingLib.Challenge memory nodeChallenge = rss.getNodeChallenge(identityId);

        // If node has already participated in the challenge, return an empty challenge
        if (nodeChallenge.solved == true) {
            return RandomSamplingLib.Challenge(0, 0, 0, false);
        }

        // If the challenge for this node exists but has not been solved yet, return the existing challenge
        if (
            nodeChallenge.activeProofPeriodStartBlock == rss.getActiveProofPeriodStartBlock() &&
            nodeChallenge.knowledgeCollectionId != 0
        ) {
            return nodeChallenge;
        }

        // Generate a new challenge
        RandomSamplingLib.Challenge memory challenge = _generateChallenge(identityId, msg.sender);

        // Store the new challenge in the storage contract
        rss.setNodeChallenge(identityId, challenge);

        return challenge;
    }

    function _generateChallenge(
        uint72 identityId,
        address originalSender
    ) internal returns (RandomSamplingLib.Challenge memory) {
        bytes32 myBlockHash = blockhash(block.number - (identityId % 256));

        bytes32 pseudoRandomVariable = keccak256(
            abi.encodePacked(
                block.prevrandao,
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
}
