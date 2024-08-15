// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

library KnowledgeCollectionStructs {
    struct KnowledgeCollection {
        bytes32 merkleRoot;
        uint160 totalChunksNumber;
        uint96 totalTokenAmount;
    }

    struct Shard {
        uint256 shardId;
        uint256 knowledgeCollectionCount;
        mapping(uint256 => KnowledgeCollection) knowledgeCollections;
    }
}
