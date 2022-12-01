// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { AbstractAsset } from "./AbstractAsset.sol";
import { Assertion } from "../Assertion.sol";
import { ServiceAgreement } from "../ServiceAgreement.sol";
import { Named } from "../interface/Named.sol";
import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { ServiceAgreementStructs } from "../structs/ServiceAgreementStructs.sol";

contract ContentAsset is AbstractAsset, ERC721 {

    struct AssetInputArgs {
        bytes32 assertionId;
        uint128 size;
        uint32 triplesNumber;
        uint96 chunksNumber;
        uint16 epochsNumber;
        uint96 tokenAmount;
        uint8 scoreFunctionId;
    }

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

    function createAsset(AssetInputArgs memory args) external {
        uint256 tokenId = _tokenId++;
        _mint(msg.sender, tokenId);

        assertionContract.createAssertion(
            args.assertionId,
            msg.sender,
            args.size,
            args.triplesNumber,
            args.chunksNumber
        );
        assets[tokenId].assertionIds.push(args.assertionId);

        serviceAgreement.createServiceAgreement(
            ServiceAgreementStructs.ServiceAgreementInputArgs(
                msg.sender,
                address(this),
                tokenId,
                abi.encodePacked(address(this), tokenId, args.assertionId),
                1,  // hashFunctionId | 1 = sha256
                args.epochsNumber,
                args.tokenAmount,
                args.scoreFunctionId
            )
        );

        emit AssetCreated(address(this), tokenId, args.assertionId);
    }

    function updateAsset(uint256 tokenId, AssetInputArgs memory args) external onlyAssetOwner(tokenId) {
        assertionContract.createAssertion(
            args.assertionId,
            msg.sender,
            args.size,
            args.triplesNumber,
            args.chunksNumber
        );
        assets[tokenId].assertionIds.push(args.assertionId);

        serviceAgreement.updateServiceAgreement(
            ServiceAgreementStructs.ServiceAgreementInputArgs(
                msg.sender,
                address(this),
                tokenId,
                abi.encodePacked(address(this), tokenId, this.getAssertionIdByIndex(tokenId, 0)),
                1,  // hashFunctionId | 1 = sha256
                args.epochsNumber,
                args.tokenAmount,
                args.scoreFunctionId
            )
        );

        emit AssetUpdated(address(this), tokenId, args.assertionId);
    }

    function getAssertionIds(uint256 tokenId) public view override returns (bytes32[] memory) {
        return assets[tokenId].assertionIds;
    }

    function _checkAssetOwner(uint256 tokenId) internal view virtual {
        require(msg.sender == ownerOf(tokenId), "Only asset owner can use this fn");
    }

}
