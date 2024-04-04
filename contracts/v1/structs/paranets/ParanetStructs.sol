// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

library ParanetStructs {
    enum AccessPolicy {
        OPEN
    }

    struct Paranet {
        address knowledgeAssetStorageContract;
        uint256 tokenId;
        address operator;
        AccessPolicy minersAccessPolicy;
        AccessPolicy knowledgeAssetsInclusionPolicy;
        string name;
        string description;
        address incentivesPool;
        uint256 cumulativeKnowledgeValue;
        bytes32[] services;
        // Service ID => Index in the array
        mapping(bytes32 => uint256) implementedServicesIndexes;
        bytes32[] knowledgeMiners;
        // Knowledge Miner ID => Index in the array
        mapping(bytes32 => uint256) registeredKnowledgeMinersIndexes;
        bytes32[] knowledgeAssets;
        // Knowledge Asset ID => Index in the array
        mapping(bytes32 => uint256) registeredKnowledgeAssetsIndexes;
    }

    struct ParanetMetadata {
        address knowledgeAssetStorageContract;
        uint256 tokenId;
        address operator;
        AccessPolicy minersAccessPolicy;
        AccessPolicy knowledgeAssetsInclusionPolicy;
        string name;
        string description;
        uint256 cumulativeKnowledgeValue;
    }

    struct ParanetService {
        address servicesRegistry;
        uint256 id;
        address operator;
        address serviceAddress;
        string name;
        string description;
        bytes metadata;
    }

    struct KnowledgeMiner {
        address addr;
        mapping(bytes32 => KnowledgeAsset[]) submittedKnowledgeAssets;
        mapping(bytes32 => uint256) cumulativeTracSpent;
        mapping(bytes32 => uint256) unrewardedTracSpent;
    }

    struct KnowledgeAsset {
        KnowledgeMiner miner;
        uint256 chainId;
        address knowledgeAssetStorageContract;
        uint256 tokenId;
        bytes metadata;
    }
}
