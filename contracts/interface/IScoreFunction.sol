// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

interface IScoreFunction {

    function calculateScore(uint256 distance, uint96 stake) external returns (uint40);
    function calculateDistance(uint8 hashFunctionId, bytes calldata nodeId, bytes calldata keyword)
        external returns (uint256);

}
