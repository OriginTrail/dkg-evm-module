// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import {Hub} from "../Hub.sol";

contract ParametersStorage {
    Hub public hub;

    // 0 - minProofWindowOffsetPerc
    // 1 - maxProofWindowOffsetPerc
    // 2 - proofWindowDurationPerc
    // 3 - replacementWindowDurationPerc
    // 4 - finalizationCommitsNumber
    uint8[5] internal args1;

    // 0 - r0
    // 1 - r1
    // 2 - slashingFreezeDuration
    uint32[3] internal args2;
    uint48 public r2;

    // 0 - minimumStake
    // 1 - maximumStake
    uint96[2] internal args3;

    uint128 public epochLength;

    // 0 - stakeWithdrawalDelay
    // 1 - rewardWithdrawalDelay
    uint24[2] internal args4;

    uint16 public commitWindowDuration;

    constructor(address hubAddress) {
        require(hubAddress != address(0), "Hub Address cannot be 0x0");

        hub = Hub(hubAddress);

        // minimumStake
        args3[0] = 50_000 ether;
        // maximumStake
        args3[1] = 5_000_000 ether;

        r2 = 20;
        // r1
        args2[1] = 8;
        // r0
        args2[0] = 3;

        // minProofWindowOffsetPerc
        args1[0] = 50;
        // maxProofWindowOffsetPerc
        args1[1] = 75;
        // proofWindowDurationPerc
        args1[2] = 25;
        // replacementWindowDurationPerc
        args1[3] = 0;

        epochLength = 1 hours;

        // stakeWithdrawalDelay
        args4[0] = 5 minutes;
        // rewardWithdrawalDelay
        args4[1] = 5 minutes;
        // slashingFreezeDuration
        args2[2] = 730 days;

        commitWindowDuration = 15 minutes;

        // finalizationCommitsNumber
        args1[4] = 1;
    }

    modifier onlyHubOwner() {
        _checkHubOwner();
        _;
    }

    function minimumStake() external view returns (uint96) {
        return args3[0];
    }

    function setMinimumStake(uint96 newMinimumStake) external onlyHubOwner {
        args3[0] = newMinimumStake;
    }

    function maximumStake() external view returns (uint96) {
        return args3[1];
    }

    function setMaximumStake(uint96 newMaximumStake) external onlyHubOwner {
        args3[1] = newMaximumStake;
    }

    function setR2(uint48 newR2) external onlyHubOwner {
        r2 = newR2;
    }

    function r1() external view returns (uint32) {
        return args2[1];
    }

    function setR1(uint32 newR1) external onlyHubOwner {
        args2[1] = newR1;
    }

    function r0() external view returns (uint32) {
        return args2[0];
    }

    function setR0(uint32 newR0) external onlyHubOwner {
        args2[0] = newR0;
    }

    function minProofWindowOffsetPerc() external view returns (uint8) {
        return args1[0];
    }

    function setMinProofWindowOffsetPerc(uint8 newMinProofWindowOffsetPerc) external onlyHubOwner {
        args1[0] = newMinProofWindowOffsetPerc;
    }

    function maxProofWindowOffsetPerc() external view returns (uint8) {
        return args1[1];
    }

    function setMaxProofWindowOffsetPerc(uint8 newMaxProofWindowOffsetPerc) external onlyHubOwner {
        args1[1] = newMaxProofWindowOffsetPerc;
    }

    function proofWindowDurationPerc() external view returns (uint8) {
        return args1[2];
    }

    function setProofWindowDurationPerc(uint8 newProofWindowDurationPerc) external onlyHubOwner {
        args1[2] = newProofWindowDurationPerc;
    }

    function replacementWindowDurationPerc() external view returns (uint8) {
        return args1[3];
    }

    function setReplacementWindowDurationPerc(uint8 newReplacementWindowDurationPerc) external onlyHubOwner {
        args1[3] = newReplacementWindowDurationPerc;
    }

    function setEpochLength(uint128 newEpochLength) external onlyHubOwner {
        epochLength = newEpochLength;
    }

    function stakeWithdrawalDelay() external view returns (uint24) {
        return args4[0];
    }

    function setStakeWithdrawalDelay(uint24 newStakeWithdrawalDelay) external onlyHubOwner {
        args4[0] = newStakeWithdrawalDelay;
    }

    function rewardWithdrawalDelay() external view returns (uint24) {
        return args4[1];
    }

    function setRewardWithdrawalDelay(uint24 newRewardWithdrawalDelay) external onlyHubOwner {
        args4[0] = newRewardWithdrawalDelay;
    }

    function slashingFreezeDuration() external view returns (uint32) {
        return args2[2];
    }

    function setSlashingFreezeDuration(uint32 newSlashingFreezeDuration) external onlyHubOwner {
        args2[2] = newSlashingFreezeDuration;
    }

    function setCommitWindowDuration(uint16 newCommitWindowDuration) external onlyHubOwner {
        commitWindowDuration = newCommitWindowDuration;
    }

    function finalizationCommitsNumber() external view returns (uint8) {
        return args1[4];
    }

    function setFinalizationCommitsNumber(uint8 newFinalizationCommitsNumber) external onlyHubOwner {
        args1[4] = newFinalizationCommitsNumber;
    }

    function _checkHubOwner() internal view virtual {
        require(msg.sender == hub.owner(), "Fn can only be used by hub owner");
    }
}
