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
	mapping(bytes32 => AssertionStructs.Assertion) assertions;

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
        assertions[assertionId] = AssertionStructs.Assertion({
            timestamp: block.timestamp,
            issuer: issuer,
            size: size,
            triplesNumber: triplesNumber,
            chunksNumber: chunksNumber
        });

		emit AssertionCreated(assertionId, issuer, size, triplesNumber, chunksNumber);
	}

    function getAssertion(bytes32 assertionId) external view returns (AssertionStructs.Assertion memory) {
        return assertions[assertionId];
    }

    function getAssertionTimestamp(bytes32 assertionId) external view returns (uint256) {
        return assertions[assertionId].timestamp;
    }

    function getAssertionIssuer(bytes32 assertionId) external view returns (address) {
        return assertions[assertionId].issuer;
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

	function _checkHub() internal view virtual {
        require(hub.isContract(msg.sender), "Fn can only be called by the hub");
    }

}
