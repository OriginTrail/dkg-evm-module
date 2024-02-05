// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

library CommitManagerErrorsV2 {
    error ClosestNodeNotInNeighborhood(
        bytes32 agreementId,
        uint16 epoch,
        uint72 closestNodeIndex,
        uint72 leftEdgeNodeIndex,
        uint72 rightEdgeNodeIndex,
        uint256 timeNow
    );
    error InvalidNeighborhoodSize(
        bytes32 agreementId,
        uint16 epoch,
        uint72 leftEdgeNodeIndex,
        uint72 rightEdgeNodeIndex,
        uint72 numberOfNodes,
        uint256 neighborhoodExpectedSize,
        uint256 neighborhoodActualSize,
        uint256 timeNow
    );
    error InvalidClosestNode(
        bytes32 agreementId,
        uint16 epoch,
        uint72 closestNodeIndex,
        uint256 closestNodeDistance,
        uint256 leftAdjacentDistance,
        uint256 rightAdjacentDistance,
        uint256 timeNow
    );
    error InvalidLeftEdgeNode(
        bytes32 agreementId,
        uint16 epoch,
        uint72 leftEdgeNodeIndex,
        uint72 rightEdgeNodeAdjacentIndex,
        uint256 leftEdgeNodeDistance,
        uint256 rightEdgeNodeAdjacentDistance,
        uint256 timeNow
    );
    error InvalidRightEdgeNode(
        bytes32 agreementId,
        uint16 epoch,
        uint72 rightEdgeNodeIndex,
        uint72 leftEdgeNodeAdjacentIndex,
        uint256 rightEdgeNodeDistance,
        uint256 leftEdgeNodeAdjacentDistance,
        uint256 timeNow
    );
}
