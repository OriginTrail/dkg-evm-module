// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

library ParanetErrors {
    error ParanetHasAlreadyBeenRegistered(address knowledgeAssetStorageAddress, uint256 tokenId);
    error ParanetDoesntExist(address knowledgeAssetStorageAddress, uint256 tokenId);
    error ParanetServiceHasAlreadyBeenRegistered(address knowledgeAssetStorageAddress, uint256 tokenId);
    error ParanetServiceDoesntExist(address knowledgeAssetStorageAddress, uint256 tokenId);
    error KnowledgeAssetSubmitterIsntOwner(
        address paranetKnowledgeAssetStorageContract,
        uint256 paranetTokenId,
        address knowledgeAssetStorageContract,
        uint256 knowledgeAssetTokenId
    );
    error KnowledgeAssetIsAPartOfOtherParanet(
        address paranetKnowledgeAssetStorageContract,
        uint256 paranetTokenId,
        bytes32 paranetId
    );
    error NoOperatorRewardAvailable(bytes32 paranetId);
    error NoKnowledgeMinerRewardAvailable(bytes32 paranetId, address miner);
    error TracTargetAchieved(bytes32 paranetId, uint96 tracTarget);
}
