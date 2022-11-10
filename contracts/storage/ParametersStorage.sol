// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";


contract ParametersStorage is Ownable {
    uint96 public minimalStake;

    uint48 public R2;
    uint32 public R1;
    uint32 public R0;

    uint16 public commitWindowDuration;
    uint8 public minProofWindowOffsetPerc;
    uint8 public maxProofWindowOffsetPerc;
    uint8 public proofWindowDurationPerc;
    uint8 public replacementWindowDurationPerc;

    uint256 public epochLength;

    constructor() {
        minimalStake = 50000 ether;

        R2 = 20;
        R1 = 8;
        R0 = 3;

        commitWindowDuration = 15 minutes;
        minProofWindowOffsetPerc = 90;
        maxProofWindowOffsetPerc = 98;
        proofWindowDurationPerc = 1;
        replacementWindowDurationPerc = 1;

        epochLength = 30 days;
    }

    function setMinimalStake(uint96 newMinimalStake)
        public
        onlyOwner
    {
        minimalStake = newMinimalStake;
    }

    function setR2(uint48 newR2)
        public
        onlyOwner
    {
        R2 = newR2;
    }

    function setR1(uint32 newR1)
        public
        onlyOwner
    {
        R1 = newR1;
    }

    function setR0(uint32 newR0)
        public
        onlyOwner
    {
        R0 = newR0;
    }

    function setCommitWindowDuration(uint16 newCommitWindowDuration)
        public
        onlyOwner
    {
        commitWindowDuration = newCommitWindowDuration;
    }

    function setMinProofWindowOffsetPerc(uint8 newMinProofWindowOffsetPerc)
        public
        onlyOwner
    {
        minProofWindowOffsetPerc = newMinProofWindowOffsetPerc;
    }

    function setMaxProofWindowOffsetPerc(uint8 newMaxProofWindowOffsetPerc)
        public
        onlyOwner
    {
        maxProofWindowOffsetPerc = newMaxProofWindowOffsetPerc;
    }

    function setProofWindowDurationPerc(uint8 newProofWindowDurationPerc)
        public
        onlyOwner
    {
        proofWindowDurationPerc = newProofWindowDurationPerc;
    }

    function setReplacementWindowDurationPerc(uint8 newReplacementWindowDurationPerc)
        public
        onlyOwner
    {
        replacementWindowDurationPerc = newReplacementWindowDurationPerc;
    }

    function setEpochLength(uint256 newEpochLength)
        public
        onlyOwner
    {
        epochLength = newEpochLength;
    }
}