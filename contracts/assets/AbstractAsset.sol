// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { Hub } from "./Hub.sol";

abstract contract AbstractAsset {
    event AssetCreated(uint256 indexed UAI, bytes32 indexed stateCommitHash);
    event AssetUpdated(uint256 indexed UAI, bytes32 indexed stateCommitHash);

    Hub public hub;

    constructor(address hubAddress) {
        require(hubAddress != address(0));
        hub = Hub(hubAddress);
    }

    function getAssertions(uint256 tokenId) virtual internal view returns (bytes32 [] memory);

    function getCommitHash(uint256 tokenId, uint256 offset) external view returns (bytes32 commitHash) {
        bytes32 [] memory assertions = getAssertions(tokenId);
        require(assertions.length > offset, "Offset is invalid");

        return assertions[assertions.length - 1 - offset];
    }
}