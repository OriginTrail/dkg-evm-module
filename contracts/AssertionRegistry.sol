// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./Hub.sol";


contract AssertionRegistry is Ownable {
	Hub public hub;
	IERC20 token;

	address public TRAC_TOKEN_ADDRESS;

	struct AssertionRecord{
		uint256 visibility; // 0 - private, 1 - public
		uint256 timestamp;
		address issuer;
		uint256 size;
		bytes32 data; // for extensibility
	}

	mapping(bytes32 => AssertionRecord) internal assertionRecords;

	// events
	event AssertionCreated(bytes32 indexed assertionId, address issuer, uint256 size, uint256 visibility);

	constructor(address hubAddress) {
		require(hubAddress != address(0));
		hub = Hub(hubAddress);
	}


	modifier onlyContracts() {
		require(hub.isContract(msg.sender),
			"Function can only be called by contracts!");
		_;
	}

	function createAssertionRecord(bytes32 assertionId, address issuer, uint256 size, uint256 visibility) public onlyContracts {
		require(assertionId != 0, "assertionId cannot be zero");
		require(size != 0, "size cannot be zero");
		require(visibility < 2, "visibility can be only 0 (private) or 1 (public)");
		require(assertionRecords[assertionId].timestamp == 0, "Assertion already exists");

		assertionRecords[assertionId].timestamp = block.timestamp;
		assertionRecords[assertionId].issuer = issuer;
		assertionRecords[assertionId].size = size;
		assertionRecords[assertionId].visibility = visibility;

		emit AssertionCreated(assertionId, issuer, size, visibility);
	}

	function getIssuer(bytes32 assertionId)
	public view returns(address issuer){
		return assertionRecords[assertionId].issuer;
	}

	function getTimestamp(bytes32 assertionId)
	public view returns(uint256 timestamp){
		return assertionRecords[assertionId].timestamp;
	}
}