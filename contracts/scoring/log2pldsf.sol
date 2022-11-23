// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { HashingProxy } from "../HashingProxy.sol";
import { Hub } from "../Hub.sol";
import { IScoreFunction } from "../interface/IScoreFunction.sol";
import { ParametersStorage } from "../storage/ParametersStorage.sol";
import { PRBMathUD60x18 } from "@prb/math/contracts/PRBMathUD60x18.sol";

// Logarithmic Polynomial Long Division Score Function
contract Log2PLDSF is IScoreFunction {
    using PRBMathUD60x18 for uint256;

    Hub public hub;

    uint256 public distanceMappingCoefficient;
    uint96 public stakeMappingCoefficient;

    uint32 public multiplier;
    uint32 public logArgumentConstant;
    uint32 public a;
    uint32 public stakeExponent;
    uint32 public b;
    uint32 public c;
    uint32 public distanceExponent;
    uint32 public d;

    constructor(address hubAddress) {
        require(hubAddress != address(0));
        hub = Hub(hubAddress);

        setDistanceMappingCoefficient(1_000);
        setStakeMappingCoefficient(200_000);

        multiplier = 10000;
        logArgumentConstant = 1;
        a = 1;
        stakeExponent = 1;
        b = 0;
        c = 1;
        distanceExponent = 2;
        d = 1;
    }

    modifier onlyHubOwner() {
        require (
            msg.sender == hub.owner(),
            "Function can only be called by hub owner"
        );
        _;
    }

    function calculateScore(uint256 distance, uint96 stake)
        public
        view
        returns (uint32)
    {
        uint256 mappedDistance = distance / distanceMappingCoefficient;
        uint96 mappedStake = stake / stakeMappingCoefficient;

        uint64 coefficient = 1 ether;

        return uint32(
            multiplier * (
                logArgumentConstant * coefficient +
                coefficient * (a * (mappedStake ** stakeExponent) + b) / (c * (mappedDistance ** distanceExponent) + d)
            ).log2() / coefficient
        );
    }

    function calculateDistance(uint8 hashFunctionId, bytes memory nodeId, bytes memory keyword)
        public
        returns (uint256)
    {
        HashingProxy hashingProxy = HashingProxy(hub.getContractAddress("HashingProxy"));
        bytes32 nodeIdHash = hashingProxy.callHashFunction(hashFunctionId, nodeId);
        bytes32 keywordHash = hashingProxy.callHashFunction(hashFunctionId, keyword);

        return uint256(nodeIdHash ^ keywordHash);
    }

    function getParameters()
        public
        view
        returns (uint256, uint96, uint32[8] memory)
    {
        return (
            distanceMappingCoefficient,
            stakeMappingCoefficient,
            [
                multiplier,
                logArgumentConstant,
                a,
                stakeExponent,
                b,
                c,
                distanceExponent,
                d
            ]
        );
    }

    function setDistanceMappingCoefficient(uint256 distanceRangeMax)
        public
        onlyHubOwner
    {
        distanceMappingCoefficient = type(uint256).max / distanceRangeMax;
    }

    function setStakeMappingCoefficient(uint96 stakeRangeMax)
        public
        onlyHubOwner
    {
        ParametersStorage parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));
        stakeMappingCoefficient = parametersStorage.maximumStake() / stakeRangeMax;
    }

    function setMultiplier(uint32 multiplier_)
        public
        onlyHubOwner
    {
        multiplier = multiplier_;
    }

    function setLogArgumentConstant(uint32 logArgumentConstant_)
        public
        onlyHubOwner
    {
        logArgumentConstant = logArgumentConstant_;
    }

    function setA(uint32 a_)
        public
        onlyHubOwner
    {
        a = a_;
    }

    function setStakeExponent(uint32 stakeExponent_)
        public
        onlyHubOwner
    {
        stakeExponent = stakeExponent_;
    }

    function setB(uint32 b_)
        public
        onlyHubOwner
    {
        b = b_;
    }

    function setC(uint32 c_)
        public
        onlyHubOwner
    {
        c = c_;
    }

    function setDistanceExponent(uint32 distanceExponent_)
        public
        onlyHubOwner
    {
        distanceExponent = distanceExponent_;
    }

    function setD(uint32 d_)
        public
        onlyHubOwner
    {
        d = d_;
    }
}
