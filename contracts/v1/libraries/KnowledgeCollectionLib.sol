// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.16;

library KnowledgeCollectionLib {
    struct KnowledgeCollection {
        address publisher;
        uint256 publishingTime;
        bytes32 merkleRoot;
        uint256 minted;
        uint256[] burned;
        uint256 byteSize;
        uint256 triplesAmount;
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
    error InvalidPublisherNodeSignature(uint72 identityId, address signer, bytes32 messageHash, bytes32 r, bytes32 vs);
    error InvalidReplicationSignatures(
        uint72[] identityIds,
        address[] signers,
        bytes32 messageHash,
        bytes32[] r,
        bytes32[] vs
    );
    error KnowledgeCollectionExpired(uint256 id, uint256 currentEpoch, uint256 endEpoch);
    error NotPartOfKnowledgeCollection(uint256 id, uint256 tokenId);
    error SignaturesSignersMismatch(
        uint256 rAmount,
        uint256 vsAmount,
        uint256 identityIdsAmount,
        uint256 signersAmount
    );
    error MinSignaturesRequirementNotMet(uint256 requiredSignatures, uint256 receivedSignatures);
}
