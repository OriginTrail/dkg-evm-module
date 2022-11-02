// SPDX-License-Identifier: MIT

pragma solidity^0.8.0;

import {Hub} from './Hub.sol';
import {ProfileStorage} from './storage/ProfileStorage.sol';


contract ShardingTable {
    event NodeObjCreated(bytes nodeId, uint256 ask, uint256 stake, bytes32 nodeIdSha256);
    event NodeRemoved(bytes nodeId);

    struct Node {
        address identity;
        bytes id;
        bytes prevNodeId;
        bytes nextNodeId;
    }

    struct NodeInfo {
        bytes id;
        uint256 ask;
        uint256 stake;
        bytes32 idSha256;
    }

    Hub public hub;

    bytes private emptyPointer;
    bytes public head;
    bytes public tail;
    uint16 public nodesCount;

    mapping(bytes => Node) nodes;
    mapping(bytes => bytes32) nodeIdsSha256;

    constructor(address hubAddress) {
        require(hubAddress != address(0));
        hub = Hub(hubAddress);

        emptyPointer = "";
        nodeIdsSha256[emptyPointer] = sha256(emptyPointer);
        head = emptyPointer;
        tail = emptyPointer;
        nodesCount = 0;
    }

    modifier onlyProfile() {
        require(msg.sender == hub.getContractAddress("Profile"),
        "Function can only be called by Profile contract!");
        _;
    }

    function getShardingTable(bytes memory startingNodeId, uint16 nodesNumber)
        public
        view
        returns (NodeInfo[] memory)
    {
        require(
            !_equalIdHashes(nodes[startingNodeId].id, "") ||
            _equalIdHashes(startingNodeId, emptyPointer)
        );

        NodeInfo[] memory nodesPage;

        if (nodesCount == 0) {
            return nodesPage;
        }

        nodesPage = new NodeInfo[](nodesNumber);

        ProfileStorage profileStorageContract = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        nodesPage[0] = NodeInfo(
            startingNodeId,
            profileStorageContract.getAsk(nodes[startingNodeId].identity),
            profileStorageContract.getStake(nodes[startingNodeId].identity),
            nodeIdsSha256[startingNodeId]
        );

        uint16 i = 1;
        while (i < nodesNumber && !_equalIdHashes(nodes[nodesPage[i-1].id].nextNodeId, emptyPointer)) {
            bytes memory nextNodeId = nodes[nodesPage[i-1].id].nextNodeId;

            nodesPage[i] = NodeInfo(
                nextNodeId,
                profileStorageContract.getAsk(nodes[nextNodeId].identity),
                profileStorageContract.getStake(nodes[nextNodeId].identity),
                nodeIdsSha256[nextNodeId]
            );
            i += 1;
        }
        return nodesPage;
    }

    function getShardingTable()
        public
        view
        returns (NodeInfo[] memory)
    {
        return getShardingTable(head, nodesCount);
    }

    function pushBack(address identity)
        public
        onlyProfile
    {
        _createNodeObj(identity);
    
        ProfileStorage profileStorageContract = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        bytes memory nodeId = profileStorageContract.getNodeId(identity);

        if (!_equalIdHashes(tail, emptyPointer)) _link(tail, nodeId);
        _setTail(nodeId);

        if (_equalIdHashes(head, emptyPointer)) _setHead(nodeId);

        nodesCount += 1;
    }

    function pushFront(address identity)
        public
        onlyProfile
    {
        _createNodeObj(identity);

        ProfileStorage profileStorageContract = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        bytes memory nodeId = profileStorageContract.getNodeId(identity);

        if (!_equalIdHashes(head, emptyPointer)) _link(nodeId, head);
        _setHead(nodeId);

        if (_equalIdHashes(tail, emptyPointer)) _setTail(nodeId);

        nodesCount += 1;
    }

    function removeNode(address identity)
        public
        onlyProfile
    {
        ProfileStorage profileStorageContract = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        bytes memory nodeId = profileStorageContract.getNodeId(identity);

        Node memory nodeToRemove = nodes[nodeId];

        if (_equalIdHashes(head, nodeId) && _equalIdHashes(tail, nodeId)) {
            _setHead(emptyPointer);
            _setTail(emptyPointer);
        }
        else if (_equalIdHashes(head, nodeId)) {
            _setHead(nodeToRemove.nextNodeId);
            nodes[head].prevNodeId = emptyPointer;
        }
        else if (_equalIdHashes(tail, nodeId)) {
            _setTail(nodeToRemove.prevNodeId);
            nodes[tail].nextNodeId = emptyPointer;
        }
        else {
            _link(nodeToRemove.prevNodeId, nodeToRemove.nextNodeId);
        }

        delete nodes[nodeId];

        nodesCount -= 1;
    
        emit NodeRemoved(nodeId);
    }

    function _createNodeObj(address identity)
        internal
    {
        ProfileStorage profileStorageContract = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        bytes memory nodeId = profileStorageContract.getNodeId(identity);
        bytes32 nodeIdSha256 = sha256(nodeId);

        Node memory newNode = Node(
            identity,
            nodeId,
            emptyPointer,
            emptyPointer
        );

        nodes[nodeId] = newNode;
        nodeIdsSha256[nodeId] = nodeIdSha256;

        emit NodeObjCreated(
            nodeId,
            profileStorageContract.getAsk(identity),
            profileStorageContract.getStake(identity),
            nodeIdSha256
        );
    }

    function _setHead(bytes memory nodeId)
        internal
    {
        head = nodeId;
    }

    function _setTail(bytes memory nodeId)
        internal
    {
        tail = nodeId;
    }

    function _link(bytes memory _leftNodeId, bytes memory _rightNodeId)
        internal
    {
        nodes[_leftNodeId].nextNodeId = _rightNodeId;
        nodes[_rightNodeId].prevNodeId = _leftNodeId;
    }

    function _equalIdHashes(bytes memory _firstId, bytes memory _secondId)
        internal
        view
        returns (bool)
    {
        return nodeIdsSha256[_firstId] == nodeIdsSha256[_secondId];
    }
}
