// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {HashingProxy} from "../../v1/HashingProxy.sol";
import {ParametersStorage} from "../../v1/storage/ParametersStorage.sol";
import {HubDependent} from "../../v1/abstract/HubDependent.sol";
import {Indexable} from "../../v1/interface/Indexable.sol";
import {Initializable} from "../../v1/interface/Initializable.sol";
import {IProximityScoreFunctionsPair} from "../interface/IProximityScoreFunctionsPair.sol";
import {Named} from "../../v1/interface/Named.sol";
import {ScaleDownLib} from "../utils/ScaleDownLibrary.sol";
import {HASH_RING_SIZE} from "../constants/HashRingConstants.sol";

contract LinearSum is IProximityScoreFunctionsPair, Indexable, Named, HubDependent, Initializable {
    event ParameterChanged(string parameterName, uint256 parameterValue);

    uint8 private constant _ID = 2;
    string private constant _NAME = "LinearSum";

    HashingProxy public hashingProxy;
    ParametersStorage public parametersStorage;

    uint96 public distanceScaleFactor;
    uint96 public stakeScaleFactor;
    uint32 public w1;
    uint32 public w2;

    constructor(address hubAddress) HubDependent(hubAddress) {
        distanceScaleFactor = 1e18;
        stakeScaleFactor = 1e18;
        w1 = 1;
        w2 = 1;
    }

    function initialize() public onlyHubOwner {
        hashingProxy = HashingProxy(hub.getContractAddress("HashingProxy"));
        parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));
    }

    function id() external pure virtual override returns (uint8) {
        return _ID;
    }

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function calculateScore(
        uint256 distance,
        uint256 maxDistance,
        uint72 maxNodesNumber,
        uint96 stake
    ) external view returns (uint40) {
        uint64 normalizedDistance = normalizeDistance(distance, maxDistance, maxNodesNumber);

        if (1e18 >= normalizedDistance) {
            return
                ScaleDownLib.toUint40(
                    uint216(1e18 - normalizedDistance) * w1 + uint216(normalizeStake(stake)) * w2,
                    uint216(w1 + w2) * 1e18
                );
        } else {
            uint216 proximityScore = uint216(normalizedDistance - 1e18) * w1;
            uint216 stakeScore = uint216(normalizeStake(stake)) * w2;
            if (stakeScore <= proximityScore) {
                return 0;
            }
            return ScaleDownLib.toUint40(stakeScore - proximityScore, uint216(w1 + w2) * 1e18);
        }
    }

    function calculateDistance(
        uint8 hashFunctionId,
        bytes calldata nodeId,
        bytes calldata keyword
    ) public view returns (uint256) {
        uint256 nodePositionOnHashRing = uint256(hashingProxy.callHashFunction(hashFunctionId, nodeId));
        uint256 keywordPositionOnHashRing = uint256(hashingProxy.callHashFunction(hashFunctionId, keyword));

        uint256 distanceClockwise = (
            (nodePositionOnHashRing > keywordPositionOnHashRing)
                ? nodePositionOnHashRing - keywordPositionOnHashRing
                : keywordPositionOnHashRing - nodePositionOnHashRing
        );

        return (
            (distanceClockwise < HASH_RING_SIZE - distanceClockwise)
                ? distanceClockwise
                : HASH_RING_SIZE - distanceClockwise
        );
    }

    function calculateNeighborhoodBoundaryDistances(
        uint8 hashFunctionId,
        bytes calldata leftEdgeNodeId,
        bytes calldata closestEdgeNodeId,
        bytes calldata rightEdgeNodeId,
        bytes calldata keyword
    ) external view returns (uint256, uint256, uint256) {
        return (
            calculateDistance(hashFunctionId, leftEdgeNodeId, keyword),
            calculateDistance(hashFunctionId, closestEdgeNodeId, keyword),
            calculateDistance(hashFunctionId, rightEdgeNodeId, keyword)
        );
    }

    function normalizeDistance(uint256 distance, uint256 maxDistance, uint72 nodesCount) public view returns (uint64) {
        if (distance == 0) return 0;

        uint256 idealMaxDistance = (HASH_RING_SIZE / nodesCount) * ((parametersStorage.r2() + 1) / 2);
        uint256 divisor = (maxDistance <= idealMaxDistance) ? maxDistance : idealMaxDistance;

        uint256 maxMultiplier = type(uint256).max / distance;

        uint256 scaledDistanceScaleFactor = distanceScaleFactor;
        uint256 compensationFactor = 1;

        if (scaledDistanceScaleFactor > maxMultiplier) {
            compensationFactor = scaledDistanceScaleFactor / maxMultiplier;
            scaledDistanceScaleFactor = maxMultiplier;
        }

        uint256 scaledDistance = distance * scaledDistanceScaleFactor;
        uint256 adjustedDivisor = divisor / compensationFactor;

        return uint64(scaledDistance / adjustedDivisor);
    }

    function normalizeStake(uint96 stake) public view returns (uint64) {
        ParametersStorage ps = parametersStorage;

        uint96 minStake = ps.minimumStake();
        uint96 maxStake = ps.maximumStake();
        uint96 balancedStake = stake <= maxStake ? stake : maxStake;

        return uint64((uint256(stakeScaleFactor) * (balancedStake - minStake)) / (maxStake - minStake));
    }

    function getParameters() external view returns (uint96, uint96, uint32, uint32) {
        return (distanceScaleFactor, stakeScaleFactor, w1, w2);
    }

    function setDistanceScaleFactor(uint96 distanceScaleFactor_) external onlyHubOwner {
        distanceScaleFactor = distanceScaleFactor_;

        emit ParameterChanged("distanceScaleFactor", distanceScaleFactor);
    }

    function setStakeScaleFactor(uint96 stakeScaleFactor_) external onlyHubOwner {
        stakeScaleFactor = stakeScaleFactor_;

        emit ParameterChanged("stakeScaleFactor", stakeScaleFactor);
    }

    function setW1(uint32 w1_) external onlyHubOwner {
        w1 = w1_;

        emit ParameterChanged("w1", w1);
    }

    function setW2(uint32 w2_) external onlyHubOwner {
        w2 = w2_;

        emit ParameterChanged("w2", w2);
    }
}
