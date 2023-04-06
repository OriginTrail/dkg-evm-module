// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {HubDependent} from "../abstract/HubDependent.sol";
import {Named} from "../interface/Named.sol";
import {Versioned} from "../interface/Versioned.sol";
import {AssertionStructs} from "../structs/AssertionStructs.sol";

contract AssertionStorage is Named, Versioned, HubDependent {
    string private constant _NAME = "AssertionStorage";
    string private constant _VERSION = "1.0.0";

    // assertionId => Assertion
    mapping(bytes32 => AssertionStructs.Assertion) internal assertions;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) HubDependent(hubAddress) {}

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function createAssertion(
        bytes32 assertionId,
        uint128 size,
        uint32 triplesNumber,
        uint96 chunksNumber
    ) external onlyContracts {
        assertions[assertionId] = AssertionStructs.Assertion({
            timestamp: block.timestamp,
            size: size,
            triplesNumber: triplesNumber,
            chunksNumber: chunksNumber
        });
    }

    function deleteAssertion(bytes32 assertionId) external onlyContracts {
        delete assertions[assertionId];
    }

    function getAssertion(bytes32 assertionId) external view returns (AssertionStructs.Assertion memory) {
        return assertions[assertionId];
    }

    function getAssertionTimestamp(bytes32 assertionId) external view returns (uint256) {
        return assertions[assertionId].timestamp;
    }

    function getAssertionSize(bytes32 assertionId) external view returns (uint128) {
        return assertions[assertionId].size;
    }

    function getAssertionTriplesNumber(bytes32 assertionId) external view returns (uint32) {
        return assertions[assertionId].triplesNumber;
    }

    function getAssertionChunksNumber(bytes32 assertionId) external view returns (uint96) {
        return assertions[assertionId].chunksNumber;
    }

    function assertionExists(bytes32 assertionId) external view returns (bool) {
        return assertions[assertionId].timestamp != 0;
    }
}
