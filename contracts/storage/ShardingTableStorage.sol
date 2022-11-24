// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {Hub} from '../Hub.sol';
import {ProfileStorage} from './ProfileStorage.sol';
import {IShardingTableStructs} from '../interface/IShardingTableStructs.sol';

contract ShardingTableStorage is IShardingTableStructs {

    event NodeObjCreated(uint96 indexed identityId, bytes nodeId, uint96 ask, uint96 stake);
    event NodeRemoved(uint96 indexed identityId, bytes nodeId);
    event NodeRemovedByHubOwner(bytes nodeId);

    Hub public hub;

    bytes private constant emptyPointer = "";
    bytes public head;
    bytes public tail;
    uint16 public nodesCount;

    mapping(bytes => Node) nodes;
    mapping(bytes => bytes32) nodeIdsSha256;

    constructor(address hubAddress) {
        require(hubAddress != address(0));
        hub = Hub(hubAddress);

        nodeIdsSha256[emptyPointer] = sha256(emptyPointer);
        head = emptyPointer;
        tail = emptyPointer;
        nodesCount = 0;
    }

    modifier onlyContracts(){
        require(hub.isContract(msg.sender),
            "Function can only be called by contracts!");
        _;
    }

    function pushBack(uint96 identityId)
        public
        onlyContracts
    {
        _createNodeObj(identityId);

        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        bytes memory nodeId = profileStorage.getNodeId(identityId);

        if (!equalIdHashes(tail, emptyPointer)) _link(tail, nodeId);
        setTail(nodeId);

        if (equalIdHashes(head, emptyPointer)) setHead(nodeId);

        nodesCount += 1;
    }

    function pushFront(uint96 identityId)
        public
        onlyContracts
    {
        _createNodeObj(identityId);

        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        bytes memory nodeId = profileStorage.getNodeId(identityId);

        if (!equalIdHashes(head, emptyPointer)) _link(nodeId, head);
        setHead(nodeId);

        if (equalIdHashes(tail, emptyPointer)) setTail(nodeId);

        nodesCount += 1;
    }

    function removeNode(uint96 identityId)
        public
        onlyContracts
    {
        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        bytes memory nodeId = profileStorage.getNodeId(identityId);

        Node memory nodeToRemove = nodes[nodeId];

        if (equalIdHashes(head, nodeId) && equalIdHashes(tail, nodeId)) {
            setHead(emptyPointer);
            setTail(emptyPointer);
        }
        else if (equalIdHashes(head, nodeId)) {
            setHead(nodeToRemove.nextNodeId);
            nodes[head].prevNodeId = emptyPointer;
        }
        else if (equalIdHashes(tail, nodeId)) {
            setTail(nodeToRemove.prevNodeId);
            nodes[tail].nextNodeId = emptyPointer;
        }
        else {
            _link(nodeToRemove.prevNodeId, nodeToRemove.nextNodeId);
        }

        delete nodes[nodeId];

        nodesCount -= 1;

        emit NodeRemoved(identityId, nodeId);
    }

    function removeNodeById(bytes memory nodeId)
        public
        onlyContracts
    {
        Node memory nodeToRemove = nodes[nodeId];

        if (equalIdHashes(head, nodeId) && equalIdHashes(tail, nodeId)) {
            setHead(emptyPointer);
            setTail(emptyPointer);
        }
        else if (equalIdHashes(head, nodeId)) {
            setHead(nodeToRemove.nextNodeId);
            nodes[head].prevNodeId = emptyPointer;
        }
        else if (equalIdHashes(tail, nodeId)) {
            setTail(nodeToRemove.prevNodeId);
            nodes[tail].nextNodeId = emptyPointer;
        }
        else {
            _link(nodeToRemove.prevNodeId, nodeToRemove.nextNodeId);
        }

        delete nodes[nodeId];

        nodesCount -= 1;

        emit NodeRemovedByHubOwner(nodeId);
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

    function equalIdHashes(bytes memory firstId, bytes memory secondId)
        public
        view
        returns (bool)
    {
        return nodeIdsSha256[firstId] == nodeIdsSha256[secondId];
    }

    function _createNodeObj(uint96 identityId)
        internal
    {
        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        bytes memory nodeId = profileStorage.getNodeId(identityId);
        bytes32 nodeIdSha256 = profileStorage.getNodeAddress(identityId, 0);  // 0 - sha256

        Node memory newNode = Node(
            identityId,
            nodeId,
            emptyPointer,
            emptyPointer
        );

        nodes[nodeId] = newNode;
        nodeIdsSha256[nodeId] = nodeIdSha256;

        emit NodeObjCreated(identityId, nodeId, profileStorage.getAsk(identityId), profileStorage.getStake(identityId));
    }

    function _link(bytes memory _leftNodeId, bytes memory _rightNodeId)
        internal
    {
        nodes[_leftNodeId].nextNodeId = _rightNodeId;
        nodes[_rightNodeId].prevNodeId = _leftNodeId;
    }

}
