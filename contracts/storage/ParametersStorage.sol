// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import {Hub} from "../Hub.sol";

contract ParametersStorage {
    Hub public hub;

    uint96 public minimumStake;
    uint96 public maximumStake;

    uint32 public r0;
    uint32 public r1;
    uint48 public r2;

    uint8 public minProofWindowOffsetPerc;
    uint8 public maxProofWindowOffsetPerc;
    uint8 public proofWindowDurationPerc;
    uint8 public replacementWindowDurationPerc;

    uint128 public epochLength;

    uint24 public stakeWithdrawalDelay;
    uint24 public rewardWithdrawalDelay;
    uint32 public slashingFreezeDuration;

    uint16 public commitWindowDuration;

    uint8 public finalizationCommitsNumber;

    constructor(address hubAddress) {
        require(hubAddress != address(0), "Hub Address cannot be 0x0");

        hub = Hub(hubAddress);

        minimumStake = 50_000 ether;
        maximumStake = 5_000_000 ether;

        r2 = 20;
        r1 = 8;
        r0 = 3;

        minProofWindowOffsetPerc = 50;
        maxProofWindowOffsetPerc = 75;
        proofWindowDurationPerc = 25;
        replacementWindowDurationPerc = 0;

        epochLength = 1 hours;

        stakeWithdrawalDelay = 5 minutes;
        rewardWithdrawalDelay = 5 minutes;
        slashingFreezeDuration = 730 days;

        commitWindowDuration = 15 minutes;

        finalizationCommitsNumber = 1;
    }

    modifier onlyHubOwner() {
        _checkHubOwner();
        _;
    }

    function setMinimumStake(uint96 newMinimumStake) external onlyHubOwner {
        minimumStake = newMinimumStake;
    }

    function setR2(uint48 newR2) external onlyHubOwner {
        r2 = newR2;
    }

    function setR1(uint32 newR1) external onlyHubOwner {
        r1 = newR1;
    }

    function setR0(uint32 newR0) external onlyHubOwner {
        r0 = newR0;
    }

    function setMinProofWindowOffsetPerc(uint8 newMinProofWindowOffsetPerc) external onlyHubOwner {
        minProofWindowOffsetPerc = newMinProofWindowOffsetPerc;
    }

    function setMaxProofWindowOffsetPerc(uint8 newMaxProofWindowOffsetPerc) external onlyHubOwner {
        maxProofWindowOffsetPerc = newMaxProofWindowOffsetPerc;
    }

    function setProofWindowDurationPerc(uint8 newProofWindowDurationPerc) external onlyHubOwner {
        proofWindowDurationPerc = newProofWindowDurationPerc;
    }

    function setReplacementWindowDurationPerc(uint8 newReplacementWindowDurationPerc) external onlyHubOwner {
        replacementWindowDurationPerc = newReplacementWindowDurationPerc;
    }

    function setEpochLength(uint128 newEpochLength) external onlyHubOwner {
        epochLength = newEpochLength;
    }

    function setStakeWithdrawalDelay(uint24 newStakeWithdrawalDelay) external onlyHubOwner {
        stakeWithdrawalDelay = newStakeWithdrawalDelay;
    }

    function setRewardWithdrawalDelay(uint24 newRewardWithdrawalDelay) external onlyHubOwner {
        rewardWithdrawalDelay = newRewardWithdrawalDelay;
    }

    function setSlashingFreezeDuration(uint32 newSlashingFreezeDuration) external onlyHubOwner {
        slashingFreezeDuration = newSlashingFreezeDuration;
    }

    function setCommitWindowDuration(uint16 newCommitWindowDuration) external onlyHubOwner {
        commitWindowDuration = newCommitWindowDuration;
    }

    function setFinalizationCommitsNumber(uint8 newFinalizationCommitsNumber) external onlyHubOwner {
        finalizationCommitsNumber = newFinalizationCommitsNumber;
    }

    function _checkHubOwner() internal view virtual {
        require(msg.sender == hub.owner(), "Fn can only be used by hub owner");
    }
}
