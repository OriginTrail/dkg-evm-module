// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { AbstractAsset } from "./AbstractAsset.sol";
import { AssertionRegistry } from "../AssertionRegistry.sol";
import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { ServiceAgreementStorage } from "../storage/ServiceAgreementStorage.sol";
import { Named } from "../interface/Named.sol";

contract ContentAsset is AbstractAsset, ERC721 {
    struct AssetRecord {
        bytes32[] assertions;
    }

    uint256 private _tokenId;

    mapping (uint256 => AssetRecord) assetRecords;

    constructor(address hubAddress)
        AbstractAsset(hubAddress)
        ERC721("ContentAsset", "DKG")
    {
        _tokenId = 0;
    }

    function name() public view override(ERC721, Named) returns (string memory) {
        return ERC721.name();
    }

    function createAsset(
        bytes32 assertionId,
        uint128 size,
        uint32 triplesNumber,
        uint96 chunksNumber,
        uint16 epochsNumber,
        uint96 tokenAmount
    )
        public
    {
        require(assertionId != bytes32(0), "assertionId cannot be empty");
        require(size > 0, "Size cannot be 0");
        require(epochsNumber > 0, "Epochs number cannot be 0");
        require(tokenAmount > 0, "Token amount cannot be 0");

        uint256 tokenId = _tokenId;
        _mint(msg.sender, tokenId);
        _tokenId++;

        AssertionRegistry(hub.getContractAddress("AssertionRegistry")).createAssertionRecord(
            assertionId,
            msg.sender,
            size,
            triplesNumber,
            chunksNumber
        );
        assetRecords[tokenId].assertions.push(assertionId);

        ServiceAgreementStorage(hub.getContractAddress("ServiceAgreementStorage")).createServiceAgreement(
            msg.sender,
            address(this),
            tokenId,
            abi.encodePacked(address(this), tokenId, assertionId),
            0,
            epochsNumber,
            tokenAmount,
            0
        );

        emit AssetCreated(address(this), tokenId, assertionId);
    }

    function updateAsset(
        uint256 tokenId,
        bytes32 assertionId,
        uint128 size,
        uint32 triplesNumber,
        uint96 chunksNumber,
        uint16 epochsNumber,
        uint96 tokenAmount
    )
        public
    {
        require(msg.sender == ownerOf(tokenId), "Only owner can update an asset");
        require(assertionId != bytes32(0), "assertionId cannot be 0");
        require(size > 0, "Size cannot be 0");
        require(epochsNumber > 0, "Epochs number cannot be 0");
        require(tokenAmount > 0, "Token amount cannot be 0");
        
        AssertionRegistry(hub.getContractAddress("AssertionRegistry")).createAssertionRecord(
            assertionId,
            msg.sender,
            size,
            triplesNumber,
            chunksNumber
        );
        assetRecords[tokenId].assertions.push(assertionId);

        ServiceAgreementStorage(hub.getContractAddress("ServiceAgreementStorage")).updateServiceAgreement(
            msg.sender,
            address(this),
            tokenId,
            abi.encodePacked(address(this), tokenId, this.getAssertionByIndex(tokenId, 0)),
            0,
            epochsNumber,
            tokenAmount
        );

        emit AssetUpdated(address(this), tokenId, assertionId);
    }

    function getAssertions(uint256 tokenId)
        override
        public
        view
        returns (bytes32 [] memory)
    {
        return assetRecords[tokenId].assertions;
    }
}
