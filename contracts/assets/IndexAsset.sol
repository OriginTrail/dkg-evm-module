// // SPDX-License-Identifier: MIT

// pragma solidity ^0.8.0;

// import { AbstractAsset } from "./AbstractAsset.sol";
// import { AssertionRegistry } from "../AssertionRegistry.sol";
// import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
// import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// import { ServiceAgreementStorage } from "../storage/ServiceAgreementStorage.sol";

// contract IndexAsset is AbstractAsset, ERC721 {
//     struct AssetRecord {
//         bytes32[] assertions;
//     }

//     uint256 private _tokenId;

//     mapping (uint256 => AssetRecord) assetRecords;

//     constructor(address hubAddress)
//         AbstractAsset(hubAddress)
//         ERC721("IndexAsset", "DKG")
//     {
//         _tokenId = 0;
//     }

//     function createAsset(bytes32 assertionId, uint256 size, uint256 tokenAmount, uint16 epochsNum, bytes32[] keywords, uint8[] hashingFunctionIds) public override returns (uint256 _tokenId) {
//         require(assertionId != 0, "assertionId cannot be zero");
//         require(size > 0 && size <= 300, "size cannot be zero");
//         require(keywords.length > 0 && keywords.length <= 5, "number of keywords must be between 1 and 5");

//         IERC20 tokenContract = IERC20(hub.getContractAddress("Token"));
//         require(tokenContract.allowance(msg.sender, address(this)) >= tokenAmount, "Sender allowance must be equal to or higher than chosen amount");
//         require(tokenContract.balanceOf(msg.sender) >= tokenAmount, "Sender balance must be equal to or higher than chosen amount!");

//         uint256 tokenId = _tokenId;
//         _mint(msg.sender, tokenId);
//         _tokenId++;

//         AssertionRegistry(hub.getContractAddress("AssertionRegistry")).createAssertionRecord(assertionId, msg.sender, size);
//         tokenContract.transferFrom(msg.sender, address(this), tokenAmount);
//         assetRecords[tokenId].assertions.push(assertionId);

//         super.createServiceAgreement(tokenId, epochsNum, tokenAmount, keywords, hashingFunctionIds);

//         emit AssetCreated(tokenId, assertionId);

//         return tokenId;
//     }

//     function updateAsset(uint256 tokenId, bytes32 assertionId, uint256 size, uint96 tokenAmount, bytes32[] keywords, uint8[] hashingFunctionIds) public override {
//         require(assertionId != 0, "assertionId cannot be zero");
//         require(size != 0, "size cannot be zero");

//         address owner = ownerOf(tokenId);
//         require(owner == msg.sender, "Only owner can update an asset");

//         IERC20 tokenContract = IERC20(hub.getContractAddress("Token"));
//         require(tokenContract.allowance(msg.sender, address(this)) >= tokenAmount, "Sender allowance must be equal to or higher than chosen amount");
//         require(tokenContract.balanceOf(msg.sender) >= tokenAmount, "Sender balance must be equal to or higher than chosen amount!");  
        
//         AssertionRegistry(hub.getContractAddress("AssertionRegistry")).createAssertionRecord(assertionId, msg.sender, size);
//         tokenContract.transferFrom(msg.sender, address(this), tokenAmount);
//         assetRecords[tokenId].assertions.push(assertionId);

//         super.updateServiceAgreement(tokenId, epochsNum, tokenAmount, keywords, hashingFunctionIds);

//         emit AssetUpdated(tokenId, assertionId);
//     }
// }