// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

library AssertionStructs {
    struct Assertion {
        uint256 timestamp;
        uint128 size;
        uint32 triplesNumber;
        uint96 chunksNumber;
    }
}
