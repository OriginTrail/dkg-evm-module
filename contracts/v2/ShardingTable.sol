// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {ProfileStorage} from "../v1/storage/ProfileStorage.sol";
import {ShardingTableStorageV2} from "./storage/ShardingTableStorage.sol";
import {StakingStorage} from "../v1/storage/StakingStorage.sol";
import {ContractStatus} from "../v1/abstract/ContractStatus.sol";
import {Initializable} from "../v1/interface/Initializable.sol";
import {Named} from "../v1/interface/Named.sol";
import {Versioned} from "../v1/interface/Versioned.sol";
import {ShardingTableStructs} from "./structs/ShardingTableStructs.sol";
import {ShardingTableErrors} from "./errors/ShardingTableErrors.sol";

import {NULL} from "../v1/constants/ShardingTableConstants.sol";

contract ShardingTable is Named, Versioned, ContractStatus, Initializable {
    event NodeAdded(uint72 indexed identityId, bytes nodeId, uint96 ask, uint96 stake);
    event NodeRemoved(uint72 indexed identityId, bytes nodeId);

    string private constant _NAME = "ShardingTable";
    string private constant _VERSION = "2.0.0";

    ProfileStorage public profileStorage;
    ShardingTableStorageV2 public shardingTableStorage;
    StakingStorage public stakingStorage;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) ContractStatus(hubAddress) {}

    function initialize() public onlyHubOwner {
        profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        shardingTableStorage = ShardingTableStorageV2(hub.getContractAddress("ShardingTableStorage"));
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
        ShardingTableStorageV2 sts = shardingTableStorage;
        return _getShardingTable(sts.head(), sts.nodesCount());
    }

    function insertNode(uint72 identityId, uint72 prevIdentityId, uint72 nextIdentityId) external onlyContracts {
        ProfileStorage ps = profileStorage;

        uint256 newNodeHashRingPosition = uint256(ps.getNodeAddress(identityId, 1));

        require(newNodeHashRingPosition != 0, "Profile doesn't exist");

        ShardingTableStorageV2 sts = shardingTableStorage;

        ShardingTableStructs.Node memory prevNode = sts.getNode(prevIdentityId);

        if (prevNode.hashRingPosition > newNodeHashRingPosition) {
            revert ShardingTableErrors.InvalidPreviousIdentityId(
                identityId,
                newNodeHashRingPosition,
                prevIdentityId,
                prevNode.hashRingPosition
            );
        }

        ShardingTableStructs.Node memory nextNode = sts.getNode(nextIdentityId);

        if (nextNode.identityId != NULL && nextNode.hashRingPosition < newNodeHashRingPosition) {
            revert ShardingTableErrors.InvalidNextIdentityId(
                identityId,
                newNodeHashRingPosition,
                nextIdentityId,
                nextNode.hashRingPosition
            );
        }

        if (prevNode.nextIdentityId != nextNode.prevIdentityId) {
            revert ShardingTableErrors.InvalidPreviousOrNextIdentityId(
                identityId,
                prevIdentityId,
                nextNode.prevIdentityId,
                nextIdentityId,
                prevNode.nextIdentityId
            );
        }

        sts.createNodeObject(
            uint256(ps.getNodeAddress(identityId, 1)),
            nextNode.index,
            identityId,
            prevIdentityId,
            nextIdentityId
        );

        sts.incrementNodesCount();

        if (prevIdentityId == NULL) {
            sts.setHead(identityId);
        } else {
            sts.link(prevIdentityId, identityId);
        }

        if (nextIdentityId == NULL) {
            sts.setTail(identityId);
        } else {
            sts.link(identityId, nextIdentityId);
        }

        while (nextIdentityId != NULL) {
            sts.incrementNodeIndex(nextIdentityId);
            nextIdentityId = sts.getNode(nextIdentityId).nextIdentityId;
        }

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

        ShardingTableStorageV2 sts = shardingTableStorage;

        ShardingTableStructs.Node memory nodeToRemove = sts.getNode(identityId);

        ShardingTableStructs.Node memory nextNode = sts.getNode(nodeToRemove.nextIdentityId);

        sts.link(nodeToRemove.prevIdentityId, nodeToRemove.nextIdentityId);

        uint72 count = sts.nodesCount();

        require(count > 1, "Invalid nodes count");
        for (uint72 i = nodeToRemove.index; i < count - 1; i++) {
            sts.setIndex(nextNode.identityId, i);
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
        ShardingTableStorageV2 sts = shardingTableStorage;

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
