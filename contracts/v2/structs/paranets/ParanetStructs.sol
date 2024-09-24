// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {UnorderedNamedContractDynamicSetStructs} from "../UnorderedNamedContractDynamicSetStructs.sol";

library ParanetStructs {
    struct UniversalAssetLocator {
        address knowledgeAssetStorageContract;
        uint256 tokenId;
    }

    enum NodesAccessPolicy {
        OPEN,
        CURATED
    }

    enum MinersAccessPolicy {
        OPEN,
        CURATED
    }

    enum KnowledgeAssetsAccessPolicy {
        OPEN
    }

    enum RequestStatus {
        NONE,
        PENDING,
        APPROVED,
        REJECTED
    }

    struct ParanetNodeJoinRequest {
        uint256 createdAt;
        uint256 updatedAt;
        uint72 identityId;
        RequestStatus status;
    }

    struct ParanetKnowledgeMinerAccessRequest {
        uint256 createdAt;
        uint256 updatedAt;
        address miner;
        RequestStatus status;
    }

    struct Paranet {
        address paranetKAStorageContract;
        uint256 paranetKATokenId;
        string name;
        string description;
        NodesAccessPolicy nodesAccessPolicy;
        MinersAccessPolicy minersAccessPolicy;
        KnowledgeAssetsAccessPolicy knowledgeAssetsAccessPolicy;
        uint96 cumulativeKnowledgeValue;
        UnorderedNamedContractDynamicSetStructs.Set incentivesPools;
        uint72[] curatedNodes;
        // Identity ID => Index in the array
        mapping(uint72 => uint256) curatedNodesIndexes;
        // Identity ID => Requests Array
        mapping(uint72 => ParanetNodeJoinRequest[]) paranetNodeJoinRequests;
        bytes32[] services;
        // Service ID => Index in the array
        mapping(bytes32 => uint256) implementedServicesIndexes;
        address[] knowledgeMiners;
        // Knowledge Miner address => Index in the array
        mapping(address => uint256) registeredKnowledgeMinersIndexes;
        // Knowledge Miner address => Requests Array
        mapping(address => ParanetKnowledgeMinerAccessRequest[]) paranetKnowledgeMinerAccessRequests;
        bytes32[] knowledgeAssets;
        // Knowledge Asset ID => Index in the array
        mapping(bytes32 => uint256) registeredKnowledgeAssetsIndexes;
    }

    struct ParanetMetadata {
        address paranetKAStorageContract;
        uint256 paranetKATokenId;
        string name;
        string description;
        NodesAccessPolicy nodesAccessPolicy;
        MinersAccessPolicy minersAccessPolicy;
        KnowledgeAssetsAccessPolicy knowledgeAssetsAccessPolicy;
        uint96 cumulativeKnowledgeValue;
    }

    struct IncentivesPool {
        string poolType;
        address addr;
    }

    struct ParanetService {
        address paranetServiceKAStorageContract;
        uint256 paranetServiceKATokenId;
        string name;
        string description;
        address[] paranetServiceAddresses;
        mapping(address => bool) paranetServiceAddressRegistered;
    }

    struct ParanetServiceMetadata {
        address paranetServiceKAStorageContract;
        uint256 paranetServiceKATokenId;
        string name;
        string description;
        address[] paranetServiceAddresses;
    }

    struct KnowledgeMiner {
        address addr;
        uint96 totalTracSpent;
        uint256 totalSubmittedKnowledgeAssetsCount;
        mapping(bytes32 => bytes32[]) submittedKnowledgeAssets;
        mapping(bytes32 => mapping(bytes32 => uint256)) submittedKnowledgeAssetsIndexes;
        mapping(bytes32 => UpdatingKnowledgeAssetState[]) updatingKnowledgeAssetStates;
        mapping(bytes32 => mapping(bytes32 => uint256)) updatingKnowledgeAssetStateIndexes;
        mapping(bytes32 => uint96) cumulativeTracSpent;
        mapping(bytes32 => uint96) unrewardedTracSpent;
        mapping(bytes32 => uint256) cumulativeAwardedNeuro;
    }

    struct KnowledgeMinerMetadata {
        address addr;
        uint96 totalTracSpent;
        uint256 totalSubmittedKnowledgeAssetsCount;
    }

    struct KnowledgeAsset {
        address knowledgeAssetStorageContract;
        uint256 tokenId;
        address minerAddress;
        bytes32 paranetId;
    }

    struct UpdatingKnowledgeAssetState {
        address knowledgeAssetStorageContract;
        uint256 tokenId;
        bytes32 assertionId;
        uint96 updateTokenAmount;
    }

    struct NeuroEmissionMultiplier {
        uint256 multiplier;
        uint256 timestamp;
        bool finalized;
    }

    struct ParanetIncentivesPoolClaimedRewardsProfile {
        address addr;
        uint256 claimedNeuro;
    }

    struct ParanetIncentivizationProposalVoterInput {
        address addr;
        uint96 weight;
    }

    struct ParanetIncentivizationProposalVoter {
        address addr;
        uint96 weight;
        uint256 claimedNeuro;
    }
}
