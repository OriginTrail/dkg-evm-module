// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

library CommitManagerErrorsV1 {
    error closestNodeNotInNeighbourhood(
        bytes32 agreementId,
        uint72 leftNeighbourhoodEdge,
        uint72 rightNeighbourhoodEdge,
        uint72 closestNode,
        uint16 epoch,
        uint256 timeNow
    );
    error negihbourhoodWrongSize(
        bytes32 agreementId,
        uint72 leftNeighbourhoodEdge,
        uint72 rightNeighbourhoodEdge,
        uint256 numberOfNodes,
        uint256 negihbourhoodExpectedSize,
        uint256 negihbourhoodActualSize,
        uint16 epoch,
        uint256 timeNow
    );
}
