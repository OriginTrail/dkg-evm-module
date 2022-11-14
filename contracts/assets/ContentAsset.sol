// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { AbstractAsset } from "./AbstractAsset.sol";
import { AssertionRegistry } from "../AssertionRegistry.sol";
import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ServiceAgreementStorage } from "../storage/ServiceAgreementStorage.sol";

contract ContentAsset is AbstractAsset, ERC721 {
    constructor(address hubAddress) 
        AbstractAsset(hubAddress) 
        ERC721("ContentAsset", "DKG") 
    {}
        
    uint256 _tokenId = 0;

    struct AssetRecord {
        bytes32[] assertions;
    }

    mapping (uint256 => AssetRecord) assetRecords;

    function createAsset(bytes32 assertionId, uint256 size, uint96 tokenAmount, uint16 epochsNum) public returns (uint256 _tokenId) {
        require(assertionId != 0, "assertionId cannot be zero");
        require(size > 0, "size cannot be zero");

        uint256 tokenId = mintTokenId(msg.sender);
        require(assetRecords[tokenId].assertions.length == 0, "UAI already exists!");

        AssertionRegistry(hub.getContractAddress("AssertionRegistry")).createAssertionRecord(assertionId, msg.sender, size);
        assetRecords[tokenId].assertions.push(assertionId);

        ServiceAgreement(hub.getContractAddress("ServiceAgreement")).createServiceAgreement(msg.sender, tokenId, sha256(abi.encodePacked(address(this), tokenId)), 0, epochsNum, tokenAmount);

        emit AssetCreated(tokenId, assertionId);

        return tokenId;
    }

    function updateAsset(uint256 tokenId, bytes32 assertionId, uint256 size, uint96 tokenAmount, uint16 epochsNum) public {
        require(assertionId != 0, "assertionId cannot be zero");
        require(size > 0, "size cannot be zero");

        address owner = ownerOf(tokenId);
        require(owner == msg.sender, "Only owner can update an asset"); 
        
        AssertionRegistry(hub.getContractAddress("AssertionRegistry")).createAssertionRecord(assertionId, msg.sender, size);
        assetRecords[tokenId].assertions.push(assertionId);

        ServiceAgreement(hub.getContractAddress("ServiceAgreement")).updateServiceAgreement(msg.sender, tokenId, sha256(abi.encodePacked(address(this), tokenId)), 0, epochsNum, tokenAmount);

        emit AssetUpdated(tokenId, assertionId);
    }

    function getAssetOwner(uint256 tokenId)
        public
        view
        returns (address owner)
    {
        return ownerOf(tokenId);
    }

    function getAssertions(uint256 tokenId) override internal view returns (bytes32 [] memory) {
        return assetRecords[tokenId].assertions;
    }

    function mintTokenId(address to) internal returns (uint256) {
        _mint(to, _tokenId);
        return _tokenId++;
    }

    function transfer(address from, address to, uint256 _tokenId) public {
        _transfer(from, to, _tokenId);
    }

    function exists(uint256 _tokenId) public view returns (bool) {
        return _exists(_tokenId);
    }
}