// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IScoringFunction {
    function calculateScore(uint256 distance, uint96 stake)
        external returns (uint32);
    function calculateDistance(uint8 hashingFunctionId, bytes memory nodeId, bytes memory keyword)
        external returns (uint256);
}
