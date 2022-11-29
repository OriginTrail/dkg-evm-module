// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IScoreFunction } from "./interface/IScoreFunction.sol";
import { Named } from "./interface/Named.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { UnorderedIndexableContractDynamicSetLib } from "./utils/UnorderedIndexableContractDynamicSet.sol";

contract ScoringProxy is Ownable {
    using UnorderedIndexableContractDynamicSetLib for UnorderedIndexableContractDynamicSetLib.Set;

    event NewScoringFunctionContract(uint8 indexed scoreFunctionId, address newContractAddress);
    event ScoringFunctionContractUpdated(uint8 indexed scoreFunctionId, address newContractAddress);

    UnorderedIndexableContractDynamicSetLib.Set scoreFunctionSet;

    function setContractAddress(uint8 scoreFunctionId, address scoringContractAddress) public onlyOwner {
        if (scoreFunctionSet.exists(scoreFunctionId)) {
            emit ScoringFunctionContractUpdated(scoreFunctionId, scoringContractAddress);
            scoreFunctionSet.update(scoreFunctionId, scoringContractAddress);
        } else {
            emit NewScoringFunctionContract(scoreFunctionId, scoringContractAddress);
            scoreFunctionSet.append(scoreFunctionId, scoringContractAddress);
        }
    }

    function removeContract(uint8 scoreFunctionId) public onlyOwner {
        scoreFunctionSet.remove(scoreFunctionId);
    }
    
    function callScoreFunction(
        uint8 scoreFunctionId,
        uint8 hashFunctionId,
        bytes memory nodeId,
        bytes memory keyword,
        uint96 stake
    )
        public
        returns (uint40)
    {
        IScoreFunction scoringFunction = IScoreFunction(scoreFunctionSet.get(scoreFunctionId).addr);
        uint256 distance = scoringFunction.calculateDistance(hashFunctionId, nodeId, keyword);
        return scoringFunction.calculateScore(distance, stake);
    }

    function getScoreFunctionName(uint8 scoreFunctionId) public view returns (string memory) {
        return Named(scoreFunctionSet.get(scoreFunctionId).addr).name();
    }

    function getScoreFunctionContractAddress(uint8 scoreFunctionId) public view returns (address) {
        return scoreFunctionSet.get(scoreFunctionId).addr;
    }

    function getAllScoreFunctions() public view returns (UnorderedIndexableContractDynamicSetLib.Contract[] memory) {
        return scoreFunctionSet.getAll();
    }

    function isScoreFunction(uint8 scoreFunctionId) public view returns (bool) {
        return scoreFunctionSet.exists(scoreFunctionId);
    }
}
