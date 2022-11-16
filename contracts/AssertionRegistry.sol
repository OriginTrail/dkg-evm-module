// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { Hub } from "./Hub.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract AssertionRegistry is Ownable {
	event AssertionCreated(
		bytes32 indexed assertionId, address issuer, uint128 size, uint32 triplesNumber, uint96 chunksNumber
	);

	Hub public hub;

	// TODO: Optimize storage usage
	struct AssertionRecord{
		uint256 timestamp;
		address issuer;
		uint128 size;
		uint32 triplesNumber;
		uint96 chunksNumber;
	}

	mapping(bytes32 => AssertionRecord) internal assertionRecords;

	constructor(address hubAddress) {
		require(hubAddress != address(0));
		hub = Hub(hubAddress);
	}

	modifier onlyAssetContracts() {
        require (
            hub.isAssetContract(msg.sender),
            "Function can only be called by Asset Type Contracts!"
        );
        _;
    }

	function createAssertionRecord(
		bytes32 assertionId,
		address issuer,
		uint128 size,
		uint32 triplesNumber,
		uint96 chunksNumber
	)
		public
		onlyAssetContracts
	{
		require(assertionId != 0, "assertionId cannot be zero");
		require(size != 0, "size cannot be zero");
		require(assertionRecords[assertionId].timestamp == 0, "Assertion already exists");

		assertionRecords[assertionId].timestamp = block.timestamp;
		assertionRecords[assertionId].issuer = issuer;
		assertionRecords[assertionId].size = size;
		assertionRecords[assertionId].triplesNumber = triplesNumber;
		assertionRecords[assertionId].chunksNumber = chunksNumber;

		emit AssertionCreated(assertionId, issuer, size, triplesNumber, chunksNumber);
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
		returns (uint128)
	{
		return assertionRecords[assertionId].size;
	}

	function getTriplesNumber(bytes32 assertionId)
		public
		view
		returns (uint32)
	{
		return assertionRecords[assertionId].triplesNumber;
	}

	function getChunksNumber(bytes32 assertionId)
		public
		view
		returns (uint96)
	{
		return assertionRecords[assertionId].chunksNumber;
	}
}