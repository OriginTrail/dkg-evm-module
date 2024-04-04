// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {HubDependent} from "../../abstract/HubDependent.sol";
import {Named} from "../../interface/Named.sol";
import {Versioned} from "../../interface/Versioned.sol";
import {ParanetStructs} from "../../structs/paranets/ParanetStructs.sol";

contract KnowledgeMinersRegistry is Named, Versioned, HubDependent {
    string private constant _NAME = "KnowledgeMinersRegistry";
    string private constant _VERSION = "1.0.0";

    // Address => Knowledge Miner Profile
    mapping(address => ParanetStructs.KnowledgeMiner) knowledgeMiners;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) HubDependent(hubAddress) {}

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function registerKnowledgeMiner() external onlyContracts {
        ParanetStructs.KnowledgeMiner storage miner = knowledgeMiners[msg.sender];

        miner.addr = msg.sender;
    }

    function unregisterKnowledgeMiner() external onlyContracts {
        delete knowledgeMiners[msg.sender];
    }

    function knowledgeMinerExists() external view returns (bool) {
        return knowledgeMiners[msg.sender].addr == msg.sender;
    }

    function getTotalTracSpent() external view returns (uint96) {
        return knowledgeMiners[msg.sender].totalTracSpent;
    }

    function setTotalTracSpent(uint96 totalTracSpent) external onlyContracts {
        knowledgeMiners[msg.sender].totalTracSpent = totalTracSpent;
    }

    function getTotalSubmittedKnowledgeAssetsCount() external view returns (uint256) {
        return knowledgeMiners[msg.sender].totalSubmittedKnowledgeAssetsCount;
    }

    function setTotalSubmittedKnowledgeAssetsCount(uint256 totalSubmittedKnowledgeAssetsCount) external onlyContracts {
        knowledgeMiners[msg.sender].totalSubmittedKnowledgeAssetsCount = totalSubmittedKnowledgeAssetsCount;
    }

    function addSubmittedKnowledgeAsset(bytes32 paranetId, bytes32 knowledgeAssetId) external onlyContracts {
        knowledgeMiners[msg.sender].submittedKnowledgeAssetsIndexes[paranetId][knowledgeAssetId] = knowledgeMiners[
            msg.sender
        ].submittedKnowledgeAssets[paranetId].length;
        knowledgeMiners[msg.sender].submittedKnowledgeAssets[paranetId].push(knowledgeAssetId);
    }

    function removeSubmittedKnowledgeAsset(bytes32 paranetId, bytes32 knowledgeAssetId) external onlyContracts {
        // 1. Move the last element to the slot of the element to remove
        knowledgeMiners[msg.sender].submittedKnowledgeAssets[paranetId][
            knowledgeMiners[msg.sender].submittedKnowledgeAssetsIndexes[paranetId][knowledgeAssetId]
        ] = knowledgeMiners[msg.sender].submittedKnowledgeAssets[paranetId][
            knowledgeMiners[msg.sender].submittedKnowledgeAssets[paranetId].length - 1
        ];

        // 2. Update the index of the moved element
        knowledgeMiners[msg.sender].submittedKnowledgeAssetsIndexes[paranetId][
            knowledgeMiners[msg.sender].submittedKnowledgeAssets[paranetId][
                knowledgeMiners[msg.sender].submittedKnowledgeAssets[paranetId].length - 1
            ]
        ] = knowledgeMiners[msg.sender].submittedKnowledgeAssetsIndexes[paranetId][knowledgeAssetId];

        // 3. Remove the last element from the array
        knowledgeMiners[msg.sender].submittedKnowledgeAssets[paranetId].pop();

        // 4. Delete the index of the removed element
        delete knowledgeMiners[msg.sender].submittedKnowledgeAssetsIndexes[paranetId][knowledgeAssetId];
    }

    function getSubmittedKnowledgeAssets(bytes32 paranetId) external view returns (bytes32[] memory) {
        return knowledgeMiners[msg.sender].submittedKnowledgeAssets[paranetId];
    }

    function getCumulativeTracSpent(bytes32 paranetId) external view returns (uint96) {
        return knowledgeMiners[msg.sender].cumulativeTracSpent[paranetId];
    }

    function setCumulativeTracSpent(bytes32 paranetId, uint96 cumulativeTracSpent) external onlyContracts {
        knowledgeMiners[msg.sender].cumulativeTracSpent[paranetId] = cumulativeTracSpent;
    }

    function getUnrewardedTracSpent(bytes32 paranetId) external view returns (uint96) {
        return knowledgeMiners[msg.sender].unrewardedTracSpent[paranetId];
    }

    function setUnrewardedTracSpent(bytes32 paranetId, uint96 unrewardedTracSpent) external onlyContracts {
        knowledgeMiners[msg.sender].unrewardedTracSpent[paranetId] = unrewardedTracSpent;
    }
}
