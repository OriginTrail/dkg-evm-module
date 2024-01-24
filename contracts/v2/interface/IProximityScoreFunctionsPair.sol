// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

interface IProximityScoreFunctionsPair {
    function calculateScore(
        uint256 distance,
        uint256 maxDistance,
        uint72 maxNodesNumber,
        uint96 stake
    ) external view returns (uint64);

    function calculateDistance(
        uint8 hashFunctionId,
        bytes calldata nodeId,
        bytes calldata keyword
    ) external view returns (uint256);
}
