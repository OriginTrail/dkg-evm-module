// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {HubDependent} from "../abstract/HubDependent.sol";
import {Named} from "../interface/Named.sol";
import {Versioned} from "../interface/Versioned.sol";
import {ShardingTableStructsV1} from "../structs/ShardingTableStructsV1.sol";
import {NULL} from "../constants/ShardingTableConstants.sol";

contract ShardingTableStorage is Named, Versioned, HubDependent {
    string private constant _NAME = "ShardingTableStorage";
    string private constant _VERSION = "1.0.0";

    uint72 public head;
    uint72 public tail;
    uint72 public nodesCount;

    // identityId => Node
    mapping(uint72 => ShardingTableStructsV1.Node) internal nodes;

    constructor(address hubAddress) HubDependent(hubAddress) {
        head = NULL;
        tail = NULL;
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

    function setTail(uint72 identityId) external onlyContracts {
        tail = identityId;
    }

    function createNodeObject(uint72 identityId, uint72 prevIdentityId, uint72 nextIdentityId) external onlyContracts {
        nodes[identityId] = ShardingTableStructsV1.Node({
            identityId: identityId,
            prevIdentityId: prevIdentityId,
            nextIdentityId: nextIdentityId
        });
    }

    function getNode(uint72 identityId) external view returns (ShardingTableStructsV1.Node memory) {
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

    function getMultipleNodes(
        uint72 firstIdentityId,
        uint16 nodesNumber
    ) external view returns (ShardingTableStructsV1.Node[] memory) {
        ShardingTableStructsV1.Node[] memory nodesPage = new ShardingTableStructsV1.Node[](nodesNumber);

        ShardingTableStructsV1.Node memory currentNode = nodes[firstIdentityId];
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
