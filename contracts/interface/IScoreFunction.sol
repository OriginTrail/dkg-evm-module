// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IScoreFunction {
    function calculateScore(uint256 distance, uint96 stake) external returns (uint40);
    function calculateDistance(uint8 hashFunctionId, bytes memory nodeId, bytes memory keyword)
        external returns (uint256);
}
