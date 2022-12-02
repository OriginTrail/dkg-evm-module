// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { Hub } from "../Hub.sol";
import { Named } from "../interface/Named.sol";

abstract contract AbstractAsset is Named {

    event AssetCreated(address indexed assetContract, uint256 indexed tokenId, bytes32 indexed stateCommitHash);
    event AssetUpdated(address indexed assetContract, uint256 indexed tokenId, bytes32 indexed stateCommitHash);

    Hub public hub;

    constructor(address hubAddress) {
        require(hubAddress != address(0));

        hub = Hub(hubAddress);
    }

    function getAssertionIds(uint256 tokenId) public virtual view returns (bytes32 [] memory);

    function getLatestAssertionId(uint256 tokenId) external view returns (bytes32) {
        bytes32[] memory assertions = getAssertionIds(tokenId);
        return assertions[assertions.length - 1];
    }

    function getAssertionIdByIndex(uint256 tokenId, uint256 index) public view returns (bytes32) {
        bytes32 [] memory assertions = getAssertionIds(tokenId);
        return assertions[index];
    }

    function getAssertionIdsLength(uint256 tokenId) external view returns (uint256) {
        return getAssertionIds(tokenId).length;
    }

}
