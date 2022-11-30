// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract ParametersStorage is Ownable {
    uint96 public minimumStake;
    uint96 public maximumStake;

    uint48 public R2;
    uint32 public R1;
    uint32 public R0;

    uint16 public commitWindowDuration;
    uint8 public minProofWindowOffsetPerc;
    uint8 public maxProofWindowOffsetPerc;
    uint8 public proofWindowDurationPerc;
    uint8 public replacementWindowDurationPerc;

    uint128 public epochLength;

    uint24 public stakeWithdrawalDelay;
    uint24 public rewardWithdrawalDelay;
    uint32 public slashingFreezeDuration;

    bool public delegationEnabled;

    constructor() {
        minimumStake = 50_000 ether;
        maximumStake = 5_000_000 ether;

        R2 = 20;
        R1 = 8;
        R0 = 3;

        commitWindowDuration = 15 minutes;
        minProofWindowOffsetPerc = 50;
        maxProofWindowOffsetPerc = 75;
        proofWindowDurationPerc = 25;
        replacementWindowDurationPerc = 0;

        epochLength = 1 hours;

        stakeWithdrawalDelay = 5 minutes;
        rewardWithdrawalDelay = 5 minutes;
        slashingFreezeDuration = 730 days;

        delegationEnabled = false;
    }

    function setMinimumStake(uint96 newMinimumStake)
        public
        onlyOwner
    {
        minimumStake = newMinimumStake;
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

    function setEpochLength(uint128 newEpochLength)
        public
        onlyOwner
    {
        epochLength = newEpochLength;
    }

    function setStakeWithdrawalDelay(uint24 newStakeWithdrawalDelay)
        public
        onlyOwner
    {
        stakeWithdrawalDelay = newStakeWithdrawalDelay;
    }

    function setRewardWithdrawalDelay(uint24 newRewardWithdrawalDelay)
        public
        onlyOwner
    {
        rewardWithdrawalDelay = newRewardWithdrawalDelay;
    }

    function setSlashingFreezeDuration(uint32 newSlashingFreezeDuration)
        public
        onlyOwner
    {
        slashingFreezeDuration = newSlashingFreezeDuration;
    }

    function setDelegationEnabled(bool enabled)
        public
        onlyOwner
    {
        delegationEnabled = enabled;
    }
}
