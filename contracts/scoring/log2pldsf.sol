// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import { HashingProxy } from "../HashingProxy.sol";
import { Hub } from "../Hub.sol";
import { ParametersStorage } from "../storage/ParametersStorage.sol";
import { Indexable } from "../interface/Indexable.sol";
import { IScoreFunction } from "../interface/IScoreFunction.sol";
import { Named } from "../interface/Named.sol";
import { PRBMathUD60x18 } from "@prb/math/contracts/PRBMathUD60x18.sol";

// Logarithmic Polynomial Long Division Score Function
contract Log2PLDSF is IScoreFunction, Indexable, Named {

    using PRBMathUD60x18 for uint256;

    uint8 private constant _ID = 1;
    string private constant _NAME = "Log2PLDSF";

    Hub public hub;
    HashingProxy public hashingProxy;
    ParametersStorage public parametersStorage;

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
        initialize();

        distanceMappingCoefficient = type(uint256).max / 1_000;
        stakeMappingCoefficient = parametersStorage.maximumStake() / 200_000;

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
        _checkHubOwner();
        _;
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
        uint256 mappedDistance = distance / distanceMappingCoefficient;
        uint96 mappedStake = stake / stakeMappingCoefficient;

        uint64 coefficient = 1 ether;

        return uint40(
            multiplier * (
                logArgumentConstant * coefficient +
                coefficient * (a * (mappedStake ** stakeExponent) + b) / (c * (mappedDistance ** distanceExponent) + d)
            ).log2() / coefficient
        );
    }

    function calculateDistance(uint8 hashFunctionId, bytes calldata nodeId, bytes calldata keyword)
        external
        view
        returns (uint256)
    {
        HashingProxy hp = hashingProxy;
        bytes32 nodeIdHash = hp.callHashFunction(hashFunctionId, nodeId);
        bytes32 keywordHash = hp.callHashFunction(hashFunctionId, keyword);

        return uint256(nodeIdHash ^ keywordHash);
    }

    function getParameters() external view returns (uint256, uint96, uint32[8] memory) {
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

    function setDistanceMappingCoefficient(uint256 distanceRangeMax) external onlyHubOwner {
        distanceMappingCoefficient = type(uint256).max / distanceRangeMax;
    }

    function setStakeMappingCoefficient(uint96 stakeRangeMax) external onlyHubOwner {
        stakeMappingCoefficient = parametersStorage.maximumStake() / stakeRangeMax;
    }

    function setMultiplier(uint32 multiplier_) external onlyHubOwner {
        multiplier = multiplier_;
    }

    function setLogArgumentConstant(uint32 logArgumentConstant_) external onlyHubOwner {
        logArgumentConstant = logArgumentConstant_;
    }

    function setA(uint32 a_) external onlyHubOwner {
        a = a_;
    }

    function setStakeExponent(uint32 stakeExponent_) external onlyHubOwner {
        stakeExponent = stakeExponent_;
    }

    function setB(uint32 b_) external onlyHubOwner {
        b = b_;
    }

    function setC(uint32 c_) external onlyHubOwner {
        c = c_;
    }

    function setDistanceExponent(uint32 distanceExponent_) external onlyHubOwner {
        distanceExponent = distanceExponent_;
    }

    function setD(uint32 d_) external onlyHubOwner {
        d = d_;
    }

    function _checkHubOwner() internal view virtual {
        require (msg.sender == hub.owner(), "Fn can only be used by hub owner");
    }

}
