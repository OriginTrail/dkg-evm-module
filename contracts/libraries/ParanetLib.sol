// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {UnorderedNamedContractDynamicSet} from "./UnorderedNamedContractDynamicSet.sol";

library ParanetLib {
    uint24 constant TOKENS_DIGITS_DIFF = 10 ** 6;
    uint64 constant EMISSION_MULTIPLIER_SCALING_FACTOR = 10 ** 18;
    uint16 constant PERCENTAGE_SCALING_FACTOR = 10 ** 4;
    uint16 constant MAX_CUMULATIVE_VOTERS_WEIGHT = 10 ** 4;

    struct UniversalCollectionLocator {
        address knowledgeCollectionStorageContract;
        uint256 knowledgeCollectionTokenId;
    }

    struct UniversalAssetLocator {
        address knowledgeCollectionStorageContract;
        uint256 knowledgeCollectionTokenId;
        uint256 knowledgeAssetTokenId;
    }

    enum NodesAccessPolicy {
        OPEN,
        CURATED
    }

    enum MinersAccessPolicy {
        OPEN,
        CURATED
    }

    enum KnowledgeCollectionsAccessPolicy {
        OPEN
    }

    struct Node {
        uint72 identityId;
        bytes nodeId;
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

    struct IncentivesPool {
        string name;
        address storageAddr;
        address rewardTokenAddress;
    }

    struct Paranet {
        address paranetKCStorageContract;
        uint256 paranetKCTokenId;
        uint256 paranetKATokenId;
        string name;
        string description;
        NodesAccessPolicy nodesAccessPolicy;
        MinersAccessPolicy minersAccessPolicy;
        KnowledgeCollectionsAccessPolicy knowledgeCollectionsAccessPolicy;
        uint96 cumulativeKnowledgeValue;
        IncentivesPool[] incentivesPools;
        mapping(string => uint256) incentivesPoolsByNameIndexes;
        mapping(address => uint256) incentivesPoolsByStorageAddressIndexes;
        Node[] curatedNodes;
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
        bytes32[] knowledgeCollections;
        // Knowledge Collection ID => Index in the array
        mapping(bytes32 => uint256) registeredKnowledgeCollectionsIndexes;
    }

    struct ParanetMetadata {
        address paranetKCStorageContract;
        uint256 paranetKCTokenId;
        uint256 paranetKATokenId;
        string name;
        string description;
        NodesAccessPolicy nodesAccessPolicy;
        MinersAccessPolicy minersAccessPolicy;
        KnowledgeCollectionsAccessPolicy knowledgeCollectionsAccessPolicy;
        uint96 cumulativeKnowledgeValue;
    }

    struct ParanetService {
        address paranetServiceKCStorageContract;
        uint256 paranetServiceKCTokenId;
        uint256 paranetServiceKATokenId;
        string name;
        string description;
        address[] paranetServiceAddresses;
        mapping(address => bool) paranetServiceAddressRegistered;
    }

    struct ParanetServiceMetadata {
        address paranetServiceKCStorageContract;
        uint256 paranetServiceKCTokenId;
        uint256 paranetServiceKATokenId;
        string name;
        string description;
        address[] paranetServiceAddresses;
    }

    struct KnowledgeMiner {
        address addr;
        uint96 totalTracSpent;
        uint256 totalSubmittedKnowledgeCollectionsCount;
        mapping(bytes32 => bytes32[]) submittedKnowledgeCollections;
        mapping(bytes32 => mapping(bytes32 => uint256)) submittedKnowledgeCollectionsIndexes;
        mapping(bytes32 => UpdatingKnowledgeCollectionState[]) updatingKnowledgeCollectionsStates;
        mapping(bytes32 => mapping(bytes32 => uint256)) updatingKnowledgeCollectionsStateIndexes;
        mapping(bytes32 => uint96) cumulativeTracSpent;
        mapping(bytes32 => uint96) unrewardedTracSpent;
        mapping(bytes32 => uint256) cumulativeAwardedNeuro;
    }

    struct KnowledgeMinerMetadata {
        address addr;
        uint96 totalTracSpent;
        uint256 totalSubmittedKnowledgeCollectionsCount;
    }

    struct KnowledgeCollection {
        address knowledgeCollectionStorageContract;
        uint256 knowledgeCollectionTokenId;
        address minerAddress;
        bytes32 paranetId;
    }

    struct UpdatingKnowledgeCollectionState {
        address knowledgeCollectionStorageContract;
        uint256 knowledgeCollectionId;
        bytes32 merkleRoot;
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

    error ParanetHasAlreadyBeenRegistered(
        address knowledgeCollectionStorageAddress,
        uint256 knowledgeCollectionTokenId,
        uint256 knowledgeAssetTokenId
    );
    error InvalidParanetNodesAccessPolicy(
        ParanetLib.NodesAccessPolicy[] expectedAccessPolicies,
        ParanetLib.NodesAccessPolicy actualAccessPolicy
    );
    error ParanetCuratedNodeHasAlreadyBeenAdded(bytes32 paranetId, uint72 identityId);
    error ParanetCuratedNodeDoesntExist(bytes32 paranetId, uint72 identityId);
    error ParanetCuratedNodeJoinRequestInvalidStatus(
        bytes32 paranetId,
        uint72 identityId,
        ParanetLib.RequestStatus status
    );
    error ParanetCuratedNodeJoinRequestDoesntExist(bytes32 paranetId, uint72 identityId);
    error InvalidParanetMinersAccessPolicy(
        ParanetLib.MinersAccessPolicy[] expectedAccessPolicies,
        ParanetLib.MinersAccessPolicy actualAccessPolicy
    );
    error ParanetCuratedMinerHasAlreadyBeenAdded(bytes32 paranetId, address miner);
    error ParanetCuratedMinerDoesntExist(bytes32 paranetId, address miner);
    error ParanetCuratedMinerAccessRequestInvalidStatus(
        bytes32 paranetId,
        address miner,
        ParanetLib.RequestStatus status
    );
    error ParanetCuratedMinerAccessRequestDoesntExist(bytes32 paranetId, address miner);
    error ParanetIncentivesPoolAlreadyExists(
        address knowledgeCollectionStorageAddress,
        uint256 knowledgeCollectionTokenId,
        uint256 knowledgeAssetTokenId,
        string poolType,
        address poolAddress
    );
    error ParanetDoesntExist(
        address knowledgeCollectionStorageAddress,
        uint256 knowledgeCollectionTokenId,
        uint256 knowledgeAssetTokenId
    );
    error ParanetServiceHasAlreadyBeenRegistered(
        address knowledgeCollectionStorageAddress,
        uint256 knowledgeCollectionTokenId,
        uint256 knowledgeAssetTokenId
    );
    error ParanetServiceDoesntExist(
        address knowledgeCollectionStorageAddress,
        uint256 knowledgeCollectionTokenId,
        uint256 knowledgeAssetTokenId
    );
    error KnowledgeCollectionIsAPartOfOtherParanet(
        address paranetKnowledgeCollectionStorageAddress,
        uint256 paranetKnowledgeCollectionTokenId,
        bytes32 paranetId
    );
    error NoRewardAvailable(bytes32 paranetId, address claimer);
    error ParanetServiceHasAlreadyBeenAdded(bytes32 paranetId, bytes32 paranetServiceId);
    error InvalidCumulativeVotersWeight(
        bytes32 paranetId,
        uint96 currentCumulativeWeight,
        uint96 targetCumulativeWeight
    );
}
