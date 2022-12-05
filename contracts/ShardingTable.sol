// SPDX-License-Identifier: MIT

pragma solidity^0.8.0;

import { Hub } from "./Hub.sol";
import { IdentityStorage } from "./storage/IdentityStorage.sol";
import { ProfileStorage } from "./storage/ProfileStorage.sol";
import { ShardingTableStorage } from "./storage/ShardingTableStorage.sol";
import { StakingStorage } from "./storage/StakingStorage.sol";
import { Named } from "./interface/Named.sol";
import { Versioned } from "./interface/Versioned.sol";
import { ShardingTableStructs } from "./structs/ShardingTableStructs.sol";
import { NULL } from "./constants/ShardingTableConstants.sol";

contract ShardingTable is Named, Versioned {

    event NodeAdded(uint72 indexed identityId, bytes nodeId, uint96 ask, uint96 stake);
    event NodeRemoved(uint72 indexed identityId, bytes nodeId);

    string constant private _NAME = "ShardingTable";
    string constant private _VERSION = "1.0.0";

    Hub public hub;
    ProfileStorage public profileStorage;
    ShardingTableStorage public shardingTableStorage;
    StakingStorage public stakingStorage;

    constructor(address hubAddress) {
        require(hubAddress != address(0));

        hub = Hub(hubAddress);
    }

    modifier onlyHubOwner() {
		_checkHubOwner();
		_;
	}

    modifier onlyContracts() {
        _checkHub();
        _;
    }

    function initialize() public onlyHubOwner {
		profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        shardingTableStorage = ShardingTableStorage(hub.getContractAddress("ShardingTableStorage"));
        stakingStorage = StakingStorage(hub.getContractAddress("StakingStorage"));
	}

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function getShardingTable(uint72 startingIdentityId, uint72 nodesNumber)
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
        StakingStorage ss = stakingStorage;

        nodesPage[0] = ShardingTableStructs.NodeInfo({
            nodeId: ps.getNodeId(startingIdentityId),
            identityId: startingIdentityId,
            ask: ps.getAsk(startingNode.identityId),
            stake: ss.totalStakes(startingNode.identityId)
        });

        uint72 nextIdentityId = startingIdentityId;
        uint72 i = 1;
        while ((i < nodesNumber) && (nextIdentityId != NULL)) {
            nextIdentityId = sts.getNode(nextIdentityId).nextIdentityId;

            nodesPage[i] = ShardingTableStructs.NodeInfo({
                nodeId: ps.getNodeId(nextIdentityId),
                identityId: nextIdentityId,
                ask: ps.getAsk(nextIdentityId),
                stake: ss.totalStakes(nextIdentityId)
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

        emit NodeAdded(
            identityId,
            ps.getNodeId(identityId),
            ps.getAsk(identityId),
            stakingStorage.totalStakes(identityId)
        );
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

        emit NodeAdded(
            identityId,
            ps.getNodeId(identityId),
            ps.getAsk(identityId),
            stakingStorage.totalStakes(identityId)
        );
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

        emit NodeRemoved(identityId, ps.getNodeId(identityId));
    }

    function _checkHubOwner() internal view virtual {
		require(msg.sender == hub.owner(), "Fn can only be used by hub owner");
	}

    function _checkHub() internal view virtual {
        require(hub.isContract(msg.sender), "Fn can only be called by the hub");
    }

}
