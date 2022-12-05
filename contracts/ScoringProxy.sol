// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import { IScoreFunction } from "./interface/IScoreFunction.sol";
import { Named } from "./interface/Named.sol";
import { Versioned } from "./interface/Versioned.sol";
import { UnorderedIndexableContractDynamicSetLib } from "./utils/UnorderedIndexableContractDynamicSet.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract ScoringProxy is Named, Versioned, Ownable {

    using UnorderedIndexableContractDynamicSetLib for UnorderedIndexableContractDynamicSetLib.Set;

    event NewScoringFunctionContract(uint8 indexed scoreFunctionId, address newContractAddress);
    event ScoringFunctionContractUpdated(uint8 indexed scoreFunctionId, address newContractAddress);

    string constant private _NAME = "ScoringProxy";
    string constant private _VERSION = "1.0.0";

    UnorderedIndexableContractDynamicSetLib.Set scoreFunctionSet;

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function setContractAddress(uint8 scoreFunctionId, address scoringContractAddress) external onlyOwner {
        if (scoreFunctionSet.exists(scoreFunctionId)) {
            emit ScoringFunctionContractUpdated(scoreFunctionId, scoringContractAddress);
            scoreFunctionSet.update(scoreFunctionId, scoringContractAddress);
        } else {
            emit NewScoringFunctionContract(scoreFunctionId, scoringContractAddress);
            scoreFunctionSet.append(scoreFunctionId, scoringContractAddress);
        }
    }

    function removeContract(uint8 scoreFunctionId) external onlyOwner {
        scoreFunctionSet.remove(scoreFunctionId);
    }
    
    function callScoreFunction(
        uint8 scoreFunctionId,
        uint8 hashFunctionId,
        bytes calldata nodeId,
        bytes calldata keyword,
        uint96 stake
    )
        external
        returns (uint40)
    {
        IScoreFunction scoringFunction = IScoreFunction(scoreFunctionSet.get(scoreFunctionId).addr);
        uint256 distance = scoringFunction.calculateDistance(hashFunctionId, nodeId, keyword);
        return scoringFunction.calculateScore(distance, stake);
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
