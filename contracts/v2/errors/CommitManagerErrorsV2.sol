// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

library CommitManagerErrorsV2 {
    error ClosestNodeNotInNeighborhood(
        bytes32 agreementId,
        uint72 leftNeighborhoodEdge,
        uint72 rightNeighborhoodEdge,
        uint72 closestNode,
        uint16 epoch,
        uint256 timeNow
    );
    error NegihbourhoodWrongSize(
        bytes32 agreementId,
        uint72 leftNeighborhoodEdge,
        uint72 rightNeighborhoodEdge,
        uint256 numberOfNodes,
        uint256 negihbourhoodExpectedSize,
        uint256 negihbourhoodActualSize,
        uint16 epoch,
        uint256 timeNow
    );
}
