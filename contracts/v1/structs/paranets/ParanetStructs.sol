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
        uint96 cumulativeKnowledgeValue;
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
        uint96 cumulativeKnowledgeValue;
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
        uint96 totalTracSpent;
        uint256 totalSubmittedKnowledgeAssetsCount;
        mapping(bytes32 => bytes32[]) submittedKnowledgeAssets;
        mapping(bytes32 => mapping(bytes32 => uint256)) submittedKnowledgeAssetsIndexes;
        mapping(bytes32 => uint96) cumulativeTracSpent;
        mapping(bytes32 => uint96) unrewardedTracSpent;
    }

    struct KnowledgeAsset {
        address knowledgeAssetStorageContract;
        uint256 tokenId;
        address minerAddress;
        bytes32 paranetId;
        bytes metadata;
    }
}
