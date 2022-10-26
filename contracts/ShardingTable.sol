// SPDX-License-Identifier: MIT

pragma solidity^0.8.0;

import {Hub} from './Hub.sol';
import {ProfileStorage} from './storage/ProfileStorage.sol';


contract ShardingTable {
    event NodeObjCreated(bytes32 nodeId, uint256 ask, uint256 stake);
    event NodeRemoved(bytes32 nodeId);

    struct Node {
        bytes32 prevNodeId;
        bytes32 nextNodeId;
        bytes32 id;
        address identity;
        uint256 ask;
    }

    struct NodeInfo {
        bytes32 id;
        uint256 ask;
        uint256 stake;
    }

    Hub public hub;

    bytes32 private emptyPointer;
    bytes32 public head;
    bytes32 public tail;
    uint16 public nodeCount;

    mapping(bytes32 => Node) nodes;

    constructor(address hubAddress) {
        require(hubAddress != address(0));
        hub = Hub(hubAddress);

        emptyPointer = bytes32(0);
        head = emptyPointer;
        tail = emptyPointer;
        nodeCount = 0;
    }

    function getShardingTable(bytes32 startingNodeId, uint16 nodesNumber)
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
            nodes[startingNodeId].ask,  // TODO: profileStorageContract.getAsk(nodes[startingNodeId].identity),
            profileStorageContract.getStake(nodes[startingNodeId].identity)
        );

        uint16 i = 1;
        while (i < nodesNumber && !_equalIds(nodes[nodesPage[i-1].id].nextNodeId, emptyPointer)) {
            bytes32 nextNodeId = nodes[nodesPage[i-1].id].nextNodeId;

            nodesPage[i] = NodeInfo(
                nextNodeId,
                nodes[nextNodeId].ask,  // TODO: profileStorageContract.getAsk(nodes[nextNodeId].identity),
                profileStorageContract.getStake(nodes[nextNodeId].identity)
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

    function pushBack(address identity, uint256 ask)
        public
    {
        _createNodeObj(identity, ask);
    
        ProfileStorage profileStorageContract = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        bytes32 nodeId = profileStorageContract.getNodeId(identity);

        if (!_equalIds(tail, emptyPointer)) _link(tail, nodeId);
        _setTail(nodeId);

        if (_equalIds(head, emptyPointer)) _setHead(nodeId);

        nodeCount += 1;
    }

    function pushFront(address identity, uint256 ask)
        public
    {
        _createNodeObj(identity, ask);

        ProfileStorage profileStorageContract = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        bytes32 nodeId = profileStorageContract.getNodeId(identity);

        if (!_equalIds(head, emptyPointer)) _link(nodeId, head);
        _setHead(nodeId);

        if (_equalIds(tail, emptyPointer)) _setTail(nodeId);

        nodeCount += 1;
    }

    function removeNode(address identity)
        public
    {
        ProfileStorage profileStorageContract = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        bytes32 nodeId = profileStorageContract.getNodeId(identity);

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

    function _createNodeObj(address identity, uint256 ask)
        internal
    {
        ProfileStorage profileStorageContract = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        bytes32 nodeId = profileStorageContract.getNodeId(identity);

        Node memory newNode = Node(
            emptyPointer,
            emptyPointer,
            nodeId,
            identity,
            ask
        );

        nodes[nodeId] = newNode;

        emit NodeObjCreated(nodeId, ask, profileStorageContract.getStake(identity));
    }

    function _setHead(bytes32 nodeId)
        internal
    {
        head = nodeId;
    }

    function _setTail(bytes32 nodeId)
        internal
    {
        tail = nodeId;
    }

    function _link(bytes32 _leftNodeId, bytes32 _rightNodeId)
        internal
    {
        nodes[_leftNodeId].nextNodeId = _rightNodeId;
        nodes[_rightNodeId].prevNodeId = _leftNodeId;
    }

    function _equalIds(bytes32 _firstId, bytes32 _secondId)
        internal
        pure
        returns (bool)
    {
        return _firstId == _secondId;
    }
}
