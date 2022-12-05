// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

library ShardingTableStructs {

    struct NodeInfo {
        bytes nodeId;
        uint72 identityId;
        uint96 ask;
        uint96 stake;
    }

    struct Node {
        uint72 identityId;
        uint72 prevIdentityId;
        uint72 nextIdentityId;
    }

}
