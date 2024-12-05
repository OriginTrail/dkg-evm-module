// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {HubDependent} from "../abstract/HubDependent.sol";
import {INamed} from "../interfaces/INamed.sol";
import {IVersioned} from "../interfaces/IVersioned.sol";

contract ParametersStorage is INamed, IVersioned, HubDependent {
    event ParameterChanged(string parameterName, uint256 parameterValue);

    string private constant _NAME = "ParametersStorage";
    string private constant _VERSION = "1.0.0";

    // 0 - minProofWindowOffsetPerc
    // 1 - maxProofWindowOffsetPerc
    // 2 - commitWindowDurationPerc
    // 3 - proofWindowDurationPerc
    // 4 - replacementWindowDurationPerc
    // 5 - finalizationCommitsNumber
    uint8[6] internal args1;

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

    uint16 public updateCommitWindowDuration;

    uint16 public hashFunctionsLimit;
    uint16 public opWalletsLimitOnProfileCreation;
    uint16 public shardingTableSizeLimit;

    constructor(address hubAddress) HubDependent(hubAddress) {
        // minimumStake
        args3[0] = 50_000 ether;
        // maximumStake
        args3[1] = 2_000_000 ether;

        r2 = 20;
        // r1
        args2[1] = 8;
        // r0
        args2[0] = 3;

        // minProofWindowOffsetPerc
        args1[0] = 50;
        // maxProofWindowOffsetPerc
        args1[1] = 75;
        // commitWindowDurationPerc
        args1[2] = 25;
        // proofWindowDurationPerc
        args1[3] = 25;
        // replacementWindowDurationPerc
        args1[4] = 0;

        epochLength = 90 days;

        // stakeWithdrawalDelay
        args4[0] = 28 days;
        // rewardWithdrawalDelay
        args4[1] = 28 days;
        // slashingFreezeDuration
        args2[2] = 730 days;

        updateCommitWindowDuration = 30 minutes;

        hashFunctionsLimit = 20;
        opWalletsLimitOnProfileCreation = 50;
        shardingTableSizeLimit = 500;

        // finalizationCommitsNumber
        args1[5] = 3;
    }

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function minimumStake() external view returns (uint96) {
        return args3[0];
    }

    function setMinimumStake(uint96 newMinimumStake) external onlyHubOwner {
        args3[0] = newMinimumStake;

        emit ParameterChanged("minimumStake", newMinimumStake);
    }

    function maximumStake() external view returns (uint96) {
        return args3[1];
    }

    function setMaximumStake(uint96 newMaximumStake) external onlyHubOwner {
        args3[1] = newMaximumStake;

        emit ParameterChanged("maximumStake", newMaximumStake);
    }

    function setR2(uint48 newR2) external onlyHubOwner {
        r2 = newR2;

        emit ParameterChanged("r2", newR2);
    }

    function r1() external view returns (uint32) {
        return args2[1];
    }

    function setR1(uint32 newR1) external onlyHubOwner {
        require(newR1 >= (2 * args2[0] - 1), "R1 should be >= 2*R0-1");

        args2[1] = newR1;

        emit ParameterChanged("r1", newR1);
    }

    function r0() external view returns (uint32) {
        return args2[0];
    }

    function setR0(uint32 newR0) external onlyHubOwner {
        require(newR0 <= ((args2[1] + 1) / 2), "R0 should be <= (R1+1)/2");

        args2[0] = newR0;

        emit ParameterChanged("r0", newR0);
    }

    function minProofWindowOffsetPerc() external view returns (uint8) {
        return args1[0];
    }

    function setMinProofWindowOffsetPerc(uint8 newMinProofWindowOffsetPerc) external onlyHubOwner {
        args1[0] = newMinProofWindowOffsetPerc;

        emit ParameterChanged("minProofWindowOffsetPerc", newMinProofWindowOffsetPerc);
    }

    function maxProofWindowOffsetPerc() external view returns (uint8) {
        return args1[1];
    }

    function setMaxProofWindowOffsetPerc(uint8 newMaxProofWindowOffsetPerc) external onlyHubOwner {
        args1[1] = newMaxProofWindowOffsetPerc;

        emit ParameterChanged("maxProofWindowOffsetPerc", newMaxProofWindowOffsetPerc);
    }

    function commitWindowDurationPerc() external view returns (uint8) {
        return args1[2];
    }

    function setCommitWindowDurationPerc(uint8 newCommitWindowDurationPerc) external onlyHubOwner {
        args1[2] = newCommitWindowDurationPerc;

        emit ParameterChanged("commitWindowDurationPerc", newCommitWindowDurationPerc);
    }

    function proofWindowDurationPerc() external view returns (uint8) {
        return args1[3];
    }

    function setProofWindowDurationPerc(uint8 newProofWindowDurationPerc) external onlyHubOwner {
        args1[3] = newProofWindowDurationPerc;

        emit ParameterChanged("proofWindowDurationPerc", newProofWindowDurationPerc);
    }

    function replacementWindowDurationPerc() external view returns (uint8) {
        return args1[4];
    }

    function setReplacementWindowDurationPerc(uint8 newReplacementWindowDurationPerc) external onlyHubOwner {
        args1[4] = newReplacementWindowDurationPerc;

        emit ParameterChanged("replacementWindowDurationPerc", newReplacementWindowDurationPerc);
    }

    function setEpochLength(uint128 newEpochLength) external onlyHubOwner {
        epochLength = newEpochLength;

        emit ParameterChanged("epochLength", newEpochLength);
    }

    function stakeWithdrawalDelay() external view returns (uint24) {
        return args4[0];
    }

    function setStakeWithdrawalDelay(uint24 newStakeWithdrawalDelay) external onlyHubOwner {
        args4[0] = newStakeWithdrawalDelay;

        emit ParameterChanged("stakeWithdrawalDelay", newStakeWithdrawalDelay);
    }

    function rewardWithdrawalDelay() external view returns (uint24) {
        return args4[1];
    }

    function setRewardWithdrawalDelay(uint24 newRewardWithdrawalDelay) external onlyHubOwner {
        args4[1] = newRewardWithdrawalDelay;

        emit ParameterChanged("rewardWithdrawalDelay", newRewardWithdrawalDelay);
    }

    function slashingFreezeDuration() external view returns (uint32) {
        return args2[2];
    }

    function setSlashingFreezeDuration(uint32 newSlashingFreezeDuration) external onlyHubOwner {
        args2[2] = newSlashingFreezeDuration;

        emit ParameterChanged("slashingFreezeDuration", newSlashingFreezeDuration);
    }

    function setUpdateCommitWindowDuration(uint16 newUpdateCommitWindowDuration) external onlyHubOwner {
        updateCommitWindowDuration = newUpdateCommitWindowDuration;

        emit ParameterChanged("updateCommitWindowDuration", newUpdateCommitWindowDuration);
    }

    function setHashFunctionsLimit(uint16 hashFunctionsLimit_) external onlyHubOwner {
        hashFunctionsLimit = hashFunctionsLimit_;

        emit ParameterChanged("hashFunctionsLimit", hashFunctionsLimit);
    }

    function setOpWalletsLimitOnProfileCreation(uint16 opWalletsLimitOnProfileCreation_) external onlyHubOwner {
        opWalletsLimitOnProfileCreation = opWalletsLimitOnProfileCreation_;

        emit ParameterChanged("opWalletsLimitOnProfileCreation", opWalletsLimitOnProfileCreation);
    }

    function setShardingTableSizeLimit(uint16 shardingTableSizeLimit_) external onlyHubOwner {
        shardingTableSizeLimit = shardingTableSizeLimit_;

        emit ParameterChanged("shardingTableSizeLimit", shardingTableSizeLimit);
    }

    function finalizationCommitsNumber() external view returns (uint8) {
        return args1[5];
    }

    function setFinalizationCommitsNumber(uint8 newFinalizationCommitsNumber) external onlyHubOwner {
        args1[5] = newFinalizationCommitsNumber;

        emit ParameterChanged("finalizationCommitsNumber", newFinalizationCommitsNumber);
    }
}
