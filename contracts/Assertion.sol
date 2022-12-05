// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import { Hub } from "./Hub.sol";
import { AssertionStorage } from "./storage/AssertionStorage.sol";
import { Named } from "./interface/Named.sol";
import { Versioned } from "./interface/Versioned.sol";
import { AssertionStructs } from "./structs/AssertionStructs.sol";

contract Assertion is Named, Versioned {

	event AssertionCreated(
		bytes32 indexed assertionId, address issuer, uint128 size, uint32 triplesNumber, uint96 chunksNumber
	);

	string constant private _NAME = "Assertion";
    string constant private _VERSION = "1.0.0";

	Hub public hub;
	AssertionStorage public assertionStorage;

	constructor(address hubAddress) {
		require(hubAddress != address(0));

		hub = Hub(hubAddress);
		initialize();
	}

	modifier onlyHubOwner() {
		_checkHubOwner();
		_;
	}

	modifier onlyAssetContracts() {
        _checkAssetContract();
        _;
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
		require(issuer != address(0), "Issuer address cannot be 0x0");
		require(
			!ans.assertionExists(assertionId) && (issuer != ans.getAssertionIssuer(assertionId)),
			"Assertion already exists"
		);
		require(size != 0, "Size cannot be 0");
		require(triplesNumber != 0, "Triples number cannot be 0");
		require(chunksNumber != 0, "Chunks number cannot be 0");

		ans.createAssertion(assertionId, issuer, size, triplesNumber, chunksNumber);

		emit AssertionCreated(assertionId, issuer, size, triplesNumber, chunksNumber);
	}

	function _checkHubOwner() internal view virtual {
		require(msg.sender == hub.owner(), "Fn can only be used by hub owner");
	}

	function _checkAssetContract() internal view virtual {
		require (hub.isAssetContract(msg.sender), "Fn can only be called by assets");
	}

}