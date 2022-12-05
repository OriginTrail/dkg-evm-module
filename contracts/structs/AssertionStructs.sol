// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

library AssertionStructs {

    struct Assertion{
		uint256 timestamp;
		address issuer;
		uint128 size;
		uint32 triplesNumber;
		uint96 chunksNumber;
	}    

}
