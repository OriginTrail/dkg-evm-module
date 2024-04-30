// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

library ParanetErrors {
    error ParanetHasAlreadyBeenRegistered(address knowledgeAssetStorageAddress, uint256 tokenId);
    error ParanetDoesntExist(address knowledgeAssetStorageAddress, uint256 tokenId);
    error KnowledgeAssetSubmitterIsntOwner(
        address paranetKnowledgeAssetStorageContract,
        uint256 paranetTokenId,
        address knowledgeAssetStorageContract,
        uint256 knowledgeAssetTokenId
    );
}
