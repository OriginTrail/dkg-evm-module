// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IScoringFunction } from "./interface/ScoringFunction.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract ScoringProxy is Ownable {
    // scoringFunctionId => Contract address
    mapping(uint8 => address) functions;

    function callScoringFunction(
        uint8 scoringFunctionId,
        uint8 hashingFunctionId,
        bytes memory nodeId,
        bytes memory keyword,
        uint96 stake,
    )
        public
        returns (uint32)
    {
        address scoringContractAddress = functions[scoringFunctionId];

        require(scoringContractAddress != address(0), "Scoring function doesn't exist!");

        IScoringFunction scoringFunction = IScoringFunction(scoringContractAddress);
        uint256 distance = calculateDistance(hashingFunctionId, nodeId, keyword);

        return calculateScore(distance, stake);
    }

    function setContractAddress(uint8 scoringFunctionId, address scoringContractAddress)
        public
        onlyOwner
    {
        functions[scoringFunctionId] = scoringContractAddress;
    }

}
