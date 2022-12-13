// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import {Hub} from "./Hub.sol";
import {IHashFunction} from "./interface/IHashFunction.sol";
import {Named} from "./interface/Named.sol";
import {Versioned} from "./interface/Versioned.sol";
import {UnorderedIndexableContractDynamicSetLib} from "./utils/UnorderedIndexableContractDynamicSet.sol";

contract HashingProxy is Named, Versioned {
    using UnorderedIndexableContractDynamicSetLib for UnorderedIndexableContractDynamicSetLib.Set;

    event NewHashFunctionContract(uint8 indexed hashFunctionId, address newContractAddress);
    event HashFunctionContractChanged(uint8 indexed hashFunctionId, address newContractAddress);

    string private constant _NAME = "HashingProxy";
    string private constant _VERSION = "1.0.0";

    Hub public hub;

    UnorderedIndexableContractDynamicSetLib.Set internal hashFunctionSet;

    constructor(address hubAddress) {
        require(hubAddress != address(0), "Hub Address cannot be 0x0");

        hub = Hub(hubAddress);
    }

    modifier onlyHubOwner() {
        _checkHubOwner();
        _;
    }

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function setContractAddress(uint8 hashFunctionId, address hashingContractAddress) external onlyHubOwner {
        if (hashFunctionSet.exists(hashFunctionId)) {
            hashFunctionSet.update(hashFunctionId, hashingContractAddress);
            emit HashFunctionContractChanged(hashFunctionId, hashingContractAddress);
        } else {
            hashFunctionSet.append(hashFunctionId, hashingContractAddress);
            emit NewHashFunctionContract(hashFunctionId, hashingContractAddress);
        }
    }

    function removeContract(uint8 hashFunctionId) external onlyHubOwner {
        hashFunctionSet.remove(hashFunctionId);
    }

    function callHashFunction(uint8 hashFunctionId, bytes calldata data) external view returns (bytes32) {
        return IHashFunction(hashFunctionSet.get(hashFunctionId).addr).hash(data);
    }

    function getHashFunctionName(uint8 hashFunctionId) external view returns (string memory) {
        return Named(hashFunctionSet.get(hashFunctionId).addr).name();
    }

    function getHashFunctionContractAddress(uint8 hashFunctionId) external view returns (address) {
        return hashFunctionSet.get(hashFunctionId).addr;
    }

    function getAllHashFunctions() external view returns (UnorderedIndexableContractDynamicSetLib.Contract[] memory) {
        return hashFunctionSet.getAll();
    }

    function isHashFunction(uint8 hashFunctionId) external view returns (bool) {
        return hashFunctionSet.exists(hashFunctionId);
    }

    function _checkHubOwner() internal view virtual {
        require(msg.sender == hub.owner(), "Fn can only be used by hub owner");
    }
}
