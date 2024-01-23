// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {ProfileStorage} from "../v1/storage/ProfileStorage.sol";
import {ShardingTableStorage} from "./storage/ShardingTableStorage.sol";
import {StakingStorage} from "../v1/storage/StakingStorage.sol";
import {ContractStatus} from "../v1/abstract/ContractStatus.sol";
import {Initializable} from "../v1/interface/Initializable.sol";
import {Named} from "./interface/Named.sol";
import {Versioned} from "./interface/Versioned.sol";
import {ShardingTableStructs} from "./structs/ShardingTableStructs.sol";

//import {NULL} from "../v1/constants/ShardingTableConstants.sol";

contract ShardingTable is Named, Versioned, ContractStatus, Initializable {
    event NodeAdded(uint72 indexed identityId, bytes nodeId, uint96 ask, uint96 stake);
    event NodeRemoved(uint72 indexed identityId, bytes nodeId);

    string private constant _NAME = "ShardingTable";
    string private constant _VERSION = "1.0.1";

    ProfileStorage public profileStorage;
    ShardingTableStorage public shardingTableStorage;
    StakingStorage public stakingStorage;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) ContractStatus(hubAddress) {}

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

    function getShardingTable(
        uint72 startingIdentityId,
        uint72 nodesNumber
    ) external view returns (ShardingTableStructs.NodeInfo[] memory) {
        return _getShardingTable(startingIdentityId, nodesNumber);
    }

    function getShardingTable() external view returns (ShardingTableStructs.NodeInfo[] memory) {
        ShardingTableStorage sts = shardingTableStorage;
        return _getShardingTable(sts.head(), sts.nodesCount());
    }

    //
    //    function pushBack(uint72 identityId) external onlyContracts {
    //        ProfileStorage ps = profileStorage;
    //        require(ps.profileExists(identityId), "Profile doesn't exist");
    //
    //        ShardingTableStorage sts = shardingTableStorage;
    //
    //        sts.createNodeObject(identityId, NULL, NULL);
    //
    //        if (sts.tail() != NULL) sts.link(sts.tail(), identityId);
    //
    //        sts.setTail(identityId);
    //
    //        if (sts.head() == NULL) sts.setHead(identityId);
    //
    //        sts.incrementNodesCount();
    //
    //        emit NodeAdded(
    //            identityId,
    //            ps.getNodeId(identityId),
    //            ps.getAsk(identityId),
    //            stakingStorage.totalStakes(identityId)
    //        );
    //    }
    //
    //    function pushFront(uint72 identityId) external onlyContracts {
    //        ProfileStorage ps = profileStorage;
    //        require(ps.profileExists(identityId), "Profile doesn't exist");
    //
    //        ShardingTableStorage sts = shardingTableStorage;
    //
    //        sts.createNodeObject(identityId, NULL, NULL);
    //
    //        if (sts.head() != NULL) sts.link(identityId, sts.head());
    //
    //        shardingTableStorage.setHead(identityId);
    //
    //        if (sts.tail() == NULL) sts.setTail(identityId);
    //
    //        sts.incrementNodesCount();
    //
    //        emit NodeAdded(
    //            identityId,
    //            ps.getNodeId(identityId),
    //            ps.getAsk(identityId),
    //            stakingStorage.totalStakes(identityId)
    //        );
    //    }

    function insertNode(uint72 identityId, uint72 previousIdentityId, uint72 nextIdentityId) external onlyContracts {
        ProfileStorage ps = profileStorage;
        require(ps.profileExists(identityId), "Profile doesn't exist");

        ShardingTableStorage sts = shardingTableStorage;

        ShardingTableStructs.Node previousNode = sts.getNode(previousIdentityId);

        ShardingTableStructs.Node nextNode = sts.getNode(nextIdentityId);

        if (
            previousIdentityId == identityId ||
            (previousIdentityId > identityId && previousNode.index != sts.nodesCount)
        ) {
            revert("Invalid previous node id");
        }

        if (nextIdentityId == identityId || (nextIdentityId < identityId && nextNode.index != 0)) {
            revert("Invalid next node id");
        }

        if (nextNode.index - previousNode.index != 1 && nextNode.index != 0) {
            revert("Invalid previous and next node id");
        }

        sts.createNodeObject(identityId, nextNode.index, previousIdentityId, nextIdentityId);

        for (uint i = nextNode.index + 1; i < sts.nodesCount - 1; i++) {
            nextNode.index = i;
            nextNode = sts.getNode(nextNode.nextIdentityId);
        }

        sts.link(previousIdentityId, identityId, nextIdentityId);

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

        ShardingTableStructs.Node nextNode = sts.getNode(nodeToRemove.nextIdentityId);

        sts.link(nodeToRemove.prevIdentityId, nodeToRemove.nextIdentityId);

        for (uint i = nodeToRemove.index; i < sts.nodesCount - 1; i++) {
            nextNode.index = i;
            nextNode = sts.getNode(nextNode.nextIdentityId);
        }

        sts.deleteNodeObject(identityId);
        sts.decrementNodesCount();

        emit NodeRemoved(identityId, ps.getNodeId(identityId));
    }

    function _getShardingTable(
        uint72 startingIdentityId,
        uint72 nodesNumber
    ) internal view virtual returns (ShardingTableStructs.NodeInfo[] memory) {
        ShardingTableStructs.NodeInfo[] memory nodesPage;
        ShardingTableStorage sts = shardingTableStorage;

        if ((sts.nodesCount() == 0) || (nodesNumber == 0)) {
            return nodesPage;
        }

        ShardingTableStructs.Node memory startingNode = sts.getNode(startingIdentityId);

        require((startingIdentityId == NULL) || (startingNode.identityId != NULL), "Wrong starting Identity ID");

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

            unchecked {
                i += 1;
            }
        }

        return nodesPage;
    }
}
