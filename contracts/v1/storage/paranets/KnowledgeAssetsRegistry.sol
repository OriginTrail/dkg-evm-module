// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {HubDependent} from "../../abstract/HubDependent.sol";
import {Named} from "../../interface/Named.sol";
import {Versioned} from "../../interface/Versioned.sol";
import {ParanetStructs} from "../../structs/paranets/ParanetStructs.sol";

contract KnowledgeAssetsRegistry is Named, Versioned, HubDependent {
    string private constant _NAME = "KnowledgeAssetsRegistry";
    string private constant _VERSION = "1.0.0";

    // Knowledge Asset ID => Knowledge Asset On Paranet
    mapping(bytes32 => ParanetStructs.KnowledgeAsset) knowledgeAssets;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) HubDependent(hubAddress) {}

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function addKnowledgeAsset(
        bytes32 paranetId,
        address knowledgeAssetStorageContract,
        uint256 tokenId,
        bytes calldata metadata
    ) external onlyContracts {
        knowledgeAssets[keccak256(abi.encodePacked(knowledgeAssetStorageContract, tokenId))] = ParanetStructs
            .KnowledgeAsset({
                knowledgeAssetStorageContract: knowledgeAssetStorageContract,
                tokenId: tokenId,
                minerAddress: msg.sender,
                paranetId: paranetId,
                metadata: metadata
            });
    }

    function removeKnowledgeAsset(bytes32 knowledgeAssetId) external onlyContracts {
        delete knowledgeAssets[knowledgeAssetId];
    }

    function isParanetKnowledgeAsset(bytes32 knowledgeAssetId) external view returns (bool) {
        return
            keccak256(
                abi.encodePacked(
                    knowledgeAssets[knowledgeAssetId].knowledgeAssetStorageContract,
                    knowledgeAssets[knowledgeAssetId].tokenId
                )
            ) == knowledgeAssetId;
    }

    function getKnowledgeAssetObject(
        bytes32 knowledgeAssetId
    ) external view returns (ParanetStructs.KnowledgeAsset memory) {
        return knowledgeAssets[knowledgeAssetId];
    }

    function getKnowledgeAssetLocator(bytes32 knowledgeAssetId) external view returns (address, uint256) {
        return (
            knowledgeAssets[knowledgeAssetId].knowledgeAssetStorageContract,
            knowledgeAssets[knowledgeAssetId].tokenId
        );
    }

    function getMinerAddress(bytes32 knowledgeAssetId) external view returns (address) {
        return knowledgeAssets[knowledgeAssetId].minerAddress;
    }

    function setMinerAddress(bytes32 knowledgeAssetId, address minerAddress) external onlyContracts {
        knowledgeAssets[knowledgeAssetId].minerAddress = minerAddress;
    }

    function getParanetId(bytes32 knowledgeAssetId) external view returns (bytes32) {
        return knowledgeAssets[knowledgeAssetId].paranetId;
    }

    function setParanetId(bytes32 knowledgeAssetId, bytes32 paranetId) external onlyContracts {
        knowledgeAssets[knowledgeAssetId].paranetId = paranetId;
    }

    function getMetadata(bytes32 knowledgeAssetId) external view returns (bytes memory) {
        return knowledgeAssets[knowledgeAssetId].metadata;
    }

    function setMetadata(bytes32 knowledgeAssetId, bytes calldata metadata) external onlyContracts {
        knowledgeAssets[knowledgeAssetId].metadata = metadata;
    }
}
