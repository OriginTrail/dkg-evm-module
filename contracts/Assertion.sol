// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import {AssertionStorage} from "./storage/AssertionStorage.sol";
import {ContractStatus} from "./abstract/ContractStatus.sol";
import {Initializable} from "./interface/Initializable.sol";
import {Named} from "./interface/Named.sol";
import {Versioned} from "./interface/Versioned.sol";
import {AssertionStructs} from "./structs/AssertionStructs.sol";

contract Assertion is Named, Versioned, ContractStatus, Initializable {
    event AssertionCreated(bytes32 indexed assertionId, uint128 size, uint32 triplesNumber, uint96 chunksNumber);

    string private constant _NAME = "Assertion";
    string private constant _VERSION = "1.0.1";

    AssertionStorage public assertionStorage;

    constructor(address hubAddress) ContractStatus(hubAddress) {
        initialize();
    }

    function initialize() public onlyHubOwner {
        assertionStorage = AssertionStorage(hub.getContractAddress("AssertionStorage"));
    }

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
        AssertionStorage ans = assertionStorage;

        require(assertionId != bytes32(0), "Assertion ID cannot be empty");
        require(size != 0, "Size cannot be 0");
        require(triplesNumber != 0, "Triples number cannot be 0");
        require(chunksNumber != 0, "Chunks number cannot be 0");

        ans.createAssertion(assertionId, size, triplesNumber, chunksNumber);

        emit AssertionCreated(assertionId, size, triplesNumber, chunksNumber);
    }
}
