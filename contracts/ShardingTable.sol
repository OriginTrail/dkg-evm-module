// SPDX-License-Identifier: MIT

pragma solidity^0.8.0;

import {Hub} from './Hub.sol';
import {ProfileStorage} from './storage/ProfileStorage.sol';
import {IShardingTableStructs} from './interface/IShardingTableStructs.sol';
import {ShardingTableStorage} from './storage/ShardingTableStorage.sol';

contract ShardingTable is IShardingTableStructs {
    event NodeObjCreated(uint72 indexed identityId, bytes nodeId, uint96 ask, uint96 stake);
    event NodeRemoved(uint72 indexed identityId, bytes nodeId);
    event NodeRemovedByHubOwner(bytes nodeId);

    Hub public hub;

    constructor(address hubAddress) {
        require(hubAddress != address(0));
        hub = Hub(hubAddress);

    }

    modifier onlyContracts(){
        require(
            hub.isContract(msg.sender),
            "Function can only be called by contracts!"
        );
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
        address shardingTableStorageAddress = hub.getContractAddress("ShardingTableStorage");
        ShardingTableStorage shardingTableStorage = ShardingTableStorage(shardingTableStorageAddress);
        NodeInfo[] memory nodesPage;

        if (shardingTableStorage.nodesCount() == 0) {
            return nodesPage;
        }

        Node memory startingNode = shardingTableStorage.getNode(startingNodeId);
        require(startingNode.identityId != 0, "Non-existent node id!");

        require(
            !_equalIdHashes(startingNode.id, "") ||
            _equalIdHashes(startingNodeId, shardingTableStorage._NULL())
        );

        nodesPage = new NodeInfo[](nodesNumber);

        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        nodesPage[0] = NodeInfo(
            startingNodeId,
            profileStorage.getAsk(startingNode.identityId),
            profileStorage.getStake(startingNode.identityId)
        );

        uint16 i = 1;
        Node memory prevNode = shardingTableStorage.getNode(nodesPage[i-1].id);
        Node memory nextNode;
        bytes memory nextNodeId;
        while (i < nodesNumber && !_equalIdHashes(prevNode.nextNodeId, shardingTableStorage._NULL())) {
            nextNodeId = shardingTableStorage.getNode(nodesPage[i-1].id).nextNodeId;
            nextNode = shardingTableStorage.getNode(nextNodeId);

            nodesPage[i] = NodeInfo(
                nextNodeId,
                profileStorage.getAsk(nextNode.identityId),
                profileStorage.getStake(nextNode.identityId)
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
        address shardingTableStorageAddress = hub.getContractAddress("ShardingTableStorage");
        ShardingTableStorage shardingTableStorage = ShardingTableStorage(shardingTableStorageAddress);

        return getShardingTable(shardingTableStorage.head(), shardingTableStorage.nodesCount());
    }

    function pushBack(uint72 identityId)
        public
        onlyContracts
    {
        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        require(
            profileStorage.getAsk(identityId) != 0,
            "Identity does not exist!"
        );

        ShardingTableStorage shardingTableStorage = ShardingTableStorage(hub.getContractAddress("ShardingTableStorage"));

        _createNodeObj(identityId);

        bytes memory nodeId = profileStorage.getNodeId(identityId);

        if (!_equalIdHashes(shardingTableStorage.tail(), shardingTableStorage._NULL()))
            shardingTableStorage.link(shardingTableStorage.tail(), nodeId);
        shardingTableStorage.setTail(nodeId);

        if (_equalIdHashes(shardingTableStorage.head(), shardingTableStorage._NULL()))
            shardingTableStorage.setHead(nodeId);

        shardingTableStorage.incrementNodesCount();
    }

    function pushFront(uint72 identityId)
        public
        onlyContracts
    {
        ShardingTableStorage shardingTableStorage = ShardingTableStorage(hub.getContractAddress("ShardingTableStorage"));
        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        require(
            profileStorage.getAsk(identityId) != 0,
            "Identity does not exist!"
        );

        _createNodeObj(identityId);
        bytes memory nodeId = profileStorage.getNodeId(identityId);

        if (!_equalIdHashes(shardingTableStorage.head(), shardingTableStorage._NULL()))
            shardingTableStorage.link(nodeId, shardingTableStorage.head());
        shardingTableStorage.setHead(nodeId);

        if (_equalIdHashes(shardingTableStorage.tail(), shardingTableStorage._NULL()))
            shardingTableStorage.setTail(nodeId);

        shardingTableStorage.incrementNodesCount();

    }

    function removeNode(uint72 identityId)
        public
        onlyContracts
    {
        ShardingTableStorage shardingTableStorage = ShardingTableStorage(hub.getContractAddress("ShardingTableStorage"));
        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        require(
            profileStorage.getAsk(identityId) != 0,
            "Identity does not exist!"
        );

        bytes memory nodeId = profileStorage.getNodeId(identityId);

        Node memory nodeToRemove = shardingTableStorage.getNode(nodeId);

        bytes memory head = shardingTableStorage.head();
        bytes memory tail = shardingTableStorage.tail();
        if (_equalIdHashes(head, nodeId) && _equalIdHashes(tail, nodeId)) {
            shardingTableStorage.setHead(shardingTableStorage._NULL());
            shardingTableStorage.setTail(shardingTableStorage._NULL());
        } else if (_equalIdHashes(head, nodeId)) {
            shardingTableStorage.setHead(nodeToRemove.nextNodeId);
            Node memory headNode = shardingTableStorage.getNode(head);
            headNode.prevNodeId = shardingTableStorage._NULL();
            shardingTableStorage.setNode(headNode.id, headNode);
        } else if (_equalIdHashes(tail, nodeId)) {
            shardingTableStorage.setTail(nodeToRemove.prevNodeId);
            Node memory tailNode = shardingTableStorage.getNode(tail);
            tailNode.nextNodeId = shardingTableStorage._NULL();
            shardingTableStorage.setNode(tailNode.id, tailNode);
        } else {
            shardingTableStorage.link(nodeToRemove.prevNodeId, nodeToRemove.nextNodeId);
        }

        shardingTableStorage.removeNode(nodeId);

        shardingTableStorage.decrementNodesCount();

        emit NodeRemoved(identityId, nodeId);
    }

    function removeNodeById(bytes memory nodeId)
        public
        onlyHubOwner
    {
        ShardingTableStorage shardingTableStorage = ShardingTableStorage(hub.getContractAddress("ShardingTableStorage"));

        Node memory nodeToRemove = shardingTableStorage.getNode(nodeId);
        require(nodeToRemove.identityId != 0, "Non-existent node id!");

        bytes memory head = shardingTableStorage.head();
        bytes memory tail = shardingTableStorage.tail();
        if (_equalIdHashes(head, nodeId) && _equalIdHashes(tail, nodeId)) {
            shardingTableStorage.setHead(shardingTableStorage._NULL());
            shardingTableStorage.setTail(shardingTableStorage._NULL());
        } else if (_equalIdHashes(head, nodeId)) {
            shardingTableStorage.setHead(nodeToRemove.nextNodeId);
            Node memory headNode = shardingTableStorage.getNode(head);
            headNode.prevNodeId = shardingTableStorage._NULL();
            shardingTableStorage.setNode(headNode.id, headNode);
        } else if (_equalIdHashes(tail, nodeId)) {
            shardingTableStorage.setTail(nodeToRemove.prevNodeId);
            Node memory tailNode = shardingTableStorage.getNode(tail);
            tailNode.nextNodeId = shardingTableStorage._NULL();
            shardingTableStorage.setNode(tailNode.id, tailNode);
        } else {
            shardingTableStorage.link(nodeToRemove.prevNodeId, nodeToRemove.nextNodeId);
        }

        shardingTableStorage.removeNode(nodeId);

        shardingTableStorage.decrementNodesCount();

        emit NodeRemovedByHubOwner(nodeId);
    }

    function _equalIdHashes(bytes memory firstId, bytes memory secondId)
        private
        view
        returns (bool)
    {
        ShardingTableStorage shardingTableStorage = ShardingTableStorage(hub.getContractAddress("ShardingTableStorage"));

        return shardingTableStorage.nodeIdsSha256(firstId) == shardingTableStorage.nodeIdsSha256(secondId);
    }

    function _createNodeObj(uint72 identityId)
        internal
    {
        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        ShardingTableStorage shardingTableStorage = ShardingTableStorage(hub.getContractAddress("ShardingTableStorage"));

        bytes memory nodeId = profileStorage.getNodeId(identityId);
        bytes32 nodeIdSha256 = profileStorage.getNodeAddress(identityId, 0);  // 0 - sha256

        Node memory newNode = Node(
            identityId,
            nodeId,
            shardingTableStorage._NULL(),
            shardingTableStorage._NULL()
        );

        shardingTableStorage.setNode(nodeId, newNode);
        shardingTableStorage.setNodeId(nodeId, nodeIdSha256);

        emit NodeObjCreated(identityId, nodeId, profileStorage.getAsk(identityId), profileStorage.getStake(identityId));
    }
}
