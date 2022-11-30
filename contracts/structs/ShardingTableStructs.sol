// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

library ShardingTableStructs {

    struct NodeInfo {
        bytes id;
        uint96 ask;
        uint96 stake;
    }

    struct Node {
        uint72 identityId;
        uint72 prevIdentityId;
        uint72 nextIdentityId;
    }

}
