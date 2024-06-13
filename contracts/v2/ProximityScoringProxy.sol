// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {ContractStatusV2} from "./abstract/ContractStatus.sol";
import {IProximityScoreFunctionsPair} from "./interface/IProximityScoreFunctionsPair.sol";
import {IScoreFunction} from "../v1/interface/IScoreFunction.sol";
import {Named} from "../v1/interface/Named.sol";
import {Versioned} from "../v1/interface/Versioned.sol";
import {UnorderedIndexableContractDynamicSetLib} from "../v1/utils/UnorderedIndexableContractDynamicSet.sol";

contract ProximityScoringProxy is Named, Versioned, ContractStatusV2 {
    using UnorderedIndexableContractDynamicSetLib for UnorderedIndexableContractDynamicSetLib.Set;

    event NewScoringFunctionContract(uint8 indexed scoreFunctionId, address newContractAddress);
    event ScoringFunctionContractUpdated(uint8 indexed scoreFunctionId, address newContractAddress);

    string private constant _NAME = "ScoringProxy";
    string private constant _VERSION = "2.0.0";

    UnorderedIndexableContractDynamicSetLib.Set internal scoreFunctionSet;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) ContractStatusV2(hubAddress) {}

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function setContractAddress(uint8 scoreFunctionId, address scoringContractAddress) external onlyHubOwner {
        if (scoreFunctionSet.exists(scoreFunctionId)) {
            emit ScoringFunctionContractUpdated(scoreFunctionId, scoringContractAddress);
            scoreFunctionSet.update(scoreFunctionId, scoringContractAddress);
        } else {
            emit NewScoringFunctionContract(scoreFunctionId, scoringContractAddress);
            scoreFunctionSet.append(scoreFunctionId, scoringContractAddress);
        }
    }

    function removeContract(uint8 scoreFunctionId) external onlyHubOwner {
        scoreFunctionSet.remove(scoreFunctionId);
    }

    function callScoreFunction(
        uint8 scoreFunctionId,
        uint8 hashFunctionId,
        bytes calldata nodeId,
        bytes calldata keyword,
        uint96 stake
    ) external view returns (uint40) {
        IScoreFunction scoringFunction = IScoreFunction(scoreFunctionSet.get(scoreFunctionId).addr);
        uint256 distance = scoringFunction.calculateDistance(hashFunctionId, nodeId, keyword);
        return scoringFunction.calculateScore(distance, stake);
    }

    function callScoreFunction(
        uint8 scoreFunctionId,
        uint256 distance,
        uint256 maxDistance,
        uint72 nodesCount,
        uint96 stake
    ) external view returns (uint40) {
        IProximityScoreFunctionsPair proximityScoreFunctionsPair = IProximityScoreFunctionsPair(
            scoreFunctionSet.get(scoreFunctionId).addr
        );

        return proximityScoreFunctionsPair.calculateScore(distance, maxDistance, nodesCount, stake);
    }

    function callProximityFunction(
        uint8 proximityFunctionId,
        uint8 hashFunctionId,
        bytes calldata nodeId,
        bytes calldata keyword
    ) external view returns (uint256) {
        IProximityScoreFunctionsPair proximityScoreFunctionsPair = IProximityScoreFunctionsPair(
            scoreFunctionSet.get(proximityFunctionId).addr
        );

        return proximityScoreFunctionsPair.calculateDistance(hashFunctionId, nodeId, keyword);
    }

    function getScoreFunctionName(uint8 scoreFunctionId) external view returns (string memory) {
        return Named(scoreFunctionSet.get(scoreFunctionId).addr).name();
    }

    function getScoreFunctionContractAddress(uint8 scoreFunctionId) external view returns (address) {
        return scoreFunctionSet.get(scoreFunctionId).addr;
    }

    function getAllScoreFunctions() external view returns (UnorderedIndexableContractDynamicSetLib.Contract[] memory) {
        return scoreFunctionSet.getAll();
    }

    function isScoreFunction(uint8 scoreFunctionId) external view returns (bool) {
        return scoreFunctionSet.exists(scoreFunctionId);
    }
}
