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
        bytes32 id_sha256;
    }

    struct NodeInfo {
        bytes id;
        uint256 ask;
        uint256 stake;
        bytes32 id_sha256;
    }

    Hub public hub;

    bytes private emptyPointer;
    bytes public head;
    bytes public tail;
    uint16 public nodeCount;

    mapping(bytes => Node) nodes;

    constructor(address hubAddress) {
        require(hubAddress != address(0));
        hub = Hub(hubAddress);

        emptyPointer = "";
        head = emptyPointer;
        tail = emptyPointer;
        nodeCount = 0;
    }

    function getShardingTable(bytes memory startingNodeId, uint16 nodesNumber)
        public
        view
        returns (NodeInfo[] memory)
    {
        require(nodesNumber >= 0, "Nodes number must be non-negative!");

        NodeInfo[] memory nodesPage;

        if (nodesNumber == 0) {
            return nodesPage;
        }

        nodesPage = new NodeInfo[](nodesNumber);

        ProfileStorage profileStorageContract = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        nodesPage[0] = NodeInfo(
            startingNodeId,
            profileStorageContract.getAsk(nodes[startingNodeId].identity),
            profileStorageContract.getStake(nodes[startingNodeId].identity),
            nodes[startingNodeId].id_sha256
        );

        uint16 i = 1;
        while (i < nodesNumber && !_equalIds(nodes[nodesPage[i-1].id].nextNodeId, emptyPointer)) {
            bytes memory nextNodeId = nodes[nodesPage[i-1].id].nextNodeId;

            nodesPage[i] = NodeInfo(
                nextNodeId,
                profileStorageContract.getAsk(nodes[nextNodeId].identity),
                profileStorageContract.getStake(nodes[nextNodeId].identity),
                nodes[nextNodeId].id_sha256
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
        return getShardingTable(head, nodeCount);
    }

    function pushBack(address identity)
        public
    {
        _createNodeObj(identity);
    
        ProfileStorage profileStorageContract = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        bytes memory nodeId = profileStorageContract.getNodeId(identity);

        if (!_equalIds(tail, emptyPointer)) _link(tail, nodeId);
        _setTail(nodeId);

        if (_equalIds(head, emptyPointer)) _setHead(nodeId);

        nodeCount += 1;
    }

    function pushFront(address identity)
        public
    {
        _createNodeObj(identity);

        ProfileStorage profileStorageContract = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        bytes memory nodeId = profileStorageContract.getNodeId(identity);

        if (!_equalIds(head, emptyPointer)) _link(nodeId, head);
        _setHead(nodeId);

        if (_equalIds(tail, emptyPointer)) _setTail(nodeId);

        nodeCount += 1;
    }

    function removeNode(address identity)
        public
    {
        ProfileStorage profileStorageContract = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        bytes memory nodeId = profileStorageContract.getNodeId(identity);

        Node memory nodeToRemove = nodes[nodeId];

        if (_equalIds(head, nodeId) && _equalIds(tail, nodeId)) {
            _setHead(emptyPointer);
            _setTail(emptyPointer);
        }
        else if (_equalIds(head, nodeId)) {
            _setHead(nodeToRemove.nextNodeId);
            nodes[head].prevNodeId = emptyPointer;
        }
        else if (_equalIds(tail, nodeId)) {
            _setTail(nodeToRemove.prevNodeId);
            nodes[tail].nextNodeId = emptyPointer;
        }
        else {
            _link(nodeToRemove.prevNodeId, nodeToRemove.nextNodeId);
        }

        delete nodes[nodeId];

        nodeCount -= 1;
    
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
            emptyPointer,
            nodeIdSha256
        );

        nodes[nodeId] = newNode;

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

    function _equalIds(bytes memory _firstId, bytes memory _secondId)
        internal
        pure
        returns (bool)
    {
        return keccak256(_firstId) == keccak256(_secondId);
    }
}
