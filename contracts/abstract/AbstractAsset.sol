// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {Hub} from "../Hub.sol";
import {Named} from "../interface/Named.sol";
import {Versioned} from "../interface/Versioned.sol";

abstract contract AbstractAsset is Named, Versioned {
    Hub public hub;

    constructor(address hubAddress) {
        require(hubAddress != address(0), "Hub Address cannot be 0x0");

        hub = Hub(hubAddress);
    }

    function getAssertionIds(uint256 tokenId) public view virtual returns (bytes32[] memory);

    function getLatestAssertionId(uint256 tokenId) external view returns (bytes32) {
        bytes32[] memory assertions = getAssertionIds(tokenId);
        return assertions[assertions.length - 1];
    }

    function getAssertionIdByIndex(uint256 tokenId, uint256 index) external view returns (bytes32) {
        bytes32[] memory assertions = getAssertionIds(tokenId);
        return assertions[index];
    }

    function getAssertionIdsLength(uint256 tokenId) external view returns (uint256) {
        return getAssertionIds(tokenId).length;
    }
}
