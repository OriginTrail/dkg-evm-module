// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {ContractStatus} from "./abstract/ContractStatus.sol";
import {INamed} from "./interfaces/INamed.sol";
import {IVersioned} from "./interfaces/IVersioned.sol";

import {V6_RandomSamplingStorage} from "./storage/V6_RandomSamplingStorage.sol";
import {StakingStorage} from "./storage/StakingStorage.sol";
import {DelegatorsInfo} from "./storage/DelegatorsInfo.sol";
import {V6_DelegatorsInfo} from "./storage/V6_DelegatorsInfo.sol";
import {Chronos} from "./storage/Chronos.sol";

contract ClaimV6Helper is INamed, IVersioned, ContractStatus {
    string private constant _NAME = "ClaimV6Helper";
    string private constant _VERSION = "1.0.0";

    uint256 public constant SCALE18 = 1e18;

    V6_RandomSamplingStorage public v6_randomSamplingStorage;
    StakingStorage public stakingStorage;
    DelegatorsInfo public delegatorsInfo;
    V6_DelegatorsInfo public v6_delegatorsInfo;
    Chronos public chronos;

    // V6_NODE_CUTOFF timestamp; default 03-Sep-2024 UTC; Hub can update
    uint256 public v6NodeCutoffTs;

    constructor(address hubAddress) ContractStatus(hubAddress) {}

    function initialize() external onlyHub {
        v6_randomSamplingStorage = V6_RandomSamplingStorage(hub.getContractAddress("V6_RandomSamplingStorage"));
        stakingStorage = StakingStorage(hub.getContractAddress("StakingStorage"));
        delegatorsInfo = DelegatorsInfo(hub.getContractAddress("DelegatorsInfo"));
        v6_delegatorsInfo = V6_DelegatorsInfo(hub.getContractAddress("V6_DelegatorsInfo"));
        chronos = Chronos(hub.getContractAddress("Chronos"));

        // Default cutoff 03-Sep-2024 00:00:00 UTC
        v6NodeCutoffTs = 1725292800;
    }

    // Hub owner can update cutoff
    function setV6NodeCutoffTs(uint256 newTs) external onlyHub {
        v6NodeCutoffTs = newTs;
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

    // Replicates Staking's pre-stake-change validation but for V6 stores.
    // Can be called by other Hub-registered contracts (e.g., Staking).
    function validateDelegatorEpochClaimsV6(uint72 identityId, address delegator) external onlyContracts {
        bytes32 delegatorKey = keccak256(abi.encodePacked(delegator));
        uint256 currentEpoch = chronos.getCurrentEpoch();
        uint256 previousEpoch = currentEpoch - 1;

        // Check whether delegator has ever staked on this node using the *main* DelegatorsInfo store
        if (delegatorsInfo.hasEverDelegatedToNode(identityId, delegator)) {
            if (stakingStorage.getDelegatorStakeBase(identityId, delegatorKey) == 0) {
                uint256 lastStakeHeldEpoch = delegatorsInfo.getLastStakeHeldEpoch(identityId, delegator);
                if (lastStakeHeldEpoch > 0 && lastStakeHeldEpoch < currentEpoch) {
                    revert("Must claim rewards up to the lastStakeHeldEpoch before changing stake");
                }
                // Rewards either not yet claimable or already claimed – sync last claimed epoch
                v6_delegatorsInfo.setLastClaimedEpoch(identityId, delegator, previousEpoch);
            }
        } else {
            // First time delegating on this node – mark it in main store and sync V6 claims pointer
            delegatorsInfo.setHasEverDelegatedToNode(identityId, delegator, true);
            v6_delegatorsInfo.setLastClaimedEpoch(identityId, delegator, previousEpoch);
        }

        uint256 lastClaimedEpoch = v6_delegatorsInfo.getLastClaimedEpoch(identityId, delegator);
        if (lastClaimedEpoch == previousEpoch) {
            return; // up-to-date
        }
        if (lastClaimedEpoch < previousEpoch - 1) {
            revert("Must claim all previous epoch rewards before changing stake");
        }

        uint256 delegatorScore18 = v6_randomSamplingStorage.getEpochNodeDelegatorScore(
            previousEpoch,
            identityId,
            delegatorKey
        );
        uint256 nodeScorePerStake36 = v6_randomSamplingStorage.getNodeEpochScorePerStake(previousEpoch, identityId);
        uint256 delegatorLastSettledScorePerStake36 = v6_randomSamplingStorage
            .getDelegatorLastSettledNodeEpochScorePerStake(previousEpoch, identityId, delegatorKey);

        if (delegatorScore18 == 0 && nodeScorePerStake36 == delegatorLastSettledScorePerStake36) {
            v6_delegatorsInfo.setLastClaimedEpoch(identityId, delegator, previousEpoch);
            return;
        }

        revert("Must claim the previous epoch rewards before changing stake");
    }

    // INamed & IVersioned
    function name() external pure override returns (string memory) {
        return _NAME;
    }

    function version() external pure override returns (string memory) {
        return _VERSION;
    }
}
