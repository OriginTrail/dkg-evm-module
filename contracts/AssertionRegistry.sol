// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./Hub.sol";

contract AssertionRegistry is Ownable {
	event AssertionCreated(bytes32 indexed assertionId, address issuer, uint256 size);

	Hub public hub;

	struct AssertionRecord{
		uint256 timestamp;
		address issuer;
		uint256 size;
	}

	mapping(bytes32 => AssertionRecord) internal assertionRecords;

	constructor(address hubAddress) {
		require(hubAddress != address(0));
		hub = Hub(hubAddress);
	}


	modifier onlyAssetContracts() {
        require (
            // TODO: Add function to the hub
            hub.isAssetContract(msg.sender),
            "Function can only be called by Asset Type Contracts!"
        );
        _;
    }

	function createAssertionRecord(bytes32 assertionId, address issuer, uint256 size)
		public
		onlyAssetContracts
	{
		require(assertionId != 0, "assertionId cannot be zero");
		require(size != 0, "size cannot be zero");
		require(assertionRecords[assertionId].timestamp == 0, "Assertion already exists");

		assertionRecords[assertionId].timestamp = block.timestamp;
		assertionRecords[assertionId].issuer = issuer;
		assertionRecords[assertionId].size = size;

		emit AssertionCreated(assertionId, issuer, size);
	}

	function getIssuer(bytes32 assertionId)
		public
		view
		returns(address)
	{
		return assertionRecords[assertionId].issuer;
	}

	function getTimestamp(bytes32 assertionId)
		public
		view
		returns(uint256)
	{
		return assertionRecords[assertionId].timestamp;
	}

	function getSize(bytes32 assertionId)
		public
		view
		returns (uint256)
	{
		return assertionRecords[assertionId].size;
	}
}