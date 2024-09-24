// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {ParanetStructs} from "../../structs/paranets/ParanetStructs.sol";

library ParanetErrors {
    error ParanetHasAlreadyBeenRegistered(address knowledgeAssetStorageAddress, uint256 tokenId);
    error InvalidParanetNodesAccessPolicy(
        ParanetStructs.NodesAccessPolicy[] expectedAccessPolicies,
        ParanetStructs.NodesAccessPolicy actualAccessPolicy
    );
    error ParanetCuratedNodeHasAlreadyBeenAdded(bytes32 paranetId, uint72 identityId);
    error ParanetCuratedNodeDoesntExist(bytes32 paranetId, uint72 identityId);
    error ParanetCuratedNodeJoinRequestInvalidStatus(
        bytes32 paranetId,
        uint72 identityId,
        ParanetStructs.RequestStatus status
    );
    error ParanetCuratedNodeJoinRequestDoesntExist(bytes32 paranetId, uint72 identityId);
    error InvalidParanetMinersAccessPolicy(
        ParanetStructs.MinersAccessPolicy[] expectedAccessPolicies,
        ParanetStructs.MinersAccessPolicy actualAccessPolicy
    );
    error ParanetCuratedMinerHasAlreadyBeenAdded(bytes32 paranetId, address miner);
    error ParanetCuratedMinerDoesntExist(bytes32 paranetId, address miner);
    error ParanetCuratedMinerAccessRequestInvalidStatus(
        bytes32 paranetId,
        address miner,
        ParanetStructs.RequestStatus status
    );
    error ParanetCuratedMinerAccessRequestDoesntExist(bytes32 paranetId, address miner);
    error ParanetIncentivesPoolAlreadyExists(
        address knowledgeAssetStorageAddress,
        uint256 tokenId,
        string poolType,
        address poolAddress
    );
    error ParanetDoesntExist(address knowledgeAssetStorageAddress, uint256 tokenId);
    error ParanetServiceHasAlreadyBeenRegistered(address knowledgeAssetStorageAddress, uint256 tokenId);
    error ParanetServiceDoesntExist(address knowledgeAssetStorageAddress, uint256 tokenId);
    error KnowledgeAssetIsAPartOfOtherParanet(
        address paranetKnowledgeAssetStorageContract,
        uint256 paranetTokenId,
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
