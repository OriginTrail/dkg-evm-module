// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { Hub } from "../Hub.sol";
import { ShardingTableStructs } from "../structs/ShardingTableStructs.sol";
import { NULL } from "../constants/ShardingTableConstants.sol";

contract ShardingTableStorage {

    event NodeAdded(uint72 indexed identityId);
    event NodeRemoved(uint72 indexed identityId);

    Hub public hub;

    uint72 public head;
    uint72 public tail;
    uint72 public nodesCount;

    // identityId => Node
    mapping(uint72 => ShardingTableStructs.Node) nodes;

    constructor(address hubAddress) {
        require(hubAddress != address(0));

        hub = Hub(hubAddress);

        head = NULL;
        tail = NULL;
        nodesCount = 0;
    }

    modifier onlyContracts() {
        _checkHub();
        _;
    }

    function incrementNodesCount() external onlyContracts {
        nodesCount++;
    }

    function decrementNodesCount() external onlyContracts {
        nodesCount--;
    }

    function setHead(uint72 identityId) external onlyContracts {
        head = identityId;
    }

    function setTail(uint72 identityId) external onlyContracts {
        tail = identityId;
    }

    function createNode(uint72 identityId, uint72 prevIdentityId, uint72 nextIdentityId) external onlyContracts {
        nodes[identityId] = ShardingTableStructs.Node({
            identityId: identityId,
            prevIdentityId: prevIdentityId,
            nextIdentityId: nextIdentityId
        });

        emit NodeAdded(identityId);
    }

    function getNode(uint72 identityId) external view returns (ShardingTableStructs.Node memory) {
        return nodes[identityId];
    }

    function inShardingTable(uint72 identityId) external view returns(bool) {
        return nodes[identityId].identityId != 0;
    }

    function removeNode(uint72 identityId) external onlyContracts {
        delete nodes[identityId];

        emit NodeRemoved(identityId);
    }

    function setPrevIdentityId(uint72 identityId, uint72 newPrevIdentityId) external onlyContracts {
        nodes[identityId].prevIdentityId = newPrevIdentityId;
    }

    function setNextIdentityId(uint72 identityId, uint72 newNextIdentityId) external onlyContracts {
        nodes[identityId].nextIdentityId = newNextIdentityId;
    }

    function getMultipleNodes(uint72 firstIdentityId, uint16 nodesNumber)
        external
        view
        returns (ShardingTableStructs.Node[] memory)
    {
        ShardingTableStructs.Node[] memory nodesPage = new ShardingTableStructs.Node[](nodesNumber);

        ShardingTableStructs.Node memory currentNode = nodes[firstIdentityId];
        for (uint256 i = 0; i < nodesNumber; ) {
            nodesPage[i] = currentNode;
            currentNode = nodes[currentNode.nextIdentityId];
            unchecked { i++; }
        }

        return nodesPage;
    }

    function link(uint72 leftNodeIdentityId, uint72 rightNodeIdentityId) external onlyContracts {
        nodes[leftNodeIdentityId].nextIdentityId = rightNodeIdentityId;
        nodes[rightNodeIdentityId].prevIdentityId = leftNodeIdentityId;
    }

    function _checkHub() internal view virtual {
        require(
            hub.isContract(msg.sender),
            "Fn can only be called by hub"
        );
    }

}
