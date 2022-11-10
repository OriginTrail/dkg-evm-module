// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "./AbstractAsset.sol";
import "./AssertionRegistry.sol";
import "./ServiceAgreement.sol";

contract ContentAsset is AbstractAsset, ERC721 {
    constructor(address hubAddress) 
        AbstractAsset(hubAddress) 
        ERC721("ContentAsset", "DKG") 
    {}
        
    uint256 _tokenId = 0;

    event AssetCreated(uint256 indexed UAI, bytes32 indexed stateCommitHash);
    event AssetUpdated(uint256 indexed UAI, bytes32 indexed stateCommitHash);

    struct AssetRecord {
        bytes32[] assertions;
    }

    mapping (uint256 => AssetRecord) assetRecords;

    function createAsset(bytes32 assertionId, uint256 size, uint96 tokenAmount, uint16 epochsNum) public returns (uint256 _tokenId) {
        require(assertionId != 0, "assertionId cannot be zero");
        require(size != 0, "size cannot be zero");

        IERC20 tokenContract = IERC20(hub.getContractAddress("Token"));
        require(tokenContract.allowance(msg.sender, address(this)) >= tokenAmount, "Sender allowance must be equal to or higher than chosen amount");
        require(tokenContract.balanceOf(msg.sender) >= tokenAmount, "Sender balance must be equal to or higher than chosen amount!");

        uint256 tokenId = mintTokenId(msg.sender);
        require(assetRecords[tokenId].assertions.length == 0, "UAI already exists!");

        AssertionRegistry(hub.getContractAddress("AssertionRegistry")).createAssertionRecord(assertionId, msg.sender, size);
        tokenContract.transferFrom(msg.sender, address(this), tokenAmount);
        assetRecords[tokenId].assertions.push(assertionId);

        ServiceAgreement(hub.getContractAddress("ServiceAgreement")).createServiceAgreement(tokenId, sha256(abi.encodePacked(address(this), tokenId)), 0, epochsNum, tokenAmount);

        emit AssetCreated(tokenId, assertionId);

        return tokenId;
    }

    function updateAsset(uint256 tokenId, bytes32 assertionId, uint256 size, uint96 tokenAmount, uint16 epochsNum) public {
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

        ServiceAgreement(hub.getContractAddress("ServiceAgreement")).updateServiceAgreement(tokenId, sha256(abi.encodePacked(address(this), tokenId)), 0, epochsNum, tokenAmount);

        emit AssetUpdated(tokenId, assertionId);
    }

    function getAssertions(uint256 tokenId) override internal view returns (bytes32 [] memory) {
        return assetRecords[tokenId].assertions;
    }

    function mintTokenId(address to) internal returns (uint256) {
        _mint(to, _tokenId);
        return _tokenId++;
    }
}