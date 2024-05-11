// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

library ParanetStructs {
    enum AccessPolicy {
        OPEN
    }

    struct UniversalAssetLocator {
        address knowledgeAssetStorageContract;
        uint256 tokenId;
    }

    struct Paranet {
        address paranetKAStorageContract;
        uint256 paranetKATokenId;
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
        address[] knowledgeMiners;
        // Knowledge Miner address => Index in the array
        mapping(address => uint256) registeredKnowledgeMinersIndexes;
        bytes32[] knowledgeAssets;
        // Knowledge Asset ID => Index in the array
        mapping(bytes32 => uint256) registeredKnowledgeAssetsIndexes;
    }

    struct ParanetMetadata {
        address paranetKAStorageContract;
        uint256 paranetKATokenId;
        address operator;
        AccessPolicy minersAccessPolicy;
        AccessPolicy knowledgeAssetsInclusionPolicy;
        string name;
        string description;
        uint96 cumulativeKnowledgeValue;
    }

    struct ParanetService {
        address paranetServiceKAStorageContract;
        uint256 paranetServiceKATokenId;
        address operator;
        address worker;
        string name;
        string description;
        bytes metadata;
    }

    struct KnowledgeMiner {
        address addr;
        uint96 totalTracSpent;
        uint256 totalSubmittedKnowledgeAssetsCount;
        bytes metadata;
        mapping(bytes32 => bytes32[]) submittedKnowledgeAssets;
        mapping(bytes32 => mapping(bytes32 => uint256)) submittedKnowledgeAssetsIndexes;
        mapping(bytes32 => UpdatingKnowledgeAssetState[]) updatingKnowledgeAssets;
        mapping(bytes32 => mapping(bytes32 => uint256)) updatingKnowledgeAssetsIndexes;
        mapping(bytes32 => uint96) cumulativeTracSpent;
        mapping(bytes32 => uint96) unrewardedTracSpent;
        mapping(bytes32 => uint256) cumulativeAwardedNeuro;
    }

    struct KnowledgeMinerMetadata {
        address addr;
        uint96 totalTracSpent;
        uint256 totalSubmittedKnowledgeAssetsCount;
        bytes metadata;
    }

    struct KnowledgeAsset {
        address knowledgeAssetStorageContract;
        uint256 tokenId;
        address minerAddress;
        bytes32 paranetId;
        bytes metadata;
    }

    struct UpdatingKnowledgeAssetState {
        address knowledgeAssetStorageContract;
        uint256 tokenId;
        bytes32 assertionId;
        uint96 updateTokenAmount;
    }
}
