// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {HubDependentV2} from "../../abstract/HubDependent.sol";
import {Named} from "../../../v1/interface/Named.sol";
import {Versioned} from "../../../v1/interface/Versioned.sol";
import {ParanetStructs} from "../../structs/paranets/ParanetStructs.sol";

contract ParanetKnowledgeMinersRegistry is Named, Versioned, HubDependentV2 {
    string private constant _NAME = "ParanetKnowledgeMinersRegistry";
    string private constant _VERSION = "2.0.0";

    // Address => Knowledge Miner Profile
    mapping(address => ParanetStructs.KnowledgeMiner) knowledgeMiners;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) HubDependentV2(hubAddress) {}

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function registerKnowledgeMiner(bytes calldata metadata) external onlyContracts {
        ParanetStructs.KnowledgeMiner storage miner = knowledgeMiners[msg.sender];

        miner.addr = msg.sender;
        miner.metadata = metadata;
    }

    function deleteKnowledgeMiner() external onlyContracts {
        delete knowledgeMiners[msg.sender];
    }

    function knowledgeMinerExists() external view returns (bool) {
        return knowledgeMiners[msg.sender].addr == msg.sender;
    }

    function getKnowledgeMinerMetadata(
        address addr
    ) external view returns (ParanetStructs.KnowledgeMinerMetadata memory) {
        return
            ParanetStructs.KnowledgeMinerMetadata({
                addr: addr,
                totalTracSpent: knowledgeMiners[addr].totalTracSpent,
                totalSubmittedKnowledgeAssetsCount: knowledgeMiners[addr].totalSubmittedKnowledgeAssetsCount,
                metadata: knowledgeMiners[addr].metadata
            });
    }

    function getTotalTracSpent() external view returns (uint96) {
        return knowledgeMiners[msg.sender].totalTracSpent;
    }

    function setTotalTracSpent(uint96 totalTracSpent) external onlyContracts {
        knowledgeMiners[msg.sender].totalTracSpent = totalTracSpent;
    }

    function addTotalTracSpent(uint96 addedTracSpent) external onlyContracts {
        knowledgeMiners[msg.sender].totalTracSpent += addedTracSpent;
    }

    function subTotalTracSpent(uint96 subtractedTracSpent) external onlyContracts {
        knowledgeMiners[msg.sender].totalTracSpent -= subtractedTracSpent;
    }

    function getTotalSubmittedKnowledgeAssetsCount() external view returns (uint256) {
        return knowledgeMiners[msg.sender].totalSubmittedKnowledgeAssetsCount;
    }

    function setTotalSubmittedKnowledgeAssetsCount(uint256 totalSubmittedKnowledgeAssetsCount) external onlyContracts {
        knowledgeMiners[msg.sender].totalSubmittedKnowledgeAssetsCount = totalSubmittedKnowledgeAssetsCount;
    }

    function incrementTotalSubmittedKnowledgeAssetsCount() external onlyContracts {
        unchecked {
            knowledgeMiners[msg.sender].totalSubmittedKnowledgeAssetsCount++;
        }
    }

    function decrementTotalSubmittedKnowledgeAssetsCount() external onlyContracts {
        unchecked {
            knowledgeMiners[msg.sender].totalSubmittedKnowledgeAssetsCount--;
        }
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

    function addCumulativeTracSpent(bytes32 paranetId, uint96 addedTracSpent) external onlyContracts {
        knowledgeMiners[msg.sender].cumulativeTracSpent[paranetId] += addedTracSpent;
    }

    function subCumulativeTracSpent(bytes32 paranetId, uint96 subtractedTracSpent) external onlyContracts {
        knowledgeMiners[msg.sender].cumulativeTracSpent[paranetId] -= subtractedTracSpent;
    }

    function getUnrewardedTracSpent(bytes32 paranetId) external view returns (uint96) {
        return knowledgeMiners[msg.sender].unrewardedTracSpent[paranetId];
    }

    function setUnrewardedTracSpent(bytes32 paranetId, uint96 unrewardedTracSpent) external onlyContracts {
        knowledgeMiners[msg.sender].unrewardedTracSpent[paranetId] = unrewardedTracSpent;
    }

    function addUnrewardedTracSpent(bytes32 paranetId, uint96 addedUnrewardedTracSpent) external onlyContracts {
        knowledgeMiners[msg.sender].unrewardedTracSpent[paranetId] += addedUnrewardedTracSpent;
    }

    function subUnrewardedTracSpent(bytes32 paranetId, uint96 subtractedUnrewardedTracSpent) external onlyContracts {
        knowledgeMiners[msg.sender].unrewardedTracSpent[paranetId] -= subtractedUnrewardedTracSpent;
    }

    function getCumulativeAwardedNeuro(bytes32 paranetId) external view returns (uint256) {
        return knowledgeMiners[msg.sender].cumulativeAwardedNeuro[paranetId];
    }

    function setCumulativeAwardedNeuro(bytes32 paranetId, uint256 cumulativeAwardedNeuro) external onlyContracts {
        knowledgeMiners[msg.sender].cumulativeAwardedNeuro[paranetId] = cumulativeAwardedNeuro;
    }

    function addCumulativeAwardedNeuro(bytes32 paranetId, uint256 addedCumulativeAwardedNeuro) external onlyContracts {
        knowledgeMiners[msg.sender].cumulativeAwardedNeuro[paranetId] += addedCumulativeAwardedNeuro;
    }

    function subCumulativeAwardedNeuro(
        bytes32 paranetId,
        uint256 subtractedCumulativeAwardedNeuro
    ) external onlyContracts {
        knowledgeMiners[msg.sender].cumulativeAwardedNeuro[paranetId] -= subtractedCumulativeAwardedNeuro;
    }
}
