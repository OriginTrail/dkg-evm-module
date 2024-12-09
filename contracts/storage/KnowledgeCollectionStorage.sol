// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {Guardian} from "../Guardian.sol";
import {ERC1155Delta} from "../tokens/ERC1155Delta.sol";
import {KnowledgeCollectionLib} from "../libraries/KnowledgeCollectionLib.sol";
import {INamed} from "../interfaces/INamed.sol";
import {IVersioned} from "../interfaces/IVersioned.sol";
import {HubDependent} from "../abstract/HubDependent.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {LibBitmap} from "solady/src/utils/LibBitmap.sol";

contract KnowledgeCollectionStorage is INamed, IVersioned, HubDependent, ERC1155Delta, Guardian {
    using LibBitmap for LibBitmap.Bitmap;

    string private constant _NAME = "KnowledgeCollectionStorage";
    string private constant _VERSION = "1.0.0";

    uint256 public immutable knowledgeCollectionMaxSize;

    uint256 private _knowledgeCollectionsCounter;

    uint256 private _totalMintedKnowledgeAssetsCounter;
    uint256 private _totalBurnedKnowledgeAssetsCounter;
    uint256 private _totalByteSize;
    uint256 private _totalTriplesCounter;
    uint256 private _totalChunksCounter;
    uint96 private _totalTokenAmount;

    uint96 private _cumulativeKnowledgeValue;

    mapping(uint256 => KnowledgeCollectionLib.KnowledgeCollection) public knowledgeCollections;
    mapping(uint256 => bool) public isKnowledgeAssetBurned;

    constructor(
        address hubAddress,
        uint256 _knowledgeCollectionMaxSize,
        string memory uri
    ) ERC1155Delta(uri) Guardian(hubAddress) {
        knowledgeCollectionMaxSize = _knowledgeCollectionMaxSize;
    }

    function name() public pure virtual returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual returns (string memory) {
        return _VERSION;
    }

    function createKnowledgeCollection(
        bytes32 merkleRoot,
        uint256 knowledgeAssetsAmount,
        uint256 byteSize,
        uint256 triplesAmount,
        uint256 chunksAmount,
        uint256 startEpoch,
        uint256 endEpoch,
        uint96 tokenAmount
    ) external onlyContracts returns (uint256) {
        uint256 knowledgeCollectionId = ++_knowledgeCollectionsCounter;

        knowledgeCollections[knowledgeCollectionId] = KnowledgeCollectionLib.KnowledgeCollection({
            publisher: msg.sender,
            publishingTime: block.timestamp,
            merkleRoot: merkleRoot,
            minted: knowledgeAssetsAmount,
            burned: new uint256[](0),
            byteSize: byteSize,
            triplesAmount: triplesAmount,
            chunksAmount: chunksAmount,
            startEpoch: startEpoch,
            endEpoch: endEpoch,
            tokenAmount: tokenAmount
        });

        _totalByteSize += byteSize;
        _totalTriplesCounter += triplesAmount;
        _totalChunksCounter += chunksAmount;
        _totalTokenAmount += tokenAmount;

        return knowledgeCollectionId;
    }

    function getKnowledgeCollection(
        uint256 id
    ) external view returns (KnowledgeCollectionLib.KnowledgeCollection memory) {
        return knowledgeCollections[id];
    }

    function updateKnowledgeCollection(
        uint256 id,
        bytes32 merkleRoot,
        uint256 byteSize,
        uint256 triplesAmount,
        uint256 chunksAmount,
        uint96 tokenAmount
    ) external onlyContracts {
        KnowledgeCollectionLib.KnowledgeCollection storage kc = knowledgeCollections[id];

        _totalByteSize = _totalByteSize - kc.byteSize + byteSize;
        _totalTriplesCounter = _totalTriplesCounter - kc.triplesAmount + triplesAmount;
        _totalChunksCounter = _totalChunksCounter - kc.chunksAmount + chunksAmount;
        _totalTokenAmount = _totalTokenAmount - kc.tokenAmount + tokenAmount;

        kc.merkleRoot = merkleRoot;
        kc.byteSize = byteSize;
        kc.triplesAmount = triplesAmount;
        kc.chunksAmount = chunksAmount;
        kc.tokenAmount = tokenAmount;
    }

    function getKnowledgeCollectionMetadata(
        uint256 id
    )
        external
        view
        returns (
            address,
            uint256,
            bytes32,
            uint256,
            uint256[] memory,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint96
        )
    {
        KnowledgeCollectionLib.KnowledgeCollection memory kc = knowledgeCollections[id];

        return (
            kc.publisher,
            kc.publishingTime,
            kc.merkleRoot,
            kc.minted,
            kc.burned,
            kc.byteSize,
            kc.triplesAmount,
            kc.chunksAmount,
            kc.startEpoch,
            kc.endEpoch,
            kc.tokenAmount
        );
    }

    function mintKnowledgeAssetsTokens(uint256 id, address to, uint256 amount) external onlyContracts {
        KnowledgeCollectionLib.KnowledgeCollection storage kc = knowledgeCollections[id];
        require(kc.minted + amount <= knowledgeCollectionMaxSize, "Max size exceeded");

        uint256 startTokenId = (id - 1) * knowledgeCollectionMaxSize + _startTokenId() + kc.minted;
        _setCurrentIndex(startTokenId);

        kc.minted += amount;

        _totalMintedKnowledgeAssetsCounter += amount;

        _mint(to, amount);
    }

    function burnKnowledgeAssetsTokens(uint256 id, address from, uint256[] calldata tokenIds) external onlyContracts {
        _burnBatch(id, from, tokenIds);
    }

    function getPublisher(uint256 id) external view returns (address) {
        return knowledgeCollections[id].publisher;
    }

    function setPublisher(uint256 id, address _publisher) external onlyContracts {
        knowledgeCollections[id].publisher = _publisher;
    }

    function getPublishingTime(uint256 id) external view returns (uint256) {
        return knowledgeCollections[id].publishingTime;
    }

    function setPublishingTime(uint256 id, uint256 _publishingTime) external onlyContracts {
        knowledgeCollections[id].publishingTime = _publishingTime;
    }

    function getMerkleRoot(uint256 id) external view returns (bytes32) {
        return knowledgeCollections[id].merkleRoot;
    }

    function setMerkleRoot(uint256 id, bytes32 _merkleRoot) external onlyContracts {
        knowledgeCollections[id].merkleRoot = _merkleRoot;
    }

    function getMinted(uint256 id) external view returns (uint256) {
        return knowledgeCollections[id].minted;
    }

    function setMinted(uint256 id, uint256 _minted) external onlyContracts {
        knowledgeCollections[id].minted = _minted;
    }

    function getBurned(uint256 id) external view returns (uint256[] memory) {
        return knowledgeCollections[id].burned;
    }

    function getBurnedAmount(uint256 id) external view returns (uint256) {
        return knowledgeCollections[id].burned.length;
    }

    function setBurned(uint256 id, uint256[] calldata _burned) external onlyContracts {
        knowledgeCollections[id].burned = _burned;
    }

    function getByteSize(uint256 id) external view returns (uint256) {
        return knowledgeCollections[id].byteSize;
    }

    function setByteSize(uint256 id, uint256 _byteSize) external onlyContracts {
        _totalByteSize = _totalByteSize - knowledgeCollections[id].byteSize + _byteSize;
        knowledgeCollections[id].byteSize = _byteSize;
    }

    function getTriplesAmount(uint256 id) external view returns (uint256) {
        return knowledgeCollections[id].triplesAmount;
    }

    function setTriplesAmount(uint256 id, uint256 _triplesAmount) external onlyContracts {
        _totalTriplesCounter = _totalTriplesCounter - knowledgeCollections[id].triplesAmount + _triplesAmount;
        knowledgeCollections[id].triplesAmount = _triplesAmount;
    }

    function getChunksAmount(uint256 id) external view returns (uint256) {
        return knowledgeCollections[id].chunksAmount;
    }

    function setChunksAmount(uint256 id, uint256 _chunksAmount) external onlyContracts {
        _totalChunksCounter = _totalChunksCounter - knowledgeCollections[id].chunksAmount + _chunksAmount;
        knowledgeCollections[id].chunksAmount = _chunksAmount;
    }

    function getTokenAmount(uint256 id) external view returns (uint96) {
        return knowledgeCollections[id].tokenAmount;
    }

    function setTokenAmount(uint256 id, uint96 _tokenAmount) external onlyContracts {
        _totalTokenAmount = _totalTokenAmount - knowledgeCollections[id].tokenAmount + _tokenAmount;
        knowledgeCollections[id].tokenAmount = _tokenAmount;
    }

    function getStartEpoch(uint256 id) external view returns (uint256) {
        return knowledgeCollections[id].startEpoch;
    }

    function setStartEpoch(uint256 id, uint256 _startEpoch) external onlyContracts {
        knowledgeCollections[id].startEpoch = _startEpoch;
    }

    function getEndEpoch(uint256 id) external view returns (uint256) {
        return knowledgeCollections[id].endEpoch;
    }

    function setEndEpoch(uint256 id, uint256 _endEpoch) external onlyContracts {
        knowledgeCollections[id].endEpoch = _endEpoch;
    }

    function getLatestKnowledgeCollectionId() external view returns (uint256) {
        return _knowledgeCollectionsCounter;
    }

    function currentTotalSupply() external view returns (uint256) {
        return _totalMintedKnowledgeAssetsCounter - _totalBurnedKnowledgeAssetsCounter;
    }

    function totalMinted() external view returns (uint256) {
        return _totalMintedKnowledgeAssetsCounter;
    }

    function totalBurned() external view returns (uint256) {
        return _totalBurnedKnowledgeAssetsCounter;
    }

    function getTotalByteSize() external view returns (uint256) {
        return _totalByteSize;
    }

    function getTotalTriplesAmount() external view returns (uint256) {
        return _totalTriplesCounter;
    }

    function getTotalChunksAmount() external view returns (uint256) {
        return _totalChunksCounter;
    }

    function getTotalTokenAmount() external view returns (uint96) {
        return _totalTokenAmount;
    }

    function isPartOfKnowledgeCollection(uint256 id, uint256 tokenId) external view returns (bool) {
        uint256 startTokenId = (id - 1) * knowledgeCollectionMaxSize + _startTokenId();
        return (!isKnowledgeAssetBurned[tokenId] &&
            startTokenId <= tokenId &&
            tokenId < startTokenId + knowledgeCollections[id].minted);
    }

    function getKnowledgeCollectionId(uint256 tokenId) external view returns (uint256) {
        require(tokenId >= _startTokenId(), "Invalid tokenId: Below start token ID");

        if (isKnowledgeAssetBurned[tokenId]) {
            return 0;
        }

        return ((tokenId - _startTokenId()) / knowledgeCollectionMaxSize) + 1;
    }

    function getKnowledgeAssetsRange(uint256 id) external view returns (uint256, uint256, uint256[] memory) {
        KnowledgeCollectionLib.KnowledgeCollection memory kc = knowledgeCollections[id];
        uint256 startTokenId = (id - 1) * knowledgeCollectionMaxSize + _startTokenId();
        uint256 endTokenId = startTokenId + kc.minted - 1;
        return (startTokenId, endTokenId, kc.burned);
    }

    function getKnowledgeAssetsAmount(uint256 id) external view returns (uint256) {
        KnowledgeCollectionLib.KnowledgeCollection memory kc = knowledgeCollections[id];
        uint256 startTokenId = (id - 1) * knowledgeCollectionMaxSize + _startTokenId();
        uint256 endTokenId = startTokenId + kc.minted - 1;
        return startTokenId + endTokenId - kc.burned.length;
    }

    function setURI(string memory baseURI) external onlyHub {
        _setURI(baseURI);

        emit KnowledgeCollectionLib.URIUpdate(baseURI);
    }

    function _setCurrentIndex(uint256 index) internal virtual {
        _currentIndex = index;
    }

    function _burnBatch(uint256 id, address from, uint256[] calldata tokenIds) internal virtual {
        if (from == address(0)) {
            revert BurnFromZeroAddress();
        }

        address operator = _msgSender();

        KnowledgeCollectionLib.KnowledgeCollection storage kc = knowledgeCollections[id];

        uint256 startTokenId = (id - 1) * knowledgeCollectionMaxSize + _startTokenId();

        _beforeTokenTransfer(operator, from, address(0), tokenIds);

        uint256[] memory amounts = new uint256[](tokenIds.length);

        unchecked {
            for (uint256 i = 0; i < tokenIds.length; i++) {
                uint256 tokenId = tokenIds[i];

                if (startTokenId <= tokenId && tokenId < startTokenId + kc.minted) {
                    revert KnowledgeCollectionLib.NotPartOfKnowledgeCollection(id, tokenId);
                }

                amounts[i] = 1;
                if (!_owned[from].get(tokenId)) {
                    revert BurnFromNonOnwerAddress();
                }
                _owned[from].unset(tokenId);

                kc.burned.push(tokenId);
            }

            _totalBurnedKnowledgeAssetsCounter += tokenIds.length;
        }

        emit TransferBatch(operator, from, address(0), tokenIds, amounts);

        _afterTokenTransfer(operator, from, address(0), tokenIds);
    }
}
