// SPDX-License-Identifier: MIT

pragma solidity^0.8.0;

import {Hub} from './Hub.sol';
import {ProfileStorage} from './storage/ProfileStorage.sol';
import {IShardingTableStructs} from './interface/IShardingTableStructs.sol';
import {ShardingTableStorage} from './storage/ShardingTableStorage.sol';

contract ShardingTable is IShardingTableStructs {

    Hub public hub;

    bytes private emptyPointer;

    constructor(address hubAddress) {
        require(hubAddress != address(0));
        hub = Hub(hubAddress);

        emptyPointer = "";
    }

    modifier onlyProfile() {
        require(
            msg.sender == hub.getContractAddress("Profile"),
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
        address shardingTableStorageAddress = hub.getContractAddress("ShardingTableStorage");
        ShardingTableStorage shardingTableStorage = ShardingTableStorage(shardingTableStorageAddress);

        Node memory startingNode = shardingTableStorage.getNode(startingNodeId);

        require(
            !shardingTableStorage.equalIdHashes(startingNode.id, "") ||
            shardingTableStorage.equalIdHashes(startingNodeId, emptyPointer)
        );

        NodeInfo[] memory nodesPage;

        if (shardingTableStorage.nodesCount() == 0) {
            return nodesPage;
        }

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
        while (i < nodesNumber && !shardingTableStorage.equalIdHashes(prevNode.nextNodeId, emptyPointer)) {
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

    function pushBack(uint96 identityId)
        public
        onlyProfile
    {
        ShardingTableStorage(hub.getContractAddress("ShardingTableStorage")).pushBack(identityId);
    }

    function pushFront(uint96 identityId)
        public
        onlyProfile
    {
        ShardingTableStorage(hub.getContractAddress("ShardingTableStorage")).pushFront(identityId);
    }

    function removeNode(uint96 identityId)
        public
        onlyProfile
    {
        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        bytes memory nodeId = profileStorage.getNodeId(identityId);

        ShardingTableStorage(hub.getContractAddress("ShardingTableStorage")).removeNodeById(nodeId);
    }

    function removeNodeById(bytes memory nodeId)
        public
        onlyHubOwner
    {
        ShardingTableStorage(hub.getContractAddress("ShardingTableStorage")).removeNodeById(nodeId);
    }
}
