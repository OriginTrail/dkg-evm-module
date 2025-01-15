// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {HubDependent} from "../../abstract/HubDependent.sol";
import {INamed} from "../../interfaces/INamed.sol";
import {IVersioned} from "../../interfaces/IVersioned.sol";
import {ParanetLib} from "../../libraries/ParanetLib.sol";

contract ParanetknowledgeCollectionIdRegistry is INamed, IVersioned, HubDependent {
    string private constant _NAME = "ParanetknowledgeCollectionIdRegistry";
    string private constant _VERSION = "1.0.1";

    // Knowledge Collection ID => Knowledge Collection On Paranet
    mapping(bytes32 => ParanetLib.KnolwedgeCollection) internal knolwedgeCollections;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) HubDependent(hubAddress) {}

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function addKnowledgeCollection(
        bytes32 paranetId,
        address knowledgeCollectionStorageContract,
        uint256 knowledgeCollectionTokenId,
        address miner
    ) external onlyContracts returns (bytes32) {
        knolwedgeCollections[
            keccak256(abi.encodePacked(knowledgeCollectionStorageContract, knowledgeCollectionTokenId))
        ] = ParanetLib.KnolwedgeCollection({
            knowledgeCollectionStorageContract: knowledgeCollectionStorageContract,
            knowledgeCollectionTokenId: knowledgeCollectionTokenId,
            minerAddress: miner,
            paranetId: paranetId
        });

        return keccak256(abi.encodePacked(knowledgeCollectionStorageContract, knowledgeCollectionTokenId));
    }

    function removeKnowledgeCollection(bytes32 knowledgeCollectionId) external onlyContracts {
        delete knolwedgeCollections[knowledgeCollectionId];
    }

    function isParanetKnowledgeCollection(bytes32 knolwedgeCollectionId) external view returns (bool) {
        return
            keccak256(
                abi.encodePacked(
                    knolwedgeCollections[knolwedgeCollectionId].knowledgeCollectionStorageContract,
                    knolwedgeCollections[knolwedgeCollectionId].knowledgeCollectionTokenId
                )
            ) == knolwedgeCollectionId;
    }

    function getKnowledgeCollectionObject(
        bytes32 knolwedgeCollectionId
    ) external view returns (ParanetLib.KnolwedgeCollection memory) {
        return knolwedgeCollections[knolwedgeCollectionId];
    }

    function getKnowledgeCollectionLocator(bytes32 knowledgeCollectionId) external view returns (address, uint256) {
        return (
            knolwedgeCollections[knowledgeCollectionId].knowledgeCollectionStorageContract,
            knolwedgeCollections[knowledgeCollectionId].knowledgeCollectionTokenId
        );
    }

    function getMinerAddress(bytes32 knowledgeCollectionId) external view returns (address) {
        return knolwedgeCollections[knowledgeCollectionId].minerAddress;
    }

    function setMinerAddress(bytes32 knowledgeCollectionId, address minerAddress) external onlyContracts {
        knolwedgeCollections[knowledgeCollectionId].minerAddress = minerAddress;
    }

    function getParanetId(bytes32 knowledgeCollectionId) external view returns (bytes32) {
        return knolwedgeCollections[knowledgeCollectionId].paranetId;
    }

    function setParanetId(bytes32 knowledgeCollectionId, bytes32 paranetId) external onlyContracts {
        knolwedgeCollections[knowledgeCollectionId].paranetId = paranetId;
    }
}
