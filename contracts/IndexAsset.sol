/* // SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "./AbstractAsset.sol";
import "./AssertionRegistry.sol";
import "./ServiceAgreement.sol";

contract IndexAsset is AbstractAsset, ERC721 {
    uint256 tokenId = 0;
    constructor(address hubAddress) 
        AbstractAsset(hubAddress) 
        ERC721("ContentAsset", "DKG") 
        {
        }

    uint256 _tokenId = 0;

    event AssetCreated(uint256 indexed UAI, bytes32 indexed stateCommitHash);
    event AssetUpdated(uint256 indexed UAI, bytes32 indexed stateCommitHash);

    struct AssetRecord {
        bytes32[] assertions;
    }

    mapping (uint256 => AssetRecord) assetRecords;

    function createAsset(bytes32 assertionId, uint256 size, uint256 tokenAmount, uint16 epochsNum, bytes32[] keywords, uint8[] hashingAlgorithms) public override returns (uint256 _tokenId) {
        require(assertionId != 0, "assertionId cannot be zero");
        require(size > 0 && size <= 300, "size cannot be zero");
        require(keywords.length > 0 && keywords.length <= 5, "number of keywords must be between 1 and 5");

        IERC20 tokenContract = IERC20(hub.getContractAddress("Token"));
        require(tokenContract.allowance(msg.sender, address(this)) >= tokenAmount, "Sender allowance must be equal to or higher than chosen amount");
        require(tokenContract.balanceOf(msg.sender) >= tokenAmount, "Sender balance must be equal to or higher than chosen amount!");

        uint256 tokenId = mintTokenId(msg.sender);
        require(assetRecords[TokenId].assertions.length == 0, "UAI already exists!");

        AssertionRegistry(hub.getContractAddress("AssertionRegistry")).createAssertionRecord(assertionId, msg.sender, size);
        tokenContract.transferFrom(msg.sender, address(this), tokenAmount);
        assetRecords[tokenId].assertions.push(assertionId);

        super.createServiceAgreement(tokenId, epochsNum, tokenAmount, keywords, hashingAlgorithms);

        emit AssetCreated(tokenId, assertionId);

        return tokenId;
    }

    function updateAsset(uint256 tokenId, bytes32 assertionId, uint256 size, uint96 tokenAmount, bytes32[] keywords, uint8[] hashingAlgorithms) public override {
        require(assertionId != 0, "assertionId cannot be zero");
        require(size != 0, "size cannot be zero");

        address owner = ownerOf(tokenId);
        require(owner == msg.sender, "Only owner can update an asset");

        IERC20 tokenContract = IERC20(hub.getContractAddress("Token"));
        require(tokenContract.allowance(msg.sender, address(this)) >= tokenAmount, "Sender allowance must be equal to or higher than chosen amount");
        require(tokenContract.balanceOf(msg.sender) >= tokenAmount, "Sender balance must be equal to or higher than chosen amount!");  
        
        AssertionRegistry(hub.getContractAddress("AssertionRegistry")).createAssertionRecord(assertionId, msg.sender, size);
        tokenContract.transferFrom(msg.sender, address(this), tokenAmount);
        assetRecords[tokenId].assertions.push(assertionId);

        super.updateServiceAgreement(tokenId, epochsNum, tokenAmount, keywords, hashingAlgorithms);

        emit AssetUpdated(tokenId, assertionId);
    }

    function mintTokenId(address to) internal returns (uint256) {
        _mint(to, tokenId);
        return tokenId++;
    }
} */