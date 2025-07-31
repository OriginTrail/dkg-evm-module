// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

// ─────────────────────────────────────────────────────────────
// External contracts & interfaces
// ─────────────────────────────────────────────────────────────
import {Staking} from "./Staking.sol";
import {V6_Claim} from "./V6_Claim.sol";
import {ProfileStorage} from "./storage/ProfileStorage.sol";
import {ProfileLib} from "./libraries/ProfileLib.sol";
import {Chronos} from "./storage/Chronos.sol";
import {DelegatorsInfo} from "./storage/DelegatorsInfo.sol";
import {V6_DelegatorsInfo} from "./storage/V6_DelegatorsInfo.sol";
import {V8_1_1_Rewards_Period_Storage} from "./storage/V8_1_1_Rewards_Period_Storage.sol";
import {V8_1_1_Rewards_Period} from "./V8_1_1_Rewards_Period.sol";
import {ContractStatus} from "./abstract/ContractStatus.sol";
import {INamed} from "./interfaces/INamed.sol";
import {IVersioned} from "./interfaces/IVersioned.sol";

/**
 * @title StakingManager
 * @notice Thin wrapper that combines reward-claiming functionality spanning
 *         multiple contract generations (v8 & legacy v6). This contract
 *         off-loads heavy logic to the underlying `Staking` and `V6_Claim`
 *         contracts but offers a unified interface for callers.
 */
contract StakingManager is INamed, IVersioned, ContractStatus {
    string private constant _NAME = "StakingManager";
    string private constant _VERSION = "1.0.0";

    uint256 private constant V6_NODE_CUTOFF_TS = 1725292800;

    Staking public stakingMain;
    V6_Claim public v6Claim;
    ProfileStorage public profileStorage;
    Chronos public chronos;
    DelegatorsInfo public delegatorsInfo;
    V6_DelegatorsInfo public v6_delegatorsInfo;
    V8_1_1_Rewards_Period_Storage public v8_1_1_rewards_storage;
    V8_1_1_Rewards_Period public v8_1_1_rewards_period;

    modifier profileExists(uint72 identityId) {
        _checkProfileExists(identityId);
        _;
    }

    constructor(address hubAddress) ContractStatus(hubAddress) {}

    /**
     * @dev Resolves contract addresses from the Hub. Must be called once by Hub
     *      immediately after deployment.
     */
    function initialize() external onlyHub {
        stakingMain = Staking(hub.getContractAddress("Staking"));
        v6Claim = V6_Claim(hub.getContractAddress("V6_Claim"));
        profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        chronos = Chronos(hub.getContractAddress("Chronos"));
        delegatorsInfo = DelegatorsInfo(hub.getContractAddress("DelegatorsInfo"));
        v6_delegatorsInfo = V6_DelegatorsInfo(hub.getContractAddress("V6_DelegatorsInfo"));
        v8_1_1_rewards_storage = V8_1_1_Rewards_Period_Storage(hub.getContractAddress("V8_1_1_Rewards_Period_Storage"));
        v8_1_1_rewards_period = V8_1_1_Rewards_Period(hub.getContractAddress("V8_1_1_Rewards_Period"));
    }

    function _checkProfileExists(uint72 identityId) internal view virtual {
        if (!profileStorage.profileExists(identityId)) {
            revert ProfileLib.ProfileDoesntExist(identityId);
        }
    }

    function name() external pure override returns (string memory) {
        return _NAME;
    }

    function version() external pure override returns (string memory) {
        return _VERSION;
    }

    // Forwarder to underlying V6 contract keeping original signature
    function claimDelegatorRewardsV6(uint72 identityId, uint256 epoch, address delegator) public {
        v6Claim.claimDelegatorRewardsV6(identityId, epoch, delegator);
    }

    function claimDelegatorRewardsCombined(
        uint72 identityId,
        uint256 epoch,
        address delegator
    ) external profileExists(identityId) {
        stakingMain.claimDelegatorRewards(identityId, epoch, delegator);
        // Execute V6-specific claim logic only for nodes created before the cutoff timestamp
        if (profileStorage.getOperatorFeeEffectiveDateByIndex(identityId, 0) < V6_NODE_CUTOFF_TS) {
            claimDelegatorRewardsV6(identityId, epoch, delegator);
        }

        // V8.1.1 migration rewards – auto-restake when delegator is up-to-date
        uint256 currentEpoch = chronos.getCurrentEpoch();
        uint256 previousEpoch = currentEpoch - 1;

        if (
            delegatorsInfo.getLastClaimedEpoch(identityId, delegator) == previousEpoch &&
            v6_delegatorsInfo.getLastClaimedEpoch(identityId, delegator) == previousEpoch
        ) {
            (uint96 reward811, bool claimed811) = v8_1_1_rewards_storage.getReward(identityId, delegator);
            if (reward811 > 0 && !claimed811) {
                v8_1_1_rewards_period.increaseDelegatorStakeBase(identityId, delegator);
            }
        }
    }

    function batchClaimDelegatorRewardsV81(
        uint72 identityId,
        uint256[] memory epochs,
        address[] memory delegators
    ) external profileExists(identityId) {
        for (uint256 i = 0; i < epochs.length; i++) {
            for (uint256 j = 0; j < delegators.length; j++) {
                stakingMain.claimDelegatorRewards(identityId, epochs[i], delegators[j]);
            }
        }
    }

    function batchClaimDelegatorRewardsV6(
        uint72 identityId,
        uint256[] memory epochs,
        address[] memory delegators
    ) external profileExists(identityId) {
        for (uint256 i = 0; i < epochs.length; i++) {
            for (uint256 j = 0; j < delegators.length; j++) {
                claimDelegatorRewardsV6(identityId, epochs[i], delegators[j]);
            }
        }
    }

    function batchClaimDelegatorRewardsCombined(
        uint72 identityId,
        uint256[] memory epochs,
        address[] memory delegators
    ) external profileExists(identityId) {
        for (uint256 i = 0; i < epochs.length; i++) {
            for (uint256 j = 0; j < delegators.length; j++) {
                claimDelegatorRewardsV6(identityId, epochs[i], delegators[j]);
                stakingMain.claimDelegatorRewards(identityId, epochs[i], delegators[j]);
            }
        }
    }

    // (lazy helper removed – rewards contracts now resolved during initialize)
}
