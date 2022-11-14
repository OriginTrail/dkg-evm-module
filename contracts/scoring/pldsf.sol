// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IScoringFunction } from "../interface/ScoringFunction.sol";
import { HashingHub } from "../HashingHub.sol";
import { Hub } from "../Hub.sol";

// Polynomial Long Division Scoring Function
contract PLDSF is IScoringFunction {
    Hub public hub;

    uint32 private _a;
    uint32 private _stakeExponent;
    uint32 private _b;
    uint32 private _c;
    uint32 private _distanceExponent;
    uint32 private _d;

    constructor(address hubAddress) {
        require(hubAddress != address(0));
        hub = Hub(hubAddress);
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
        returns (uint32)
    {
        // VERIFY: uint256 -> uint32 casting
        return uint32((_a * stake^_stakeExponent + _b) / (_c * distance^_distanceExponent + _d));
    }

    function calculateDistance(uint8 hashingFunctionId, bytes memory nodeId, bytes memory keyword)
        public
        returns (uint256)
    {
        HashingHub hashingHub = HashingHub(hub.getContractAddress("HashingHub"));
        bytes32 nodeIdHash = hashingHub.callHashingFunction(hashingFunctionId, nodeId);
        bytes32 keywordHash = hashingHub.callHashingFunction(hashingFunctionId, keyword);

        return uint256(nodeIdHash ^ keywordHash);
    }

    function setA(uint32 a_)
        public
        onlyHubOwner
    {
        _a = a_;
    }

    function setStakeExponent(uint32 stakeExponent_)
        public
        onlyHubOwner
    {
        _stakeExponent = stakeExponent_;
    }

    function setB(uint32 b_)
        public
        onlyHubOwner
    {
        _b = b_;
    }

    function setC(uint32 c_)
        public
        onlyHubOwner
    {
        _c = c_;
    }

    function setDistanceExponent(uint32 distanceExponent_)
        public
        onlyHubOwner
    {
        _distanceExponent = distanceExponent_;
    }

    function setD(uint32 d_)
        public
        onlyHubOwner
    {
        _d = d_;
    }
}
