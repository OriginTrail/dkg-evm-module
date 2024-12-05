// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {HubDependent} from "../../abstract/HubDependent.sol";
import {INamed} from "../../interfaces/INamed.sol";
import {IVersioned} from "../../interfaces/IVersioned.sol";
import {ParanetLib} from "../../libraries/ParanetLib.sol";

contract ParanetKnowledgeAssetsRegistry is INamed, IVersioned, HubDependent {
    string private constant _NAME = "ParanetKnowledgeAssetsRegistry";
    string private constant _VERSION = "1.0.0";

    // Knowledge Asset ID => Knowledge Asset On Paranet
    mapping(bytes32 => ParanetLib.KnowledgeAsset) internal knowledgeAssets;

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
        address miner
    ) external onlyContracts returns (bytes32) {
        knowledgeAssets[keccak256(abi.encodePacked(knowledgeAssetStorageContract, tokenId))] = ParanetLib
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
    ) external view returns (ParanetLib.KnowledgeAsset memory) {
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
