// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {HubDependent} from "../abstract/HubDependent.sol";
import {INamed} from "../interfaces/INamed.sol";
import {IVersioned} from "../interfaces/IVersioned.sol";
import {ShardingTableLib} from "../libraries/ShardingTableLib.sol";

contract ShardingTableStorage is INamed, IVersioned, HubDependent {
    string private constant _NAME = "ShardingTableStorage";
    string private constant _VERSION = "1.0.0";

    uint72 public nodesCount;
    uint96 public totalStake;
    uint256 public weightedAskSum;

    // identityId => Node
    mapping(uint72 => ShardingTableLib.Node) internal nodes;
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

    function getStakeWeightedAverageAsk() external view returns (uint256) {
        return totalStake > 0 ? weightedAskSum / totalStake : 0;
    }

    function setTotalStake(uint96 _totalStake) external onlyContracts {
        totalStake = _totalStake;
    }

    function setWeightedAskSum(uint256 _weightedAskSum) external onlyContracts {
        weightedAskSum = _weightedAskSum;
    }

    function onStakeChanged(uint96 oldStake, uint96 newStake, uint96 ask) external onlyContracts {
        weightedAskSum = weightedAskSum - (ask * oldStake) + (ask * newStake);
        totalStake = totalStake - oldStake + newStake;
    }

    function onAskChanged(uint96 oldAsk, uint96 newAsk, uint96 stake) external onlyContracts {
        weightedAskSum = weightedAskSum - (oldAsk * stake) + (newAsk * stake);
    }

    function createNodeObject(
        uint256 hashRingPosition,
        bytes calldata nodeId,
        uint72 identityId,
        uint72 index
    ) external onlyContracts {
        nodes[identityId] = ShardingTableLib.Node({
            hashRingPosition: hashRingPosition,
            index: index,
            nodeId: nodeId,
            identityId: identityId
        });
    }

    function getNode(uint72 identityId) external view returns (ShardingTableLib.Node memory) {
        return nodes[identityId];
    }

    function deleteNodeObject(uint72 identityId) external onlyContracts {
        delete nodes[identityId];
    }

    function nodeExists(uint72 identityId) external view returns (bool) {
        return nodes[identityId].identityId != 0;
    }

    function head() external view returns (uint72) {
        return indexToIdentityId[0];
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

    function getNodeByIndex(uint72 index) external view returns (ShardingTableLib.Node memory) {
        return nodes[indexToIdentityId[index]];
    }

    function getNeighborhoodBoundaryByIndexes(
        uint72 leftEdgeIndex,
        uint72 closestNodeIndex,
        uint72 rightEdgeIndex
    ) external view returns (ShardingTableLib.Node memory, ShardingTableLib.Node memory, ShardingTableLib.Node memory) {
        return (
            nodes[indexToIdentityId[leftEdgeIndex]],
            nodes[indexToIdentityId[closestNodeIndex]],
            nodes[indexToIdentityId[rightEdgeIndex]]
        );
    }

    function getAdjacentIdentityIdsByIndex(uint72 index) external view returns (uint72, uint72) {
        if (index == 0) {
            return (ShardingTableLib.NULL, nodes[indexToIdentityId[index + 1]].identityId);
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
    ) external view returns (ShardingTableLib.Node[] memory) {
        ShardingTableLib.Node[] memory nodesPage = new ShardingTableLib.Node[](nodesNumber);

        ShardingTableLib.Node memory currentNode = nodes[firstIdentityId];
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
