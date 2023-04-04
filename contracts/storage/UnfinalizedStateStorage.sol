// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {Hub} from "../Hub.sol";
import {Named} from "../interface/Named.sol";
import {Versioned} from "../interface/Versioned.sol";

contract UnfinalizedStateStorage is Named, Versioned {
    string private constant _NAME = "UnfinalizedStateStorage";
    string private constant _VERSION = "1.0.0";

    Hub public hub;

    // tokenId => latestState
    mapping(uint256 => bytes32) internal unfinalizedStates;
    // tokenId => issuer
    mapping(uint256 => address) internal issuers;

    constructor(address hubAddress) {
        require(hubAddress != address(0), "Hub Address cannot be 0x0");

        hub = Hub(hubAddress);
    }

    modifier onlyContracts() {
        _checkHub();
        _;
    }

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function getUnfinalizedState(uint256 tokenId) external view returns (bytes32) {
        return unfinalizedStates[tokenId];
    }

    function setUnfinalizedState(uint256 tokenId, bytes32 state) external onlyContracts {
        unfinalizedStates[tokenId] = state;
    }

    function deleteUnfinalizedState(uint256 tokenId) external onlyContracts {
        delete unfinalizedStates[tokenId];
    }

    function getIssuer(uint256 tokenId) external view returns (address) {
        return issuers[tokenId];
    }

    function setIssuer(uint256 tokenId, address issuer) external onlyContracts {
        issuers[tokenId] = issuer;
    }

    function deleteIssuer(uint256 tokenId) external onlyContracts {
        delete issuers[tokenId];
    }

    function hasPendingUpdate(uint256 tokenId) external view returns (bool) {
        return unfinalizedStates[tokenId] != bytes32(0);
    }

    function _checkHub() internal view virtual {
        require(hub.isContract(msg.sender), "Fn can only be called by the hub");
    }
}
