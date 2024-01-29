// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {HubDependent} from "../../v1/abstract/HubDependent.sol";
import {Named} from "../../v1/interface/Named.sol";
import {Versioned} from "../../v1/interface/Versioned.sol";
import {ShardingTableStructsV2} from "../structs/ShardingTableStructsV2.sol";
import {NULL} from "../../v1/constants/ShardingTableConstants.sol";

contract ShardingTableStorageV2 is Named, Versioned, HubDependent {
    string private constant _NAME = "ShardingTableStorage";
    string private constant _VERSION = "2.0.0";

    uint72 public nodesCount;

    // identityId => Node
    mapping(uint72 => ShardingTableStructsV2.Node) internal nodes;
    // index => identityId
    mapping(uint72 => uint72) public indexToIdentityId;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) HubDependent(hubAddress) {}

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function incrementNodesCount() external onlyContracts {
        nodesCount++;
    }

    function decrementNodesCount() external onlyContracts {
        nodesCount--;
    }

    function createNodeObject(uint256 hashRingPosition, uint72 identityId, uint72 index) external onlyContracts {
        nodes[identityId] = ShardingTableStructsV2.Node({
            hashRingPosition: hashRingPosition,
            index: index,
            identityId: identityId
        });
    }

    function getNode(uint72 identityId) external view returns (ShardingTableStructsV2.Node memory) {
        return nodes[identityId];
    }

    function deleteNodeObject(uint72 identityId) external onlyContracts {
        delete nodes[identityId];
    }

    function nodeExists(uint72 identityId) external view returns (bool) {
        return nodes[identityId].identityId != 0;
    }

    function head() external view returns (uint72) {
        return nodes[0].identityId;
    }

    function getHashRingPosition(uint72 identityId) external view returns (uint256) {
        return nodes[identityId].hashRingPosition;
    }

    function incrementNodeIndex(uint72 identityId) external onlyContracts {
        nodes[identityId].index += 1;
    }

    function decrementNodeIndex(uint72 identityId) external onlyContracts {
        nodes[identityId].index -= 1;
    }

    function setIdentityId(uint72 index, uint72 identityId) external onlyContracts {
        indexToIdentityId[index] = identityId;
    }

    function getNodeByIndex(uint72 index) external view returns (ShardingTableStructsV2.Node memory) {
        return nodes[indexToIdentityId[index]];
    }

    function getNeighborhoodBoundaryByIndexes(
        uint72 leftEdgeIndex,
        uint72 closestNodeIndex,
        uint72 rightEdgeIndex
    )
        external
        view
        returns (
            ShardingTableStructsV2.Node memory,
            ShardingTableStructsV2.Node memory,
            ShardingTableStructsV2.Node memory
        )
    {
        return (
            nodes[indexToIdentityId[leftEdgeIndex]],
            nodes[indexToIdentityId[closestNodeIndex]],
            nodes[indexToIdentityId[rightEdgeIndex]]
        );
    }

    function getAdjacentIdentityIdsByIndex(uint72 index) external view returns (uint72, uint72) {
        if (index == 0) {
            return (NULL, nodes[indexToIdentityId[index + 1]].identityId);
        }

        return (nodes[indexToIdentityId[index - 1]].identityId, nodes[indexToIdentityId[index + 1]].identityId);
    }

    function getHashRingPositionByIndex(uint72 index) external view returns (uint256) {
        return nodes[indexToIdentityId[index]].hashRingPosition;
    }

    function nodeExistsByIndex(uint72 index) external view returns (bool) {
        return nodes[indexToIdentityId[index]].identityId != 0;
    }

    function getMultipleNodes(
        uint72 firstIdentityId,
        uint16 nodesNumber
    ) external view returns (ShardingTableStructsV2.Node[] memory) {
        ShardingTableStructsV2.Node[] memory nodesPage = new ShardingTableStructsV2.Node[](nodesNumber);

        ShardingTableStructsV2.Node memory currentNode = nodes[firstIdentityId];
        for (uint256 i; i < nodesNumber; ) {
            nodesPage[i] = currentNode;
            currentNode = nodes[indexToIdentityId[currentNode.index + 1]];
            unchecked {
                i++;
            }
        }

        return nodesPage;
    }
}
