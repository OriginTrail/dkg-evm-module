// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

library ParanetErrors {
    error ParanetHasAlreadyBeenRegistered(address knowledgeAssetStorageAddress, uint256 tokenId);
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
