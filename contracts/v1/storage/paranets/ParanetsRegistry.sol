// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {HubDependent} from "../../abstract/HubDependent.sol";
import {Named} from "../../interface/Named.sol";
import {Versioned} from "../../interface/Versioned.sol";
import {ParanetStructs} from "../../structs/paranets/ParanetStructs.sol";

contract ParanetsRegistry is Named, Versioned, HubDependent {
    string private constant _NAME = "ParanetsRegistry";
    string private constant _VERSION = "1.0.0";

    // Paranet ID => Paranet Object
    mapping(bytes32 => ParanetStructs.Paranet) paranets;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) HubDependent(hubAddress) {}

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function registerParanet(
        address knowledgeAssetStorageContract,
        uint256 tokenId,
        ParanetStructs.AccessPolicy minersAccessPolicy,
        ParanetStructs.AccessPolicy knowledgeAssetsInclusionPolicy,
        string calldata paranetName,
        string calldata paranetDescription,
        address incentivesPool
    ) external onlyContracts returns (bytes32) {
        bytes32 paranetId = keccak256(abi.encodePacked(knowledgeAssetStorageContract, tokenId));

        ParanetStructs.Paranet storage paranet = paranets[paranetId];

        paranet.knowledgeAssetStorageContract = knowledgeAssetStorageContract;
        paranet.tokenId = tokenId;
        paranet.operator = msg.sender;
        paranet.minersAccessPolicy = minersAccessPolicy;
        paranet.knowledgeAssetsInclusionPolicy = knowledgeAssetsInclusionPolicy;
        paranet.name = paranetName;
        paranet.description = paranetDescription;
        paranet.incentivesPool = incentivesPool;

        return paranetId;
    }

    function unregisterParanet(bytes32 paranetId) external onlyContracts {
        delete paranets[paranetId];
    }

    function paranetExists(bytes32 paranetId) external view returns (bool) {
        return
            keccak256(
                abi.encodePacked(paranets[paranetId].knowledgeAssetStorageContract, paranets[paranetId].tokenId)
            ) == paranetId;
    }

    function getParanetMetadata(bytes32 paranetId) external view returns (ParanetStructs.ParanetMetadata memory) {
        ParanetStructs.Paranet storage paranet = paranets[paranetId];

        return
            ParanetStructs.ParanetMetadata({
                knowledgeAssetStorageContract: paranet.knowledgeAssetStorageContract,
                tokenId: paranet.tokenId,
                operator: paranet.operator,
                minersAccessPolicy: paranet.minersAccessPolicy,
                knowledgeAssetsInclusionPolicy: paranet.knowledgeAssetsInclusionPolicy,
                name: paranet.name,
                description: paranet.description,
                cumulativeKnowledgeValue: paranet.cumulativeKnowledgeValue
            });
    }

    function getParanetKnowledgeAssetLocator(bytes32 paranetId) external view returns (address, uint256) {
        ParanetStructs.Paranet storage paranet = paranets[paranetId];

        return (paranet.knowledgeAssetStorageContract, paranet.tokenId);
    }

    function getOperatorAddress(bytes32 paranetId) external view returns (address) {
        return paranets[paranetId].operator;
    }

    function setOperatorAddress(bytes32 paranetId, address operator) external onlyContracts {
        paranets[paranetId].operator = operator;
    }

    function getMinersAccessPolicy(bytes32 paranetId) external view returns (ParanetStructs.AccessPolicy) {
        return paranets[paranetId].minersAccessPolicy;
    }

    function setMinersAccessPolicy(
        bytes32 paranetId,
        ParanetStructs.AccessPolicy minersAccessPolicy
    ) external onlyContracts {
        paranets[paranetId].minersAccessPolicy = minersAccessPolicy;
    }

    function getKnowledgeAssetsInclusionPolicy(bytes32 paranetId) external view returns (ParanetStructs.AccessPolicy) {
        return paranets[paranetId].knowledgeAssetsInclusionPolicy;
    }

    function setKnowledgeAssetsInclusionPolicy(
        bytes32 paranetId,
        ParanetStructs.AccessPolicy knowledgeAssetsInclusionPolicy
    ) external onlyContracts {
        paranets[paranetId].knowledgeAssetsInclusionPolicy = knowledgeAssetsInclusionPolicy;
    }

    function getName(bytes32 paranetId) external view returns (string memory) {
        return paranets[paranetId].name;
    }

    function setName(bytes32 paranetId, string calldata name_) external onlyContracts {
        paranets[paranetId].name = name_;
    }

    function getDescription(bytes32 paranetId) external view returns (string memory) {
        return paranets[paranetId].description;
    }

    function setDescription(bytes32 paranetId, string calldata description) external onlyContracts {
        paranets[paranetId].description = description;
    }

    function getIncentivesPool(bytes32 paranetId) external view returns (address) {
        return paranets[paranetId].incentivesPool;
    }

    function setIncentivesPool(bytes32 paranetId, address incentivesPool) external onlyContracts {
        paranets[paranetId].incentivesPool = incentivesPool;
    }

    function getCumulativeKnowledgeValue(bytes32 paranetId) external view returns (uint96) {
        return paranets[paranetId].cumulativeKnowledgeValue;
    }

    function setCumulativeKnowledgeValue(bytes32 paranetId, uint96 cumulativeKnowledgeValue) external onlyContracts {
        paranets[paranetId].cumulativeKnowledgeValue = cumulativeKnowledgeValue;
    }

    function addService(bytes32 paranetId, bytes32 serviceId) external onlyContracts {
        paranets[paranetId].implementedServicesIndexes[serviceId] = paranets[paranetId].services.length;
        paranets[paranetId].services.push(serviceId);
    }

    function removeService(bytes32 paranetId, bytes32 serviceId) external onlyContracts {
        paranets[paranetId].services[paranets[paranetId].implementedServicesIndexes[serviceId]] = paranets[paranetId]
            .services[paranets[paranetId].services.length - 1];
        paranets[paranetId].implementedServicesIndexes[
            paranets[paranetId].services[paranets[paranetId].services.length - 1]
        ] = paranets[paranetId].implementedServicesIndexes[serviceId];

        delete paranets[paranetId].implementedServicesIndexes[serviceId];
        paranets[paranetId].services.pop();
    }

    function getServices(bytes32 paranetId) external view returns (bytes32[] memory) {
        return paranets[paranetId].services;
    }

    function getServicesCount(bytes32 paranetId) external view returns (uint256) {
        return paranets[paranetId].services.length;
    }

    function isServiceImplemented(bytes32 paranetId, bytes32 serviceId) external view returns (bool) {
        return paranets[paranetId].services[paranets[paranetId].implementedServicesIndexes[serviceId]] == serviceId;
    }

    function addKnowledgeMiner(bytes32 paranetId, bytes32 knowledgeMinerId) external onlyContracts {
        paranets[paranetId].registeredKnowledgeMinersIndexes[knowledgeMinerId] = paranets[paranetId]
            .knowledgeMiners
            .length;
        paranets[paranetId].knowledgeMiners.push(knowledgeMinerId);
    }

    function removeKnowledgeMiner(bytes32 paranetId, bytes32 knowledgeMinerId) external onlyContracts {
        paranets[paranetId].knowledgeMiners[
            paranets[paranetId].registeredKnowledgeMinersIndexes[knowledgeMinerId]
        ] = paranets[paranetId].knowledgeMiners[paranets[paranetId].knowledgeMiners.length - 1];
        paranets[paranetId].registeredKnowledgeMinersIndexes[
            paranets[paranetId].knowledgeMiners[paranets[paranetId].knowledgeMiners.length - 1]
        ] = paranets[paranetId].registeredKnowledgeMinersIndexes[knowledgeMinerId];

        delete paranets[paranetId].registeredKnowledgeMinersIndexes[knowledgeMinerId];
        paranets[paranetId].knowledgeMiners.pop();
    }

    function getKnowledgeMiners(bytes32 paranetId) external view returns (bytes32[] memory) {
        return paranets[paranetId].knowledgeMiners;
    }

    function getKnowledgeMinersCount(bytes32 paranetId) external view returns (uint256) {
        return paranets[paranetId].knowledgeMiners.length;
    }

    function isKnowledgeMinerRegistered(bytes32 paranetId, bytes32 knowledgeMinerId) external view returns (bool) {
        return
            paranets[paranetId].knowledgeMiners[
                paranets[paranetId].registeredKnowledgeMinersIndexes[knowledgeMinerId]
            ] == knowledgeMinerId;
    }

    function addKnowledgeAsset(bytes32 paranetId, bytes32 knowledgeAssetId) external onlyContracts {
        paranets[paranetId].registeredKnowledgeAssetsIndexes[knowledgeAssetId] = paranets[paranetId]
            .knowledgeAssets
            .length;
        paranets[paranetId].knowledgeAssets.push(knowledgeAssetId);
    }

    function removeKnowledgeAsset(bytes32 paranetId, bytes32 knowledgeAssetId) external onlyContracts {
        paranets[paranetId].knowledgeAssets[
            paranets[paranetId].registeredKnowledgeAssetsIndexes[knowledgeAssetId]
        ] = paranets[paranetId].knowledgeAssets[paranets[paranetId].knowledgeAssets.length - 1];
        paranets[paranetId].registeredKnowledgeAssetsIndexes[
            paranets[paranetId].knowledgeAssets[paranets[paranetId].knowledgeAssets.length - 1]
        ] = paranets[paranetId].registeredKnowledgeAssetsIndexes[knowledgeAssetId];

        delete paranets[paranetId].registeredKnowledgeAssetsIndexes[knowledgeAssetId];
        paranets[paranetId].knowledgeAssets.pop();
    }

    function getKnowledgeAssets(bytes32 paranetId) external view returns (bytes32[] memory) {
        return paranets[paranetId].knowledgeAssets;
    }

    function getKnowledgeAssetsWithPagination(
        bytes32 paranetId,
        uint256 offset,
        uint256 limit
    ) external view returns (bytes32[] memory) {
        if (offset >= paranets[paranetId].knowledgeAssets.length) {
            return new bytes32[](0);
        }

        uint256 fetchCount = (offset + limit > paranets[paranetId].knowledgeAssets.length)
            ? paranets[paranetId].knowledgeAssets.length - offset
            : limit;
        bytes32[] memory knowledgeAssets = new bytes32[](fetchCount);

        for (uint256 i = 0; i < fetchCount; i++) {
            knowledgeAssets[i] = paranets[paranetId].knowledgeAssets[offset + i];
        }

        return knowledgeAssets;
    }

    function getKnowledgeAssetsStartingFromKnowledgeAssetId(
        bytes32 paranetId,
        bytes32 knowledgeAssetId,
        uint256 limit
    ) external view returns (bytes32[] memory) {
        if (
            paranets[paranetId].registeredKnowledgeAssetsIndexes[knowledgeAssetId] >=
            paranets[paranetId].knowledgeAssets.length
        ) {
            return new bytes32[](0);
        }

        uint256 fetchCount = (paranets[paranetId].registeredKnowledgeAssetsIndexes[knowledgeAssetId] + limit >
            paranets[paranetId].knowledgeAssets.length)
            ? paranets[paranetId].knowledgeAssets.length -
                paranets[paranetId].registeredKnowledgeAssetsIndexes[knowledgeAssetId]
            : limit;
        bytes32[] memory knowledgeAssets = new bytes32[](fetchCount);

        for (uint256 i = 0; i < fetchCount; i++) {
            knowledgeAssets[i] = paranets[paranetId].knowledgeAssets[
                paranets[paranetId].registeredKnowledgeAssetsIndexes[knowledgeAssetId] + i
            ];
        }

        return knowledgeAssets;
    }

    function getKnowledgeAssetsCount(bytes32 paranetId) external view returns (uint256) {
        return paranets[paranetId].knowledgeAssets.length;
    }

    function isKnowledgeAssetRegistered(bytes32 paranetId, bytes32 knowledgeAssetId) external view returns (bool) {
        return
            paranets[paranetId].knowledgeAssets[
                paranets[paranetId].registeredKnowledgeAssetsIndexes[knowledgeAssetId]
            ] == knowledgeAssetId;
    }
}
