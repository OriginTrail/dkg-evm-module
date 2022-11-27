// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {Hub} from '../Hub.sol';
import {IShardingTableStructs} from '../interface/IShardingTableStructs.sol';

contract ShardingTableStorage is IShardingTableStructs {

    bytes public constant _NULL = "";

    Hub public hub;

    bytes public head;
    bytes public tail;
    uint16 public nodesCount;

    mapping(bytes => Node) nodes;
    mapping(bytes => bytes32) public nodeIdsSha256;

    constructor(address hubAddress) {
        require(hubAddress != address(0));
        hub = Hub(hubAddress);

        nodeIdsSha256[_NULL] = sha256(_NULL);
        head = _NULL;
        tail = _NULL;
        nodesCount = 0;
    }

    modifier onlyContracts(){
        require(
            hub.isContract(msg.sender),
            "Function can only be called by contracts!"
        );
        _;
    }

    function incrementNodesCount()
        public
        onlyContracts
    {
        nodesCount += 1;
    }

    function decrementNodesCount()
        public
        onlyContracts
    {
        nodesCount -= 1;
    }

    function setHead(bytes memory nodeId)
        public
        onlyContracts
    {
        head = nodeId;
    }

    function setTail(bytes memory nodeId)
        public
        onlyContracts
    {
        tail = nodeId;
    }

    function getNode(bytes memory nodeId)
        public
        view
        returns (Node memory)
    {
        return nodes[nodeId];
    }

    function setNode(bytes memory nodeId, Node memory newNode)
        public
        onlyContracts
    {
        nodes[nodeId] = newNode;
    }

    function removeNode(bytes memory nodeId)
        public
        onlyContracts
    {
        delete nodes[nodeId];
    }


    function setNodeId(bytes memory nodeId, bytes32 nodeIdSha256)
        public
        onlyContracts
    {
        nodeIdsSha256[nodeId] = nodeIdSha256;
    }

    function getMultipleNodes(bytes memory firstNodeId, uint16 nodesNumber)
        public
        view
        returns (Node[] memory)
    {

        Node[] memory nodesPage = new Node[](nodesNumber);

        Node memory currentNode = nodes[firstNodeId];
        for (uint16 i = 0; i < nodesNumber; i++) {
            nodesPage[i] = currentNode;
            currentNode = nodes[currentNode.nextNodeId];
        }

        return nodesPage;
    }

    function link(bytes memory leftNodeId, bytes memory rightNodeId)
        public
        onlyContracts
    {
        nodes[leftNodeId].nextNodeId = rightNodeId;
        nodes[rightNodeId].prevNodeId = leftNodeId;
    }

}
