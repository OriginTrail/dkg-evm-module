// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {HashingProxy} from "../HashingProxy.sol";
import {ParametersStorage} from "../storage/ParametersStorage.sol";
import {HubDependent} from "../abstract/HubDependent.sol";
import {Indexable} from "../interface/Indexable.sol";
import {Initializable} from "../interface/Initializable.sol";
import {IScoreFunction} from "../interface/IScoreFunction.sol";
import {Named} from "../interface/Named.sol";
import {PRBMathUD60x18} from "@prb/math/contracts/PRBMathUD60x18.sol";

// Logarithmic Polynomial Long Division Score Function
contract Log2PLDSF is IScoreFunction, Indexable, Named, HubDependent, Initializable {
    using PRBMathUD60x18 for uint256;

    event ParameterChanged(string parameterName, uint256 parameterValue);

    uint8 private constant _ID = 1;
    string private constant _NAME = "Log2PLDSF";

    HashingProxy public hashingProxy;
    ParametersStorage public parametersStorage;

    uint256 public distanceMappingCoefficient;
    uint96 public stakeRangeMax;

    uint32 public multiplier;
    uint32 public logArgumentConstant;
    uint32 public a;
    uint32 public stakeExponent;
    uint32 public b;
    uint32 public c;
    uint32 public distanceExponent;
    uint32 public d;

    constructor(address hubAddress) HubDependent(hubAddress) {
        distanceMappingCoefficient = type(uint256).max / 1_000;
        stakeRangeMax = 200_000;

        multiplier = 10000;
        logArgumentConstant = 1;
        a = 1;
        stakeExponent = 1;
        b = 0;
        c = 1;
        distanceExponent = 2;
        d = 1;
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

    function calculateScore(uint256 distance, uint96 stake) external view returns (uint40) {
        uint64 coefficient = 1e18;
        uint96 maxStake = parametersStorage.maximumStake();

        uint96 balancedStake = stake <= maxStake ? stake : maxStake;
        uint96 mappedStake = balancedStake / (maxStake / stakeRangeMax);

        uint256 mappedDistance = distance / distanceMappingCoefficient;

        return
            uint40(
                (multiplier *
                    (logArgumentConstant *
                        coefficient +
                        (coefficient * (a * (mappedStake ** stakeExponent) + b)) /
                        (c * (mappedDistance ** distanceExponent) + d)).log2()) / coefficient
            );
    }

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

    function getParameters()
        external
        view
        returns (uint256 distanceMapCoefficient, uint96 stakeMapCoefficient, uint32[8] memory formulaCoefficients)
    {
        return (
            distanceMappingCoefficient,
            (parametersStorage.maximumStake() / stakeRangeMax),
            [multiplier, logArgumentConstant, a, stakeExponent, b, c, distanceExponent, d]
        );
    }

    function setDistanceMappingCoefficient(uint256 distanceRangeMax) external onlyHubOwner {
        distanceMappingCoefficient = type(uint256).max / distanceRangeMax;

        emit ParameterChanged("distanceMappingCoefficient", distanceMappingCoefficient);
    }

    function setStakeRangeMax(uint96 stakeRangeMax_) external onlyHubOwner {
        stakeRangeMax = stakeRangeMax_;

        emit ParameterChanged("stakeRangeMax", stakeRangeMax);
    }

    function setMultiplier(uint32 multiplier_) external onlyHubOwner {
        multiplier = multiplier_;

        emit ParameterChanged("multiplier", multiplier);
    }

    function setLogArgumentConstant(uint32 logArgumentConstant_) external onlyHubOwner {
        logArgumentConstant = logArgumentConstant_;

        emit ParameterChanged("logArgumentConstant", logArgumentConstant);
    }

    function setA(uint32 a_) external onlyHubOwner {
        a = a_;

        emit ParameterChanged("a", a);
    }

    function setStakeExponent(uint32 stakeExponent_) external onlyHubOwner {
        stakeExponent = stakeExponent_;

        emit ParameterChanged("stakeExponent", stakeExponent);
    }

    function setB(uint32 b_) external onlyHubOwner {
        b = b_;

        emit ParameterChanged("b", b);
    }

    function setC(uint32 c_) external onlyHubOwner {
        c = c_;

        emit ParameterChanged("c", c);
    }

    function setDistanceExponent(uint32 distanceExponent_) external onlyHubOwner {
        distanceExponent = distanceExponent_;

        emit ParameterChanged("distanceExponent", distanceExponent);
    }

    function setD(uint32 d_) external onlyHubOwner {
        d = d_;

        emit ParameterChanged("d", d);
    }
}
