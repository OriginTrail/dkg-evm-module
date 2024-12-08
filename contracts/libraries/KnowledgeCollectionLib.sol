// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

library KnowledgeCollectionLib {
    struct KnowledgeCollection {
        address publisher;
        bytes32 merkleRoot;
        uint256 minted;
        uint256[] burned;
        uint256 byteSize;
        uint256 chunksAmount;
        uint256 startEpoch;
        uint256 endEpoch;
        uint96 tokenAmount;
    }

    event KnowledgeCollectionCreated();
    event KnowledgeAssetsMinted();
    event KnowledgeAssetsBurned();
    event URIUpdate(string baseURI);

    error InvalidTokenAmount(uint96 expectedTokenAMount, uint96 tokenAmount);
    error InvalidSignatures(uint72[] identityIds, address[] signers, bytes[] signatures, bytes32 message);
    error KnowledgeCollectionExpired(uint256 id, uint256 currentEpoch, uint256 endEpoch);
    error NotPartOfKnowledgeCollection(uint256 id, uint256 tokenId);
    error SignaturesSignersMismatch(uint256 signaturesAmount, uint256 identityIdsAmount, uint256 signersAmount);
    error MinSignaturesRequirementNotMet(uint256 requiredSignatures, uint256 receivedSignatures);
}
