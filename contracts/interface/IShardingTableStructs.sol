// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IShardingTableStructs {

    struct NodeInfo {
        bytes id;
        uint96 ask;
        uint96 stake;
    }

    struct Node {
        uint72 identityId;
        bytes id;
        bytes prevNodeId;
        bytes nextNodeId;
    }

}
