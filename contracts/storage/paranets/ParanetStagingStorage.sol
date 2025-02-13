// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {INamed} from "../../interfaces/INamed.sol";
import {IVersioned} from "../../interfaces/IVersioned.sol";
import {HubDependent} from "../../abstract/HubDependent.sol";
import {ParanetLib} from "../../libraries/ParanetLib.sol";

contract ParanetStagingStorage is INamed, IVersioned, HubDependent {
    string private constant _NAME = "ParanetStagingStorage";
    string private constant _VERSION = "1.0.0";

    // Events
    event KnowledgeCollectionStaged(bytes32 indexed paranetId, bytes32 indexed collectionId, address indexed submitter);
    event KnowledgeCollectionReviewed(bytes32 indexed paranetId, bytes32 indexed collectionId, bool accepted);
    event CuratorAdded(address indexed curator);
    event CuratorRemoved(address indexed curator);

    // Paranet ID => Collection ID => Staging Status
    mapping(bytes32 => mapping(bytes32 => ParanetLib.RequestStatus)) public stagedCollections;

    // Paranet ID => Collection ID => Submitter Address
    mapping(bytes32 => mapping(bytes32 => address)) public collectionSubmitters;

    // Curator addresses
    mapping(address => bool) public curators;

    // Add these structs and functions
    struct StagedCollection {
        bytes32 collectionId;
        address submitter;
        ParanetLib.RequestStatus status;
    }

    // Track collections for pagination
    mapping(bytes32 => bytes32[]) private pendingCollectionIds;
    // Paranet ID => Collection ID => Index
    mapping(bytes32 => mapping(bytes32 => uint256)) private pendingCollectionIndexes;

    constructor(address hubAddress) HubDependent(hubAddress) {}

    function name() external pure override returns (string memory) {
        return _NAME;
    }

    function version() external pure override returns (string memory) {
        return _VERSION;
    }

    function addCurator(address curator) external onlyContracts {
        curators[curator] = true;
        emit CuratorAdded(curator);
    }

    function removeCurator(address curator) external onlyContracts {
        curators[curator] = false;
        emit CuratorRemoved(curator);
    }

    function isCurator(address account) external view returns (bool) {
        return curators[account];
    }

    function stageKnowledgeCollection(
        bytes32 paranetId,
        bytes32 collectionId,
        address submitter
    ) external onlyContracts {
        stagedCollections[paranetId][collectionId] = ParanetLib.RequestStatus.PENDING;
        collectionSubmitters[paranetId][collectionId] = submitter;
        emit KnowledgeCollectionStaged(paranetId, collectionId, submitter);
        _addToPendingCollections(paranetId, collectionId);
    }

    function reviewKnowledgeCollection(bytes32 paranetId, bytes32 collectionId, bool accepted) external onlyContracts {
        stagedCollections[paranetId][collectionId] = accepted
            ? ParanetLib.RequestStatus.APPROVED
            : ParanetLib.RequestStatus.REJECTED;

        emit KnowledgeCollectionReviewed(paranetId, collectionId, accepted);
        _removeFromPendingCollections(paranetId, collectionId);
    }

    function isKnowledgeCollectionStaged(bytes32 paranetId, bytes32 collectionId) external view returns (bool) {
        return stagedCollections[paranetId][collectionId] != ParanetLib.RequestStatus.NONE;
    }

    function getKnowledgeCollectionStatus(
        bytes32 paranetId,
        bytes32 collectionId
    ) external view returns (ParanetLib.RequestStatus) {
        return stagedCollections[paranetId][collectionId];
    }

    function getKnowledgeCollectionSubmitter(bytes32 paranetId, bytes32 collectionId) external view returns (address) {
        return collectionSubmitters[paranetId][collectionId];
    }

    // Add this after stageKnowledgeCollection function
    function _addToPendingCollections(bytes32 paranetId, bytes32 collectionId) internal {
        pendingCollectionIndexes[paranetId][collectionId] = pendingCollectionIds[paranetId].length;
        pendingCollectionIds[paranetId].push(collectionId);
    }

    // Add this in reviewKnowledgeCollection function after status update
    function _removeFromPendingCollections(bytes32 paranetId, bytes32 collectionId) internal {
        uint256 index = pendingCollectionIndexes[paranetId][collectionId];
        uint256 lastIndex = pendingCollectionIds[paranetId].length - 1;

        if (index != lastIndex) {
            bytes32 lastCollectionId = pendingCollectionIds[paranetId][lastIndex];
            pendingCollectionIds[paranetId][index] = lastCollectionId;
            pendingCollectionIndexes[paranetId][lastCollectionId] = index;
        }

        pendingCollectionIds[paranetId].pop();
        delete pendingCollectionIndexes[paranetId][collectionId];
    }

    function getPendingCollections(
        bytes32 paranetId,
        uint256 offset,
        uint256 limit
    ) external view returns (StagedCollection[] memory collections, uint256 total) {
        total = pendingCollectionIds[paranetId].length;

        if (offset >= total || limit == 0) {
            return (new StagedCollection[](0), total);
        }

        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }
        uint256 resultLength = end - offset;

        collections = new StagedCollection[](resultLength);
        for (uint256 i = 0; i < resultLength; i++) {
            bytes32 collectionId = pendingCollectionIds[paranetId][offset + i];
            collections[i] = StagedCollection({
                collectionId: collectionId,
                submitter: collectionSubmitters[paranetId][collectionId],
                status: stagedCollections[paranetId][collectionId]
            });
        }
    }
}
