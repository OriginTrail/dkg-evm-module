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

    uint72 public head;
    uint72 public nodesCount;

    // identityId => Node
    mapping(uint72 => ShardingTableStructsV2.Node) internal nodes;
    // index => identityId
    mapping(uint72 => uint72) internal identityIds;

    constructor(address hubAddress) HubDependent(hubAddress) {
        head = NULL;
    }

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

    function setHead(uint72 identityId) external onlyContracts {
        head = identityId;
    }

    function createNodeObject(
        uint256 hashRingPosition,
        uint72 identityId,
        uint72 prevIdentityId,
        uint72 nextIdentityId,
        uint72 index
    ) external onlyContracts {
        nodes[identityId] = ShardingTableStructsV2.Node({
            hashRingPosition: hashRingPosition,
            index: index,
            identityId: identityId,
            prevIdentityId: prevIdentityId,
            nextIdentityId: nextIdentityId
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

    function setPrevIdentityId(uint72 identityId, uint72 newPrevIdentityId) external onlyContracts {
        nodes[identityId].prevIdentityId = newPrevIdentityId;
    }

    function setNextIdentityId(uint72 identityId, uint72 newNextIdentityId) external onlyContracts {
        nodes[identityId].nextIdentityId = newNextIdentityId;
    }

    function incrementNodeIndex(uint72 identityId) external onlyContracts {
        nodes[identityId].index += 1;
    }

    function decrementNodeIndex(uint72 identityId) external onlyContracts {
        nodes[identityId].index -= 1;
    }

    function getIdentityIdByIndex(uint72 index) external view returns (uint72) {
        return identityIds[index];
    }

    function setIdentityId(uint72 index, uint72 identityId) external onlyContracts {
        identityIds[index] = identityId;
    }

    function getNodeByIndex(uint72 index) external view returns (ShardingTableStructsV2.Node memory) {
        return nodes[identityIds[index]];
    }

    function getMultipleNodes(
        uint72 firstIdentityId,
        uint16 nodesNumber
    ) external view returns (ShardingTableStructsV2.Node[] memory) {
        ShardingTableStructsV2.Node[] memory nodesPage = new ShardingTableStructsV2.Node[](nodesNumber);

        ShardingTableStructsV2.Node memory currentNode = nodes[firstIdentityId];
        for (uint256 i; i < nodesNumber; ) {
            nodesPage[i] = currentNode;
            currentNode = nodes[currentNode.nextIdentityId];
            unchecked {
                i++;
            }
        }

        return nodesPage;
    }

    function link(uint72 leftNodeIdentityId, uint72 rightNodeIdentityId) external onlyContracts {
        nodes[leftNodeIdentityId].nextIdentityId = rightNodeIdentityId;
        nodes[rightNodeIdentityId].prevIdentityId = leftNodeIdentityId;
    }
}
