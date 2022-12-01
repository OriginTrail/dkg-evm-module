// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { AbstractAsset } from "./AbstractAsset.sol";
import { Assertion } from "../Assertion.sol";
import { ServiceAgreement } from "../ServiceAgreement.sol";
import { Named } from "../interface/Named.sol";
import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract ContentAsset is AbstractAsset, ERC721 {

    struct Asset {
        bytes32[] assertionIds;
    }

    uint256 private _tokenId;

    Assertion public assertionContract;
    ServiceAgreement public serviceAgreement;

    mapping (uint256 => Asset) assets;

    constructor(address hubAddress)
        AbstractAsset(hubAddress)
        ERC721("ContentAsset", "DKG")
    {
        assertionContract = Assertion(hub.getContractAddress("Assertion"));
        serviceAgreement = ServiceAgreement(hub.getContractAddress("ServiceAgreement"));
    }

    modifier onlyAssetOwner(uint256 tokenId) {
        _checkAssetOwner(tokenId);
        _;
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
        external
    {
        uint256 tokenId = _tokenId++;
        _mint(msg.sender, tokenId);

        assertionContract.createAssertion(
            assertionId,
            msg.sender,
            size,
            triplesNumber,
            chunksNumber
        );
        assets[tokenId].assertionIds.push(assertionId);

        serviceAgreement.createServiceAgreement(
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
        external
        onlyAssetOwner(tokenId)
    {   
        assertionContract.createAssertion(
            assertionId,
            msg.sender,
            size,
            triplesNumber,
            chunksNumber
        );
        assets[tokenId].assertionIds.push(assertionId);

        serviceAgreement.updateServiceAgreement(
            msg.sender,
            address(this),
            tokenId,
            abi.encodePacked(address(this), tokenId, this.getAssertionIdByIndex(tokenId, 0)),
            0,
            epochsNumber,
            tokenAmount
        );

        emit AssetUpdated(address(this), tokenId, assertionId);
    }

    function getAssertionIds(uint256 tokenId) public view override returns (bytes32[] memory) {
        return assets[tokenId].assertionIds;
    }

    function _checkAssetOwner(uint256 tokenId) internal view virtual {
        require(msg.sender == ownerOf(tokenId), "Only asset owner can use this fn");
    }

}
