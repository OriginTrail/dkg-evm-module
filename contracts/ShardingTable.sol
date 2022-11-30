// SPDX-License-Identifier: MIT

pragma solidity^0.8.0;

import { Hub } from "./Hub.sol";
import { IdentityStorage } from "./storage/IdentityStorage.sol";
import { ProfileStorage } from "./storage/ProfileStorage.sol";
import { ShardingTableStorage } from "./storage/ShardingTableStorage.sol";
import { ShardingTableStructs } from "./structs/ShardingTableStructs.sol";
import { NULL } from "./constants/ShardingTableConstants.sol";

contract ShardingTable {

    Hub public hub;
    ProfileStorage public profileStorage;
    ShardingTableStorage public shardingTableStorage;

    constructor(address hubAddress) {
        require(hubAddress != address(0));

        hub = Hub(hubAddress);
        shardingTableStorage = ShardingTableStorage(hub.getContractAddress("ShardingTableStorage"));
        profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
    }

    modifier onlyContracts() {
        _checkHub();
        _;
    }

    function getShardingTable(uint72 startingIdentityId, uint16 nodesNumber)
        public
        view
        returns (ShardingTableStructs.NodeInfo[] memory)
    {
        ShardingTableStructs.NodeInfo[] memory nodesPage;
        ShardingTableStorage sts = shardingTableStorage;

        if ((sts.nodesCount() == 0) || (nodesNumber == 0)) {
            return nodesPage;
        }

        ShardingTableStructs.Node memory startingNode = sts.getNode(startingIdentityId);

        require((startingIdentityId == NULL) || (startingNode.identityId != NULL));

        nodesPage = new ShardingTableStructs.NodeInfo[](nodesNumber);

        ProfileStorage ps = profileStorage;

        nodesPage[0] = ShardingTableStructs.NodeInfo({
            id: ps.getNodeId(startingIdentityId),
            ask: ps.getAsk(startingNode.identityId),
            stake: ps.getStake(startingNode.identityId)
        });

        ShardingTableStructs.Node memory nextNode;
        uint72 nextIdentityId;
        uint72 i = 1;
        while ((i < nodesNumber) && (nextIdentityId != NULL)) {
            nextIdentityId = sts.getNode(nodesPage[i-1].id).nextIdentityId;

            nodesPage[i] = ShardingTableStructs.NodeInfo({
                id: ps.getNodeId(nextIdentityId),
                ask: ps.getAsk(nextIdentityId),
                stake: ps.getStake(nextIdentityId)
            });

            unchecked { i += 1; }
        }
        return nodesPage;
    }

    function getShardingTable() external view returns (ShardingTableStructs.NodeInfo[] memory) {
        ShardingTableStorage sts = shardingTableStorage;
        return getShardingTable(sts.head(), sts.nodesCount());
    }

    function pushBack(uint72 identityId) external onlyContracts {
        ProfileStorage ps = profileStorage;
        require(ps.profileExists(identityId), "Profile doesn't exist");

        ShardingTableStorage sts = shardingTableStorage;

        sts.createNode(identityId, NULL, NULL);

        if (sts.tail() != NULL)
            sts.link(sts.tail(), identityId);

        sts.setTail(identityId);

        if (sts.head() == NULL)
            sts.setHead(identityId);

        sts.incrementNodesCount();
    }

    function pushFront(uint72 identityId) external onlyContracts {
        ProfileStorage ps = profileStorage;
        require(ps.profileExists(identityId), "Profile doesn't exist");

        ShardingTableStorage sts = shardingTableStorage;

        sts.createNode(identityId, NULL, NULL);

        if (sts.head() != NULL)
            sts.link(identityId, sts.head());

        shardingTableStorage.setHead(identityId);

        if (sts.tail() == NULL)
            sts.setTail(identityId);

        sts.incrementNodesCount();
    }

    function removeNode(uint72 identityId) external onlyContracts {
        ProfileStorage ps = profileStorage;
        require(ps.profileExists(identityId), "Profile doesn't exist");

        ShardingTableStorage sts = shardingTableStorage;

        ShardingTableStructs.Node memory nodeToRemove = sts.getNode(identityId);

        uint72 head = sts.head();
        uint72 tail = sts.tail();

        if ((head == identityId) && (tail == identityId)) {
            sts.setHead(NULL);
            sts.setTail(NULL);
        } else if (tail == identityId) {
            sts.setTail(nodeToRemove.prevIdentityId);
            sts.setNextIdentityId(tail, NULL);
        } else if (head == identityId) {
            sts.setHead(nodeToRemove.nextIdentityId);
            sts.setPrevIdentityId(head, NULL);
        } else {
            sts.link(nodeToRemove.prevIdentityId, nodeToRemove.nextIdentityId);
        }

        sts.removeNode(identityId);
        sts.decrementNodesCount();
    }

    function _checkHub() internal view virtual {
        require(hub.isContract(msg.sender), "Fn can only be called by the hub");
    }

}
