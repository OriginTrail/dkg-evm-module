// SPDX-License-Identifier: MIT

pragma solidity^0.8.0;

import {Hub} from './Hub.sol';
import {ProfileStorage} from './storage/ProfileStorage.sol';

contract ShardingTable {
    event NodeObjCreated(uint72 indexed identityId, bytes nodeId, uint96 ask, uint96 stake);
    event NodeRemoved(uint72 indexed identityId, bytes nodeId);
    event NodeRemovedByHubOwner(bytes nodeId);

    struct Node {
        uint72 identityId;
        bytes id;
        bytes prevNodeId;
        bytes nextNodeId;
    }

    struct NodeInfo {
        bytes id;
        uint96 ask;
        uint96 stake;
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

    modifier onlyHubOwner() {
        require (
            msg.sender == hub.owner(),
            "Function can only be called by hub owner!"
        );
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

        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        nodesPage[0] = NodeInfo(
            startingNodeId,
            profileStorage.getAsk(nodes[startingNodeId].identityId),
            profileStorage.getStake(nodes[startingNodeId].identityId)
        );

        uint16 i = 1;
        while (i < nodesNumber && !_equalIdHashes(nodes[nodesPage[i-1].id].nextNodeId, emptyPointer)) {
            bytes memory nextNodeId = nodes[nodesPage[i-1].id].nextNodeId;

            nodesPage[i] = NodeInfo(
                nextNodeId,
                profileStorage.getAsk(nodes[nextNodeId].identityId),
                profileStorage.getStake(nodes[nextNodeId].identityId)
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

    function pushBack(uint72 identityId)
        public
        onlyProfile
    {        
        _createNodeObj(identityId);

        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        bytes memory nodeId = profileStorage.getNodeId(identityId);

        if (!_equalIdHashes(tail, emptyPointer)) _link(tail, nodeId);
        _setTail(nodeId);

        if (_equalIdHashes(head, emptyPointer)) _setHead(nodeId);

        nodesCount += 1;
    }

    function pushFront(uint72 identityId)
        public
        onlyProfile
    {
        _createNodeObj(identityId);

        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        bytes memory nodeId = profileStorage.getNodeId(identityId);

        if (!_equalIdHashes(head, emptyPointer)) _link(nodeId, head);
        _setHead(nodeId);

        if (_equalIdHashes(tail, emptyPointer)) _setTail(nodeId);

        nodesCount += 1;
    }

    function removeNode(uint72 identityId)
        public
        onlyProfile
    {
        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        bytes memory nodeId = profileStorage.getNodeId(identityId);

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
    
        emit NodeRemoved(identityId, nodeId);
    }

    function removeNodeById(bytes memory nodeId)
        public
        onlyHubOwner
    {
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
    
        emit NodeRemovedByHubOwner(nodeId);
    }

    function _createNodeObj(uint72 identityId)
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
