// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { Hub } from "./Hub.sol";
import { AssertionStorage } from "./storage/AssertionStorage.sol";
import { AssertionStructs } from "./structs/AssertionStructs.sol";

contract Assertion {

	Hub public hub;
	AssertionStorage public assertionStorage;

	constructor(address hubAddress) {
		require(hubAddress != address(0));

		hub = Hub(hubAddress);
		assertionStorage = AssertionStorage(hub.getContractAddress("AssertionStorage"));
	}

	modifier onlyAssetContracts() {
        _checkAssetContract();
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
		onlyAssetContracts
	{
		AssertionStorage ans = assertionStorage;

		require(assertionId != bytes32(0), "Assertion ID cannot be empty");
		require(!ans.assertionExists(assertionId), "Assertion already exists");
		require(size != 0, "Size cannot be 0");
		require(triplesNumber != 0, "Triples number cannot be 0");
		require(chunksNumber != 0, "Chunks number cannot be 0");

		ans.createAssertion(assertionId, issuer, size, triplesNumber, chunksNumber);
	}

	function _checkAssetContract() internal view virtual {
		require (hub.isAssetContract(msg.sender), "Fn can only be called by assets");
	}

}