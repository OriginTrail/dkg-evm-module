// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { Hub } from "../Hub.sol";
import { AssertionStructs } from "../structs/AssertionStructs.sol";

contract AssertionStorage {

	event AssertionCreated(
		bytes32 indexed assertionId, address issuer, uint128 size, uint32 triplesNumber, uint96 chunksNumber
	);

	Hub public hub;

	// assertionId => Assertion
	mapping(bytes32 => AssertionStructs.Assertion) assertionRecords;

	constructor(address hubAddress) {
		require(hubAddress != address(0));

		hub = Hub(hubAddress);
	}

	modifier onlyContracts() {
        _checkHub();
        _;
    }

	function createAssertion(
		bytes32 assertionId,
		address issuer,
		uint128 size,
		uint32 triplesNumber,
		uint96 chunksNumber
	)
		external
		onlyContracts
	{
        assertionRecords[assertionId] = AssertionStructs.Assertion({
            timestamp: block.timestamp,
            issuer: issuer,
            size: size,
            triplesNumber: triplesNumber,
            chunksNumber: chunksNumber
        });

		emit AssertionCreated(assertionId, issuer, size, triplesNumber, chunksNumber);
	}

    function assertionExists(bytes32 assertionId) external onlyContracts returns (bool) {
        return assertionRecords[assertionId].timestamp != 0;
    }

	function _checkHub() internal view virtual {
        require(hub.isContract(msg.sender), "Fn can only be called by the hub");
    }

}
