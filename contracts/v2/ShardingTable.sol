// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {ProfileStorage} from "../v1/storage/ProfileStorage.sol";
import {ShardingTableStorageV2} from "./storage/ShardingTableStorage.sol";
import {StakingStorage} from "../v1/storage/StakingStorage.sol";
import {ContractStatus} from "../v1/abstract/ContractStatus.sol";
import {Initializable} from "../v1/interface/Initializable.sol";
import {Named} from "../v1/interface/Named.sol";
import {Versioned} from "../v1/interface/Versioned.sol";
import {ShardingTableStructsV2} from "./structs/ShardingTableStructsV2.sol";
import {ShardingTableErrors} from "./errors/ShardingTableErrors.sol";

import {NULL} from "../v1/constants/ShardingTableConstants.sol";

contract ShardingTableV2 is Named, Versioned, ContractStatus, Initializable {
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
    ) external view returns (ShardingTableStructsV2.NodeInfo[] memory) {
        return _getShardingTable(startingIdentityId, nodesNumber);
    }

    function getShardingTable() external view returns (ShardingTableStructsV2.NodeInfo[] memory) {
        ShardingTableStorageV2 sts = shardingTableStorage;
        return _getShardingTable(sts.head(), sts.nodesCount());
    }

    function insertNode(uint72 identityId) external onlyContracts {
        uint256 newNodeHashRingPosition = uint256(profileStorage.getNodeAddress(identityId, 1));
        (uint72 prevIdentityId, uint72 nextIdentityId) = _binarySearchForPosition(newNodeHashRingPosition);

        _insertNode(newNodeHashRingPosition, identityId, prevIdentityId, nextIdentityId);
    }

    function insertNode(uint72 identityId, uint72 prevIdentityId, uint72 nextIdentityId) external onlyContracts {
        _insertNode(uint256(profileStorage.getNodeAddress(identityId, 1)), identityId, prevIdentityId, nextIdentityId);
    }

    function removeNode(uint72 identityId) external onlyContracts {
        ShardingTableStorageV2 sts = shardingTableStorage;
        ProfileStorage ps = profileStorage;

        require(ps.profileExists(identityId), "Profile doesn't exist");

        ShardingTableStructsV2.Node memory nodeToRemove = sts.getNode(identityId);

        if (nodeToRemove.prevIdentityId == NULL) sts.setHead(nodeToRemove.nextIdentityId);
        sts.link(nodeToRemove.prevIdentityId, nodeToRemove.nextIdentityId);

        uint72 index = nodeToRemove.index;
        uint72 nextIdentityId = nodeToRemove.nextIdentityId;
        while (nextIdentityId != NULL) {
            sts.decrementNodeIndex(nextIdentityId);
            sts.setIdentityId(index, nextIdentityId);

            unchecked {
                index += 1;
            }
            nextIdentityId = sts.getNode(nextIdentityId).nextIdentityId;
        }

        sts.deleteNodeObject(identityId);
        sts.decrementNodesCount();

        emit NodeRemoved(identityId, profileStorage.getNodeId(identityId));
    }

    function _binarySearchForPosition(uint256 hashRingPosition) internal virtual returns (uint72, uint72) {
        ShardingTableStorageV2 sts = shardingTableStorage;

        int72 left;
        int72 mid;
        int72 right = int72(sts.nodesCount()) - 1;

        uint72 prevIdentityId;
        uint72 nextIdentityId;
        while (left <= right) {
            mid = (left + right) / 2;
            ShardingTableStructsV2.Node memory currentNode = sts.getNodeByIndex(uint72(mid));

            if (currentNode.hashRingPosition < hashRingPosition) {
                prevIdentityId = currentNode.identityId;
                left = mid + 1;
            } else if (currentNode.hashRingPosition > hashRingPosition) {
                nextIdentityId = currentNode.identityId;
                right = mid - 1;
            } else {
                prevIdentityId = currentNode.identityId;
                nextIdentityId = currentNode.nextIdentityId;
                break;
            }
        }

        return (prevIdentityId, nextIdentityId);
    }

    function _insertNode(
        uint256 newNodeHashRingPosition,
        uint72 identityId,
        uint72 prevIdentityId,
        uint72 nextIdentityId
    ) internal virtual {
        ShardingTableStorageV2 sts = shardingTableStorage;
        ProfileStorage ps = profileStorage;

        require(ps.profileExists(identityId), "Profile doesn't exist");

        ShardingTableStructsV2.Node memory prevNode = sts.getNode(prevIdentityId);

        if (prevNode.hashRingPosition > newNodeHashRingPosition)
            revert ShardingTableErrors.InvalidPreviousIdentityId(
                identityId,
                newNodeHashRingPosition,
                prevIdentityId,
                prevNode.hashRingPosition
            );

        ShardingTableStructsV2.Node memory nextNode = sts.getNode(nextIdentityId);

        if (nextNode.identityId != NULL && nextNode.hashRingPosition < newNodeHashRingPosition)
            revert ShardingTableErrors.InvalidNextIdentityId(
                identityId,
                newNodeHashRingPosition,
                nextIdentityId,
                nextNode.hashRingPosition
            );

        if (
            (prevIdentityId != NULL && nextIdentityId != prevNode.nextIdentityId) ||
            (nextIdentityId != NULL && prevIdentityId != nextNode.prevIdentityId)
        )
            revert ShardingTableErrors.InvalidPreviousOrNextIdentityId(
                identityId,
                prevIdentityId,
                nextNode.prevIdentityId,
                nextIdentityId,
                prevNode.nextIdentityId
            );

        uint72 index = nextIdentityId == NULL ? sts.nodesCount() : nextNode.index;
        sts.createNodeObject(newNodeHashRingPosition, identityId, prevIdentityId, nextIdentityId, index);
        sts.setIdentityId(index, identityId);
        sts.incrementNodesCount();

        if (prevIdentityId == NULL) sts.setHead(identityId);
        else sts.link(prevIdentityId, identityId);

        if (nextIdentityId != NULL) sts.link(identityId, nextIdentityId);

        unchecked {
            index += 1;
        }
        while (nextIdentityId != NULL) {
            sts.incrementNodeIndex(nextIdentityId);
            sts.setIdentityId(index, nextIdentityId);
            unchecked {
                index += 1;
            }
            nextIdentityId = sts.getNode(nextIdentityId).nextIdentityId;
        }

        emit NodeAdded(
            identityId,
            ps.getNodeId(identityId),
            ps.getAsk(identityId),
            stakingStorage.totalStakes(identityId)
        );
    }

    function _getShardingTable(
        uint72 startingIdentityId,
        uint72 nodesNumber
    ) internal view virtual returns (ShardingTableStructsV2.NodeInfo[] memory) {
        ShardingTableStructsV2.NodeInfo[] memory nodesPage;
        ShardingTableStorageV2 sts = shardingTableStorage;

        if ((sts.nodesCount() == 0) || (nodesNumber == 0)) return nodesPage;

        ShardingTableStructsV2.Node memory startingNode = sts.getNode(startingIdentityId);

        require((startingIdentityId == NULL) || (startingNode.identityId != NULL), "Wrong starting Identity ID");

        nodesPage = new ShardingTableStructsV2.NodeInfo[](nodesNumber);

        ProfileStorage ps = profileStorage;
        StakingStorage ss = stakingStorage;

        uint72 nextIdentityId = startingIdentityId;
        uint72 i;
        while ((i < nodesNumber) && (nextIdentityId != NULL)) {
            nodesPage[i] = ShardingTableStructsV2.NodeInfo({
                hashRingPosition: uint256(ps.getNodeAddress(nextIdentityId, 1)),
                nodeId: ps.getNodeId(nextIdentityId),
                identityId: nextIdentityId,
                ask: ps.getAsk(nextIdentityId),
                stake: ss.totalStakes(nextIdentityId)
            });

            nextIdentityId = sts.getNode(nextIdentityId).nextIdentityId;

            unchecked {
                i += 1;
            }
        }

        return nodesPage;
    }
}
