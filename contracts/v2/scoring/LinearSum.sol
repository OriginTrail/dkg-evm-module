// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {HashingProxy} from "../../v1/HashingProxy.sol";
import {ParametersStorage} from "../../v1/storage/ParametersStorage.sol";
import {HubDependent} from "../../v1/abstract/HubDependent.sol";
import {Indexable} from "../../v1/interface/Indexable.sol";
import {Initializable} from "../../v1/interface/Initializable.sol";
import {IProximityScoreFunctionsPair} from "../interface/IProximityScoreFunctionsPair.sol";
import {Named} from "../../v1/interface/Named.sol";

contract LinearSum is IProximityScoreFunctionsPair, Indexable, Named, HubDependent, Initializable {
    event ParameterChanged(string parameterName, uint256 parameterValue);

    uint8 private constant _ID = 2;
    string private constant _NAME = "LinearSum";

    uint256 constant HASH_RING_SIZE = type(uint256).max;

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
        return
            uint40((1e18 - normalizeDistance(distance, maxDistance, maxNodesNumber)) * w1 + normalizeStake(stake) * w2);
    }

    function calculateDistance(
        uint8 hashFunctionId,
        bytes calldata nodeId,
        bytes calldata keyword
    ) external view returns (uint256) {
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

    function normalizeDistance(uint256 distance, uint256 maxDistance, uint72 nodesCount) public view returns (uint64) {
        if (distance == 0) return 0;

        uint256 idealMaxDistance = (HASH_RING_SIZE / nodesCount) * (parametersStorage.r2() / 2);
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

        return uint64((uint256(stakeScaleFactor) * (stake - minStake)) / (maxStake - minStake));
    }

    function getParameters() external view returns (uint192, uint32, uint32) {
        return (distanceScaleFactor, w1, w2);
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
