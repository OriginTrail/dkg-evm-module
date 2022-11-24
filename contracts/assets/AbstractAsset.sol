// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { Hub } from "../Hub.sol";

abstract contract AbstractAsset {
    event AssetCreated(address indexed assetContract, uint256 indexed tokenId, bytes32 indexed stateCommitHash);
    event AssetUpdated(address indexed assetContract, uint256 indexed tokenId, bytes32 indexed stateCommitHash);

    Hub public hub;

    constructor(address hubAddress) {
        require(hubAddress != address(0));
        hub = Hub(hubAddress);
    }

    function getAssertions(uint256 tokenId) virtual public view returns (bytes32 [] memory);

    function getLatestAssertion(uint256 tokenId) public view returns (bytes32) {
        bytes32[] memory assertions = getAssertions(tokenId);
        return assertions[assertions.length - 1];
    }

    function getAssertionByIndex(uint256 tokenId, uint256 index) public view returns (bytes32) {
        bytes32 [] memory assertions = getAssertions(tokenId);
        return assertions[index];
    }

    function getAssertionsLength(uint256 tokenId) public view returns (uint256) {
        return getAssertions(tokenId).length;
    }
}
