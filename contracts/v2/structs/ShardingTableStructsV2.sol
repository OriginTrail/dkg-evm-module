// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

library ShardingTableStructsV2 {
    struct Node {
        uint256 hashRingPosition;
        bytes nodeId;
        uint72 index;
        uint72 identityId;
    }
}
