// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {ProfileStorage} from "../v1/storage/ProfileStorage.sol";
import {ShardingTableStorageV2} from "./storage/ShardingTableStorage.sol";
import {ShardingTableStorage} from "../v1/storage/ShardingTableStorage.sol";
import {StakingStorage} from "../v1/storage/StakingStorage.sol";
import {ContractStatus} from "../v1/abstract/ContractStatus.sol";
import {Initializable} from "../v1/interface/Initializable.sol";
import {Named} from "../v1/interface/Named.sol";
import {Versioned} from "../v1/interface/Versioned.sol";
import {ShardingTableStructsV1} from "../v1/structs/ShardingTableStructsV1.sol";
import {ShardingTableStructsV2} from "./structs/ShardingTableStructsV2.sol";
import {ShardingTableErrors} from "./errors/ShardingTableErrors.sol";

import {NULL} from "../v1/constants/ShardingTableConstants.sol";

contract ShardingTableV2 is Named, Versioned, ContractStatus, Initializable {
    event NodeAdded(uint72 indexed identityId, bytes nodeId, uint96 ask, uint96 stake);
    event NodeRemoved(uint72 indexed identityId, bytes nodeId);

    string private constant _NAME = "ShardingTable";
    string private constant _VERSION = "2.0.1";

    ProfileStorage public profileStorage;
    ShardingTableStorageV2 public shardingTableStorage;
    StakingStorage public stakingStorage;

    uint256 public migrationPeriodEnd;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress, uint256 migrationPeriodEnd_) ContractStatus(hubAddress) {
        migrationPeriodEnd = migrationPeriodEnd_;
    }

    function initialize() public onlyHubOwner {
        profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        shardingTableStorage = ShardingTableStorageV2(hub.getContractAddress("ShardingTableStorage"));
        stakingStorage = StakingStorage(hub.getContractAddress("StakingStorage"));
    }

    modifier timeLimited() {
        require(block.timestamp < migrationPeriodEnd, "Migration period has ended");
        _;
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
    ) external view returns (ShardingTableStructsV1.NodeInfo[] memory) {
        return _getShardingTable(startingIdentityId, nodesNumber);
    }

    function getShardingTable() external view returns (ShardingTableStructsV1.NodeInfo[] memory) {
        ShardingTableStorageV2 sts = shardingTableStorage;
        return _getShardingTable(sts.indexToIdentityId(0), sts.nodesCount());
    }

    function insertNode(uint72 identityId) external onlyContracts {
        uint256 newNodeHashRingPosition = uint256(profileStorage.getNodeAddress(identityId, 1));

        _insertNode(_binarySearchForIndex(newNodeHashRingPosition), identityId, newNodeHashRingPosition);
    }

    function insertNode(uint72 index, uint72 identityId) external onlyContracts {
        _insertNode(index, identityId, uint256(profileStorage.getNodeAddress(identityId, 1)));
    }

    function migrateOldShardingTable(
        uint72 startingIdentityId,
        uint16 numberOfNodes,
        address shardingTableStorageV1Address
    ) external onlyHubOwner timeLimited {
        ShardingTableStorageV2 stsv2 = shardingTableStorage;
        ShardingTableStorage stsv1 = ShardingTableStorage(shardingTableStorageV1Address);

        ShardingTableStructsV1.Node[] memory nodes = stsv1.getMultipleNodes(startingIdentityId, numberOfNodes);

        for (uint i; i < nodes.length; ) {
            if (!stsv2.nodeExists(nodes[i].identityId)) {
                uint256 nodeHashRingPosition = uint256(profileStorage.getNodeAddress(nodes[i].identityId, 1));
                _insertNode(_binarySearchForIndex(nodeHashRingPosition), nodes[i].identityId, nodeHashRingPosition);
            }

            unchecked {
                i++;
            }
        }
    }

    function removeNode(uint72 identityId) external onlyContracts {
        ShardingTableStorageV2 sts = shardingTableStorage;

        ShardingTableStructsV2.Node memory nodeToRemove = sts.getNode(identityId);

        // Decrement indexes of all nodes after removed one + add pointers to identityId for changed indexes
        uint72 index = nodeToRemove.index;
        uint72 nextIdentityId = sts.indexToIdentityId(nodeToRemove.index + 1);
        while (nextIdentityId != NULL) {
            sts.decrementNodeIndex(nextIdentityId);
            sts.setIdentityId(index, nextIdentityId);

            unchecked {
                index += 1;
            }

            nextIdentityId = sts.indexToIdentityId(index + 1);
        }

        // Delete node object + set last index pointer to be NULL + decrement total nodes count
        sts.deleteNodeObject(identityId);
        sts.setIdentityId(index, NULL);
        sts.decrementNodesCount();

        emit NodeRemoved(identityId, profileStorage.getNodeId(identityId));
    }

    function _binarySearchForIndex(uint256 hashRingPosition) internal virtual returns (uint72) {
        ShardingTableStorageV2 sts = shardingTableStorage;

        uint72 nodesCount = sts.nodesCount();

        if (nodesCount == 0) {
            return 0;
        }

        uint72 left;
        uint72 mid;
        uint72 right = nodesCount - 1;

        while (left <= right) {
            mid = (left + right) / 2;
            uint256 currentHashRingPosition = sts.getHashRingPositionByIndex(mid);

            if (hashRingPosition > currentHashRingPosition) {
                // Node is in the right half of the range, move left pointers
                left = mid + 1;
            } else if (hashRingPosition < currentHashRingPosition) {
                if (mid == 0) {
                    // The new element should be inserted at index 0
                    return 0;
                }
                // Node is in the left half of the range, move right pointers
                right = mid - 1;
            } else {
                // Exact match found
                return mid;
            }
        }

        return left;
    }

    function _insertNode(uint72 index, uint72 identityId, uint256 newNodeHashRingPosition) internal virtual {
        ShardingTableStorageV2 sts = shardingTableStorage;
        ProfileStorage ps = profileStorage;

        if (sts.nodeExists(identityId)) {
            revert ShardingTableErrors.NodeAlreadyInTheShardingTable(identityId);
        }

        if (index != 0) {
            uint256 prevNodeHashRingPosition = sts.getHashRingPositionByIndex(index - 1);

            // Check that the new Node is indeed on the right from the prevNode
            // Also allows new Head insertion as prevNode.hashRingPosition will be 0 in such case
            if (newNodeHashRingPosition < prevNodeHashRingPosition) {
                revert ShardingTableErrors.InvalidIndexWithRespectToPreviousNode(
                    identityId,
                    newNodeHashRingPosition,
                    prevNodeHashRingPosition
                );
            }
        }

        ShardingTableStructsV2.Node memory nextNode = sts.getNodeByIndex(index);

        // Check that the new Node is indeed on the left from the nextNode
        // Check is skipped when inserting new Tail
        if (nextNode.identityId != NULL && newNodeHashRingPosition > nextNode.hashRingPosition) {
            revert ShardingTableErrors.InvalidIndexWithRespectToNextNode(
                identityId,
                newNodeHashRingPosition,
                nextNode.hashRingPosition
            );
        }
        // Create node object + set index pointer to new identityId + increment total nodes count
        sts.createNodeObject(newNodeHashRingPosition, ps.getNodeId(identityId), identityId, index);
        sts.setIdentityId(index, identityId);
        sts.incrementNodesCount();

        // Increment indexes of all nodes after inserted one + add pointers to identityId for changed indexes
        uint72 currentIdentityId;
        uint72 nextIdentityId = nextNode.identityId;
        while (nextIdentityId != NULL) {
            unchecked {
                index += 1;
            }

            currentIdentityId = nextIdentityId;
            nextIdentityId = sts.indexToIdentityId(index);

            sts.incrementNodeIndex(currentIdentityId);
            sts.setIdentityId(index, currentIdentityId);
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
    ) internal view virtual returns (ShardingTableStructsV1.NodeInfo[] memory) {
        ShardingTableStructsV1.NodeInfo[] memory nodesPage;
        ShardingTableStorageV2 sts = shardingTableStorage;

        if ((sts.nodesCount() == 0) || (nodesNumber == 0)) {
            return nodesPage;
        }
        ShardingTableStructsV2.Node memory startingNode = sts.getNode(startingIdentityId);

        require((startingIdentityId == NULL) || (startingNode.identityId != NULL), "Wrong starting Identity ID");

        nodesPage = new ShardingTableStructsV1.NodeInfo[](nodesNumber);

        ProfileStorage ps = profileStorage;
        StakingStorage ss = stakingStorage;

        uint72 nextIdentityId = startingIdentityId;
        uint72 index;
        while ((index < nodesNumber) && (nextIdentityId != NULL)) {
            nodesPage[index] = ShardingTableStructsV1.NodeInfo({
                nodeId: ps.getNodeId(nextIdentityId),
                identityId: nextIdentityId,
                ask: ps.getAsk(nextIdentityId),
                stake: ss.totalStakes(nextIdentityId)
            });

            unchecked {
                index += 1;
            }
            nextIdentityId = sts.indexToIdentityId(index + startingNode.index);
        }

        return nodesPage;
    }
}
