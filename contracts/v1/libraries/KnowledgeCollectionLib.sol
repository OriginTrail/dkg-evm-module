// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.16;

library KnowledgeCollectionLib {
    struct KnowledgeCollection {
        address publisher;
        uint256 publishingTime;
        bytes32[] merkleRoots;
        uint256 minted;
        uint256[] burned;
        uint256 byteSize;
        uint256 triplesAmount;
        uint256 chunksAmount;
        uint256 startEpoch;
        uint256 endEpoch;
        uint96 tokenAmount;
    }

    event KnowledgeCollectionCreated(
        uint256 indexed id,
        string publishOperationId,
        address indexed publisher,
        uint256 publishingTime,
        bytes32 merkleRoot,
        uint256 knowledgeAssetsAmount,
        uint256 byteSize,
        uint256 triplesAmount,
        uint256 chunksAmount,
        uint256 startEpoch,
        uint256 endEpoch,
        uint96 tokenAmount
    );
    event KnowledgeCollectionUpdated(
        uint256 indexed id,
        string updateOperationId,
        bytes32 merkleRoot,
        uint256 byteSize,
        uint256 triplesAmount,
        uint256 chunksAmount,
        uint96 tokenAmount
    );
    event KnowledgeAssetsMinted(uint256 indexed id, address indexed to, uint256 startId, uint256 endId);
    event KnowledgeAssetsBurned(uint256 indexed id, address indexed from, uint256[] tokenIds);
    event KnowledgeCollectionPublisherUpdated(uint256 indexed id, address publisher);
    event KnowledgeCollectionPublishingTimeUpdated(uint256 indexed id, uint256 publishingTime);
    event KnowledgeCollectionMerkleRootsUpdated(uint256 indexed id, bytes32[] merkleRoots);
    event KnowledgeCollectionMerkleRootAdded(uint256 indexed id, bytes32 merkleRoot);
    event KnowledgeCollectionMerkleRootRemoved(uint256 indexed id, bytes32 merkleRoot);
    event KnowledgeCollectionMintedUpdated(uint256 indexed id, uint256 minted);
    event KnowledgeCollectionBurnedUpdated(uint256 indexed id, uint256[] burned);
    event KnowledgeCollectionByteSizeUpdated(uint256 indexed id, uint256 byteSize);
    event KnowledgeCollectionTriplesAmountUpdated(uint256 indexed id, uint256 triplesAmount);
    event KnowledgeCollectionChunksAmountUpdated(uint256 indexed id, uint256 chunksAmount);
    event KnowledgeCollectionTokenAmountUpdated(uint256 indexed id, uint256 tokenAmount);
    event KnowledgeCollectionStartEpochUpdated(uint256 indexed id, uint256 startEpoch);
    event KnowledgeCollectionEndEpochUpdated(uint256 indexed id, uint256 endEpoch);
    event URIUpdate(string newURI);

    error InvalidTokenAmount(uint96 expectedTokenAMount, uint96 tokenAmount);
    error InvalidSignature(uint72 identityId, bytes32 messageHash, bytes32 r, bytes32 vs);
    error SignerIsNotNodeOperator(uint72 identityId, address signer);
    error KnowledgeCollectionExpired(uint256 id, uint256 currentEpoch, uint256 endEpoch);
    error NotPartOfKnowledgeCollection(uint256 id, uint256 tokenId);
    error SignaturesSignersMismatch(uint256 rAmount, uint256 vsAmount, uint256 identityIdsAmount);
    error MinSignaturesRequirementNotMet(uint256 requiredSignatures, uint256 receivedSignatures);
}
