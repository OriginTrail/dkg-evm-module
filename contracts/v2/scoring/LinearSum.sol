// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {HashingProxy} from "../../v1/HashingProxy.sol";
import {ParametersStorage} from "../../v1/storage/ParametersStorage.sol";
import {HubDependent} from "../../v1/abstract/HubDependent.sol";
import {Indexable} from "../../v1/interface/Indexable.sol";
import {Initializable} from "../../v1/interface/Initializable.sol";
import {IScoreFunction} from "../../v1/interface/IScoreFunction.sol";
import {Named} from "../../v1/interface/Named.sol";
import {PRBMathUD60x18} from "@prb/math/contracts/PRBMathUD60x18.sol";

contract LinearSum is IScoreFunction, Indexable, Named, HubDependent, Initializable {
    using PRBMathUD60x18 for uint256;

    event ParameterChanged(string parameterName, uint256 parameterValue);

    uint8 private constant _ID = 2;
    string private constant _NAME = "LinearSum";

    HashingProxy public hashingProxy;
    ParametersStorage public parametersStorage;

    uint256 constant HASH_RING_SIZE = type(uint256).max;

    uint256 public distanceScaleFactor;

    uint32 public w1;
    uint32 public w2;

    constructor(address hubAddress) HubDependent(hubAddress) {
        distanceScaleFactor = 1000000000000000000;
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

    // TODO: Implement scoring function
    function calculateScore(
        uint8 hashFunctionId,
        bytes calldata nodeId,
        bytes calldata keyword
    ) external view returns (uint40) {
        return 1;
    }

    // TODO: Change this
    function calculateDistance(
        uint8 hashFunctionId,
        bytes calldata nodeId,
        bytes calldata keyword
    ) external view returns (uint256) {
        HashingProxy hp = hashingProxy;
        bytes32 nodeIdHash = hp.callHashFunction(hashFunctionId, nodeId);
        bytes32 keywordHash = hp.callHashFunction(hashFunctionId, keyword);

        return uint256(nodeIdHash ^ keywordHash);
    }

    function calculateClockwiseProximityOnHashRing(
        uint8 hashFunctionId,
        bytes calldata nodeId,
        bytes calldata keyword
    ) external view returns (uint256) {
        HashingProxy hp = hashingProxy;
        bytes32 nodeIdHash = hp.callHashFunction(hashFunctionId, nodeId);
        bytes32 keywordHash = hp.callHashFunction(hashFunctionId, keyword);

        uint256 peerPositionOnHashRing = uint256(nodeIdHash);
        uint256 keyPositionOnHashRing = uint256(keywordHash);

        uint256 clockwiseDistance;
        if (peerPositionOnHashRing > keyPositionOnHashRing) {
            uint256 distanceToEnd = HASH_RING_SIZE - peerPositionOnHashRing;
            clockwiseDistance = distanceToEnd + keyPositionOnHashRing;
        } else {
            clockwiseDistance = keyPositionOnHashRing - peerPositionOnHashRing;
        }

        return clockwiseDistance;
    }

    function calculateBidirectionalProximityOnHashRing(
        uint8 hashFunctionId,
        bytes calldata peerHash,
        bytes calldata keyHash
    ) external view returns (uint256) {
        uint256 peerPositionOnHashRing = uint256(hashingProxy.callHashFunction(hashFunctionId, peerHash));
        uint256 keyPositionOnHashRing = uint256(hashingProxy.callHashFunction(hashFunctionId, keyHash));

        uint256 directDistance;
        if (peerPositionOnHashRing > keyPositionOnHashRing) {
            directDistance = peerPositionOnHashRing - keyPositionOnHashRing;
        } else {
            directDistance = keyPositionOnHashRing - peerPositionOnHashRing;
        }

        uint256 wraparoundDistance = HASH_RING_SIZE - directDistance;

        return (directDistance < wraparoundDistance) ? directDistance : wraparoundDistance;
    }

    function getParameters() external view returns (uint256, uint32, uint32) {
        return (distanceScaleFactor, w1, w2);
    }

    function setW1(uint32 w1_) external onlyHubOwner {
        w1 = w1_;

        emit ParameterChanged("w1", w1);
    }

    function setW2(uint32 w2_) external onlyHubOwner {
        w2 = w2_;

        emit ParameterChanged("w2", w2);
    }

    function calculateScore(uint256 distance, uint96 stake) external view override returns (uint40) {}
}
