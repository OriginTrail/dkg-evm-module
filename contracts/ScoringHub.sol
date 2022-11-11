// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IScoringFunction } from "./interface/ScoringFunction.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";


contract ScroingHub is Ownable {
    // scoringFunctionId => Contract address
    mapping(uint8 => address) functions;

    function callScoringFunction(
        uint8 scoringFunctionId,
        uint8 hashingFunctionId,
        bytes memory nodeId,
        bytes memory keyword
        uint96 stake,
        uint32 a,
        uint32 b
    )
        public
        returns (uint32)
    {
        address scoringContractAddress = functions[scoringFunctionId];

        require(scoringContractAddress != address(0), "Scoring function doesn't exist!");

        IScoringFunction scoringFunction = IScoringFunction(scoringContractAddress);
        uint256 distance = calculateXORDistance(hashingFunctionId, nodeId, keyword);

        return calculateScore(distance, stake, a, b);
    }

    function setContractAddress(uint8 scoringFunctionId, address scoringContractAddress)
        public
        onlyOwner
    {
        functions[scoringFunctionId] = scoringContractAddress;
    }

}
