// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IScoreFunction } from "./interface/IScoreFunction.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract ScoringProxy is Ownable {
    event NewScoringFunctionContract(uint8 indexed scoreFunctionId, address newContractAddress);
    event ScoringFunctionContractUpdated(uint8 indexed scoreFunctionId, address newContractAddress);

    // scoreFunctionId => Contract address
    mapping(uint8 => address) public functions;

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
        require(functions[scoreFunctionId] != address(0), "Scoring function doesn't exist!");

        IScoreFunction scoringFunction = IScoreFunction(functions[scoreFunctionId]);
        uint256 distance = scoringFunction.calculateDistance(hashFunctionId, nodeId, keyword);

        return scoringFunction.calculateScore(distance, stake);
    }

    function setContractAddress(uint8 scoreFunctionId, address scoringContractAddress)
        public
        onlyOwner
    {
        require(scoringContractAddress != address(0), "Contract address cannot be empty");

        if (functions[scoreFunctionId] != address(0)) {
            emit ScoringFunctionContractUpdated(
                scoreFunctionId,
                scoringContractAddress
            );
        } else {
            emit NewScoringFunctionContract(scoreFunctionId, scoringContractAddress);
        }

        functions[scoreFunctionId] = scoringContractAddress;
    }

}
