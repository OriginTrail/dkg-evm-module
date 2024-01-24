// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

library ShardingTableStructsV2 {
    struct NodeInfo {
        uint256 hashRingPosition;
        bytes nodeId;
        uint72 identityId;
        uint96 ask;
        uint96 stake;
    }

    struct Node {
        uint256 hashRingPosition;
        uint72 index;
        uint72 identityId;
        uint72 prevIdentityId;
        uint72 nextIdentityId;
    }
}
