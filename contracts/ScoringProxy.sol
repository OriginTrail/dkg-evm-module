// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IScoringFunction } from "./interface/ScoringFunction.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract ScoringProxy is Ownable {
    event NewScoringFunctionContract(uint8 indexed scoringFunctionId, address newContractAddress);
    event ScoringFunctionContractUpdated(uint8 indexed scoringFunctionId, address newContractAddress);

    // scoringFunctionId => Contract address
    mapping(uint8 => address) public functions;

    function callScoringFunction(
        uint8 scoringFunctionId,
        uint8 hashingFunctionId,
        bytes memory nodeId,
        bytes memory keyword,
        uint96 stake
    )
        public
        returns (uint32)
    {
        require(functions[scoringFunctionId] != address(0), "Scoring function doesn't exist!");

        IScoringFunction scoringFunction = IScoringFunction(functions[scoringFunctionId]);
        uint256 distance = scoringFunction.calculateDistance(hashingFunctionId, nodeId, keyword);

        return scoringFunction.calculateScore(distance, stake);
    }

    function setContractAddress(uint8 scoringFunctionId, address scoringContractAddress)
        public
        onlyOwner
    {
        require(scoringContractAddress != address(0), "Contract address cannot be empty");

        if (functions[scoringFunctionId] != address(0)) {
            emit ScoringFunctionContractUpdated(
                scoringFunctionId,
                scoringContractAddress
            );
        } else {
            emit NewScoringFunctionContract(scoringFunctionId, scoringContractAddress);
        }

        functions[scoringFunctionId] = scoringContractAddress;
    }

}
