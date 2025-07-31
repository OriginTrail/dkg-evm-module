// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import {ContractStatus} from "./abstract/ContractStatus.sol";
import {INamed} from "./interfaces/INamed.sol";
import {IVersioned} from "./interfaces/IVersioned.sol";

import {V6_RandomSamplingStorage} from "./storage/V6_RandomSamplingStorage.sol";
import {StakingStorage} from "./storage/StakingStorage.sol";

contract ClaimV6Helper is INamed, IVersioned, ContractStatus {
    string private constant _NAME = "ClaimV6Helper";
    string private constant _VERSION = "1.0.0";

    uint256 public constant SCALE18 = 1e18;

    V6_RandomSamplingStorage public v6_randomSamplingStorage;
    StakingStorage public stakingStorage;

    constructor(address hubAddress) ContractStatus(hubAddress) {}

    function initialize() external onlyHub {
        v6_randomSamplingStorage = V6_RandomSamplingStorage(hub.getContractAddress("V6_RandomSamplingStorage"));
        stakingStorage = StakingStorage(hub.getContractAddress("StakingStorage"));
    }

    // External gateway for other contracts
    function prepareForStakeChangeV6External(
        uint256 epoch,
        uint72 identityId,
        bytes32 delegatorKey
    ) external onlyContracts returns (uint256) {
        return _prepareForStakeChangeV6(epoch, identityId, delegatorKey);
    }

    function _prepareForStakeChangeV6(
        uint256 epoch,
        uint72 identityId,
        bytes32 delegatorKey
    ) internal returns (uint256 delegatorEpochScore) {
        uint256 nodeScorePerStake36 = v6_randomSamplingStorage.getNodeEpochScorePerStake(epoch, identityId);

        uint256 currentDelegatorScore18 = v6_randomSamplingStorage.getEpochNodeDelegatorScore(
            epoch,
            identityId,
            delegatorKey
        );

        uint256 delegatorLastSettledNodeEpochScorePerStake36 = v6_randomSamplingStorage
            .getDelegatorLastSettledNodeEpochScorePerStake(epoch, identityId, delegatorKey);

        if (nodeScorePerStake36 == delegatorLastSettledNodeEpochScorePerStake36) {
            return currentDelegatorScore18;
        }

        uint96 stakeBase = stakingStorage.getDelegatorStakeBase(identityId, delegatorKey);

        if (stakeBase == 0) {
            v6_randomSamplingStorage.setDelegatorLastSettledNodeEpochScorePerStake(
                epoch,
                identityId,
                delegatorKey,
                nodeScorePerStake36
            );
            return currentDelegatorScore18;
        }

        uint256 scorePerStakeDiff36 = nodeScorePerStake36 - delegatorLastSettledNodeEpochScorePerStake36;
        uint256 scoreEarned18 = (uint256(stakeBase) * scorePerStakeDiff36) / SCALE18;

        if (scoreEarned18 > 0) {
            v6_randomSamplingStorage.addToEpochNodeDelegatorScore(epoch, identityId, delegatorKey, scoreEarned18);
        }

        v6_randomSamplingStorage.setDelegatorLastSettledNodeEpochScorePerStake(
            epoch,
            identityId,
            delegatorKey,
            nodeScorePerStake36
        );

        return currentDelegatorScore18 + scoreEarned18;
    }

    // INamed & IVersioned
    function name() external pure override returns (string memory) {
        return _NAME;
    }

    function version() external pure override returns (string memory) {
        return _VERSION;
    }
}
