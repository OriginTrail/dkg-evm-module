// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { AbstractAsset } from "./AbstractAsset.sol";
import { AssertionRegistry } from "../AssertionRegistry.sol";
import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ServiceAgreementStorage } from "../storage/ServiceAgreementStorage.sol";

contract IndexAsset is AbstractAsset, ERC721 {
    struct AssetRecord {
        bytes32[] assertions;
    }

    uint256 private _tokenId;

    mapping (uint256 => AssetRecord) assetRecords;

    constructor(address hubAddress)
        AbstractAsset(hubAddress)
        ERC721("IndexAsset", "DKG")
    {
        _tokenId = 0;
    }

    function createAsset(
        bytes32 assertionId,
        uint256 size,
        bytes[] memory keywords,
        uint8[] memory hashingFunctionIds,
        uint16 epochsNum,
        uint96 tokenAmount,
        uint8 scoringFunctionId
    ) public returns (uint256) {

        // address operationalWallet,
        // address assetContract,
        // uint256 tokenId,
        // bytes memory keyword,
        // uint8 hashingFunctionId,
        // uint16 epochsNum,
        // uint96 tokenAmount,
        // uint8 scoringFunctionId

        require(assertionId != 0, "assertionId cannot be 0");
        require(size > 0 && size <= 300, "Size is out of range [1, 300]");
        require(keywords.length > 0 && keywords.length <= 5, "Number of keywords is out of range [1, 5]");
        require(hashingFunctionIds.length > 0, "Number of hashing functions cannot be 0");
        require(epochsNum > 0, "Epochs number cannot be 0");

        uint256 tokenId = _tokenId;
        _mint(msg.sender, tokenId);
        _tokenId++;

        AssertionRegistry(hub.getContractAddress("AssertionRegistry")).createAssertionRecord(
            assertionId,
            msg.sender,
            size
        );
        assetRecords[tokenId].assertions.push(assertionId);

        ServiceAgreementStorage serviceAgreementStorage = ServiceAgreementStorage(
            hub.getContractAddress("ServiceAgreementStorage")
        );
        for (uint8 i = 0; i < keywords.length; i++) {
            for (uint8 k = 0; k < hashingFunctionIds.length; k++) {
                serviceAgreementStorage.createServiceAgreement(
                    msg.sender,
                    address(this),
                    tokenId,
                    keywords[i],
                    hashingFunctionIds[k],
                    epochsNum,
                    tokenAmount,
                    scoringFunctionId
                );
            }
        }

        emit AssetCreated(address(this), tokenId, assertionId);

        return tokenId;
    }

    function updateAsset(
        uint256 tokenId,
        bytes32 assertionId,
        uint256 size,
        bytes32[] memory keywords,
        uint8[] memory hashingFunctionIds,
        uint16 epochsNum,
        uint96 tokenAmount,
        uint8 scoringFunctionId
    ) public {
        require(msg.sender == this.ownerOf(tokenId), "Only owner can update an asset");
        require(assertionId != 0, "assertionId cannot be 0");
        require(size > 0 && size <= 300, "Size is out of range [1, 300]");
        require(keywords.length > 0 && keywords.length <= 5, "Number of keywords is out of range [1, 5]");
        require(hashingFunctionIds.length > 0, "Number of hashing functions cannot be 0");
        require(epochsNum > 0, "Epochs number cannot be 0");

        AssertionRegistry(hub.getContractAddress("AssertionRegistry")).createAssertionRecord(
            assertionId,
            msg.sender,
            size
        );
        assetRecords[tokenId].assertions.push(assertionId);

        // TODO: Finish Service Agreements update
        // ServiceAgreementStorage(hub.getContractAddress("ServiceAgreementStorage")).updateServiceAgreement(
        //     msg.sender,
        //     address(this),
        //     tokenId,
        //     abi.encodePacked(address(this), tokenId),
        //     0,
        //     epochsNum,
        //     tokenAmount
        // );

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