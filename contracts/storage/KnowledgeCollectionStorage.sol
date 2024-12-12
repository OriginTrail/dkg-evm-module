// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {Guardian} from "../Guardian.sol";
import {ERC1155Delta} from "../tokens/ERC1155Delta.sol";
import {KnowledgeCollectionLib} from "../libraries/KnowledgeCollectionLib.sol";
import {IERC1155DeltaQueryable} from "../interfaces/IERC1155DeltaQueryable.sol";
import {INamed} from "../interfaces/INamed.sol";
import {IVersioned} from "../interfaces/IVersioned.sol";
import {HubDependent} from "../abstract/HubDependent.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {LibBitmap} from "solady/src/utils/LibBitmap.sol";

contract KnowledgeCollectionStorage is
    INamed,
    IVersioned,
    HubDependent,
    IERC1155DeltaQueryable,
    ERC1155Delta,
    Guardian
{
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
        string calldata publishOperationId,
        bytes32 merkleRoot,
        uint256 knowledgeAssetsAmount,
        uint256 byteSize,
        uint256 triplesAmount,
        uint256 chunksAmount,
        uint256 startEpoch,
        uint256 endEpoch,
        uint96 tokenAmount
    ) external onlyContracts returns (uint256) {
        uint256 knowledgeCollectionId = _knowledgeCollectionsCounter++;

        KnowledgeCollectionLib.KnowledgeCollection storage kc = knowledgeCollections[knowledgeCollectionId];

        kc.publisher = msg.sender;
        kc.publishingTime = block.timestamp;
        kc.merkleRoots.push(merkleRoot);
        kc.minted = knowledgeAssetsAmount;
        kc.byteSize = byteSize;
        kc.triplesAmount = triplesAmount;
        kc.chunksAmount = chunksAmount;
        kc.startEpoch = startEpoch;
        kc.endEpoch = endEpoch;
        kc.tokenAmount = tokenAmount;

        _totalByteSize += byteSize;
        _totalTriplesCounter += triplesAmount;
        _totalChunksCounter += chunksAmount;
        _totalTokenAmount += tokenAmount;

        emit KnowledgeCollectionLib.KnowledgeCollectionCreated(
            knowledgeCollectionId,
            publishOperationId,
            msg.sender,
            block.timestamp,
            merkleRoot,
            knowledgeAssetsAmount,
            byteSize,
            triplesAmount,
            chunksAmount,
            startEpoch,
            endEpoch,
            tokenAmount
        );

        return knowledgeCollectionId;
    }

    function getKnowledgeCollection(
        uint256 id
    ) external view returns (KnowledgeCollectionLib.KnowledgeCollection memory) {
        return knowledgeCollections[id];
    }

    function updateKnowledgeCollection(
        uint256 id,
        string calldata updateOperationId,
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

        kc.merkleRoots.push(merkleRoot);
        kc.byteSize = byteSize;
        kc.triplesAmount = triplesAmount;
        kc.chunksAmount = chunksAmount;
        kc.tokenAmount = tokenAmount;

        emit KnowledgeCollectionLib.KnowledgeCollectionUpdated(
            id,
            updateOperationId,
            merkleRoot,
            byteSize,
            triplesAmount,
            chunksAmount,
            tokenAmount
        );
    }

    function getKnowledgeCollectionMetadata(
        uint256 id
    )
        external
        view
        returns (
            address,
            uint256,
            bytes32[] memory,
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
            kc.merkleRoots,
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

        emit KnowledgeCollectionLib.KnowledgeAssetsMinted(id, to, startTokenId, startTokenId + amount);
    }

    function burnKnowledgeAssetsTokens(uint256 id, address from, uint256[] calldata tokenIds) external onlyContracts {
        _burnBatch(id, from, tokenIds);

        emit KnowledgeCollectionLib.KnowledgeAssetsBurned(id, from, tokenIds);
    }

    function getPublisher(uint256 id) external view returns (address) {
        return knowledgeCollections[id].publisher;
    }

    function setPublisher(uint256 id, address _publisher) external onlyContracts {
        knowledgeCollections[id].publisher = _publisher;

        emit KnowledgeCollectionLib.KnowledgeCollectionPublisherUpdated(id, _publisher);
    }

    function getPublishingTime(uint256 id) external view returns (uint256) {
        return knowledgeCollections[id].publishingTime;
    }

    function setPublishingTime(uint256 id, uint256 _publishingTime) external onlyContracts {
        knowledgeCollections[id].publishingTime = _publishingTime;

        emit KnowledgeCollectionLib.KnowledgeCollectionPublishingTimeUpdated(id, _publishingTime);
    }

    function getMerkleRoots(uint256 id) external view returns (bytes32[] memory) {
        return knowledgeCollections[id].merkleRoots;
    }

    function setMerkleRoots(uint256 id, bytes32[] memory _merkleRoots) external onlyContracts {
        knowledgeCollections[id].merkleRoots = _merkleRoots;

        emit KnowledgeCollectionLib.KnowledgeCollectionMerkleRootsUpdated(id, _merkleRoots);
    }

    function getMerkleRootByIndex(uint256 id, uint256 index) external view returns (bytes32) {
        return knowledgeCollections[id].merkleRoots[index];
    }

    function getLatestMerkleRoot(uint256 id) external view returns (bytes32) {
        KnowledgeCollectionLib.KnowledgeCollection memory kc = knowledgeCollections[id];
        return kc.merkleRoots[kc.merkleRoots.length - 1];
    }

    function pushMerkleRoot(uint256 id, bytes32 merkleRoot) external onlyContracts {
        knowledgeCollections[id].merkleRoots.push(merkleRoot);

        emit KnowledgeCollectionLib.KnowledgeCollectionMerkleRootAdded(id, merkleRoot);
    }

    function popMerkleRoot(uint256 id) external onlyContracts {
        KnowledgeCollectionLib.KnowledgeCollection memory kc = knowledgeCollections[id];
        bytes32 latestMerkleRoot = kc.merkleRoots[kc.merkleRoots.length - 1];
        knowledgeCollections[id].merkleRoots.pop();

        emit KnowledgeCollectionLib.KnowledgeCollectionMerkleRootRemoved(id, latestMerkleRoot);
    }

    function getMinted(uint256 id) external view returns (uint256) {
        return knowledgeCollections[id].minted;
    }

    function setMinted(uint256 id, uint256 _minted) external onlyContracts {
        knowledgeCollections[id].minted = _minted;

        emit KnowledgeCollectionLib.KnowledgeCollectionMintedUpdated(id, _minted);
    }

    function getBurned(uint256 id) external view returns (uint256[] memory) {
        return knowledgeCollections[id].burned;
    }

    function getBurnedAmount(uint256 id) external view returns (uint256) {
        return knowledgeCollections[id].burned.length;
    }

    function setBurned(uint256 id, uint256[] calldata _burned) external onlyContracts {
        knowledgeCollections[id].burned = _burned;

        emit KnowledgeCollectionLib.KnowledgeCollectionBurnedUpdated(id, _burned);
    }

    function getByteSize(uint256 id) external view returns (uint256) {
        return knowledgeCollections[id].byteSize;
    }

    function setByteSize(uint256 id, uint256 _byteSize) external onlyContracts {
        _totalByteSize = _totalByteSize - knowledgeCollections[id].byteSize + _byteSize;
        knowledgeCollections[id].byteSize = _byteSize;

        emit KnowledgeCollectionLib.KnowledgeCollectionByteSizeUpdated(id, _byteSize);
    }

    function getTriplesAmount(uint256 id) external view returns (uint256) {
        return knowledgeCollections[id].triplesAmount;
    }

    function setTriplesAmount(uint256 id, uint256 _triplesAmount) external onlyContracts {
        _totalTriplesCounter = _totalTriplesCounter - knowledgeCollections[id].triplesAmount + _triplesAmount;
        knowledgeCollections[id].triplesAmount = _triplesAmount;

        emit KnowledgeCollectionLib.KnowledgeCollectionTriplesAmountUpdated(id, _triplesAmount);
    }

    function getChunksAmount(uint256 id) external view returns (uint256) {
        return knowledgeCollections[id].chunksAmount;
    }

    function setChunksAmount(uint256 id, uint256 _chunksAmount) external onlyContracts {
        _totalChunksCounter = _totalChunksCounter - knowledgeCollections[id].chunksAmount + _chunksAmount;
        knowledgeCollections[id].chunksAmount = _chunksAmount;

        emit KnowledgeCollectionLib.KnowledgeCollectionChunksAmountUpdated(id, _chunksAmount);
    }

    function getTokenAmount(uint256 id) external view returns (uint96) {
        return knowledgeCollections[id].tokenAmount;
    }

    function setTokenAmount(uint256 id, uint96 _tokenAmount) external onlyContracts {
        _totalTokenAmount = _totalTokenAmount - knowledgeCollections[id].tokenAmount + _tokenAmount;
        knowledgeCollections[id].tokenAmount = _tokenAmount;

        emit KnowledgeCollectionLib.KnowledgeCollectionTokenAmountUpdated(id, _tokenAmount);
    }

    function getStartEpoch(uint256 id) external view returns (uint256) {
        return knowledgeCollections[id].startEpoch;
    }

    function setStartEpoch(uint256 id, uint256 _startEpoch) external onlyContracts {
        knowledgeCollections[id].startEpoch = _startEpoch;

        emit KnowledgeCollectionLib.KnowledgeCollectionStartEpochUpdated(id, _startEpoch);
    }

    function getEndEpoch(uint256 id) external view returns (uint256) {
        return knowledgeCollections[id].endEpoch;
    }

    function setEndEpoch(uint256 id, uint256 _endEpoch) external onlyContracts {
        knowledgeCollections[id].endEpoch = _endEpoch;

        emit KnowledgeCollectionLib.KnowledgeCollectionEndEpochUpdated(id, _endEpoch);
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

    function balanceOf(address owner) external view virtual override returns (uint256) {
        uint256 latestTokenId = _latestTokenId();
        if (latestTokenId == 0) {
            return 0;
        }
        return balanceOf(owner, _startTokenId(), latestTokenId);
    }

    function balanceOf(address owner, uint256 start, uint256 stop) public view virtual override returns (uint256) {
        return _owned[owner].popCount(start, stop - start);
    }

    function tokensOfOwnerIn(address owner, uint256 start, uint256 stop) public view returns (uint256[] memory) {
        unchecked {
            if (start >= stop) revert InvalidQueryRange();

            // Set `start = max(start, _startTokenId())`.
            if (start < _startTokenId()) {
                start = _startTokenId();
            }

            // Set `stop = min(stop, stopLimit)`.
            uint256 stopLimit = _latestTokenId();
            if (stop > stopLimit) {
                stop = stopLimit;
            }

            uint256 tokenIdsLength;
            if (start < stop) {
                tokenIdsLength = balanceOf(owner, start, stop);
            } else {
                tokenIdsLength = 0;
            }

            uint256[] memory tokenIds = new uint256[](tokenIdsLength);

            LibBitmap.Bitmap storage bmap = _owned[owner];

            for ((uint256 i, uint256 tokenIdsIdx) = (start, 0); tokenIdsIdx != tokenIdsLength; ++i) {
                if (bmap.get(i)) {
                    tokenIds[tokenIdsIdx++] = i;
                }
            }
            return tokenIds;
        }
    }

    function tokensOfOwner(address owner) external view virtual override returns (uint256[] memory) {
        if (_totalMintedKnowledgeAssetsCounter == 0) {
            return new uint256[](0);
        }
        return tokensOfOwnerIn(owner, _startTokenId(), _latestTokenId());
    }

    function setURI(string memory baseURI) external onlyHub {
        _setURI(baseURI);

        emit KnowledgeCollectionLib.URIUpdate(baseURI);
    }

    function _latestTokenId() internal view returns (uint256) {
        if (_knowledgeCollectionsCounter == 0) {
            return 0;
        } else {
            return
                (_knowledgeCollectionsCounter - 1) *
                knowledgeCollectionMaxSize +
                knowledgeCollections[_knowledgeCollectionsCounter].minted;
        }
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
