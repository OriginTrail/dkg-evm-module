// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import { Hub } from "../Hub.sol";
import { Named } from "../interface/Named.sol";
import { Versioned } from "../interface/Versioned.sol";
import { ShardingTableStructs } from "../structs/ShardingTableStructs.sol";
import { NULL } from "../constants/ShardingTableConstants.sol";

contract ShardingTableStorage is Named, Versioned {

    string constant private _NAME = "ShardingTableStorage";
    string constant private _VERSION = "1.0.0";

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
    }

    modifier onlyContracts() {
        _checkHub();
        _;
    }

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
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
    }

    function getNode(uint72 identityId) external view returns (ShardingTableStructs.Node memory) {
        return nodes[identityId];
    }

    function removeNode(uint72 identityId) external onlyContracts {
        delete nodes[identityId];
    }

    function nodeExists(uint72 identityId) external view returns (bool) {
        return nodes[identityId].identityId != 0;
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
        for (uint256 i; i < nodesNumber; ) {
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
        require(hub.isContract(msg.sender), "Fn can only be called by the hub");
    }

}
