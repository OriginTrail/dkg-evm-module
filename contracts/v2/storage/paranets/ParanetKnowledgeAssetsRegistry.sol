// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {HubDependentV2} from "../../abstract/HubDependent.sol";
import {Named} from "../../../v1/interface/Named.sol";
import {Versioned} from "../../../v1/interface/Versioned.sol";
import {ParanetStructs} from "../../structs/paranets/ParanetStructs.sol";

contract ParanetKnowledgeAssetsRegistry is Named, Versioned, HubDependentV2 {
    string private constant _NAME = "ParanetKnowledgeAssetsRegistry";
    string private constant _VERSION = "2.0.0";

    // Knowledge Asset ID => Knowledge Asset On Paranet
    mapping(bytes32 => ParanetStructs.KnowledgeAsset) knowledgeAssets;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) HubDependentV2(hubAddress) {}

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
        address miner
    ) external onlyContracts returns (bytes32) {
        knowledgeAssets[keccak256(abi.encodePacked(knowledgeAssetStorageContract, tokenId))] = ParanetStructs
            .KnowledgeAsset({
                knowledgeAssetStorageContract: knowledgeAssetStorageContract,
                tokenId: tokenId,
                minerAddress: miner,
                paranetId: paranetId
            });

        return keccak256(abi.encodePacked(knowledgeAssetStorageContract, tokenId));
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
}
