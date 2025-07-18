// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import {StakingStorage} from "../storage/StakingStorage.sol";
import {DelegatorRewardsMigrationStorage} from "../storage/DelegatorRewardsMigrationStorage.sol";
import {ShardingTableStorage} from "../storage/ShardingTableStorage.sol";
import {ParametersStorage} from "../storage/ParametersStorage.sol";
import {Ask} from "../Ask.sol";
import {ShardingTable} from "../ShardingTable.sol";
import {DelegatorsInfo} from "../storage/DelegatorsInfo.sol";
import {ContractStatus} from "../abstract/ContractStatus.sol";
import {INamed} from "../interfaces/INamed.sol";
import {IVersioned} from "../interfaces/IVersioned.sol";
import {RandomSamplingStorage} from "../storage/RandomSamplingStorage.sol";
import {Chronos} from "../storage/Chronos.sol";

/**
 * @title DelegatorRewardsMigrator
 * @notice Logic contract that allows delegators to restake the migration
 *         rewards that have been pre-filled in `DelegatorRewardsStorage`.
 *         The implementation purposefully mimics the important state changes
 *         performed by `Staking.stake` but **without** requiring token
 *         allowances and transfers from the delegator because the tokens have
 *         already been moved to `StakingStorage` during the migration.
 *
 *         Workflow:
 *         1. Governance (Hub owner) populates `DelegatorRewardsStorage` with
 *            `(identityId, delegator, rewardAmount)` entries.
 *         2. Delegators call `increaseDelegatorStakeBase` providing the node
 *            they delegate to. The function will:
 *              • settle score changes for the current epoch (best-effort)
 *              • increase delegator stake base
 *              • increase node stake and total stake
 *              • insert node into the sharding table if required
 *              • recalculate active set so that Ask prices stay correct
 *              • mark the reward as claimed in storage.
 *         3. Governance can call `batchClaimAll` to process any unclaimed
 *            rewards in bulk (e.g., if some delegators never claim).
 */
contract DelegatorRewardsMigrator is INamed, IVersioned, ContractStatus {
    string private constant _NAME = "DelegatorRewardsMigrator";
    string private constant _VERSION = "1.0.0";

    DelegatorRewardsMigrationStorage public rewardsStorage;
    StakingStorage public stakingStorage;
    ShardingTableStorage public shardingTableStorage;
    ShardingTable public shardingTable;
    ParametersStorage public parametersStorage;
    Ask public askContract;
    DelegatorsInfo public delegatorsInfo;

    uint256 public constant SCALE18 = 1e18;

    RandomSamplingStorage public randomSamplingStorage;
    Chronos public chronos;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) ContractStatus(hubAddress) {}

    /**
     * @dev Initializes internal contract references from the Hub. Must be
     *      called once by the Hub immediately after deployment.
     */
    function initialize() external onlyHub {
        rewardsStorage = DelegatorRewardsMigrationStorage(hub.getContractAddress("DelegatorRewardsMigrationStorage"));
        stakingStorage = StakingStorage(hub.getContractAddress("StakingStorage"));
        shardingTableStorage = ShardingTableStorage(hub.getContractAddress("ShardingTableStorage"));
        shardingTable = ShardingTable(hub.getContractAddress("ShardingTable"));
        parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));
        askContract = Ask(hub.getContractAddress("Ask"));
        delegatorsInfo = DelegatorsInfo(hub.getContractAddress("DelegatorsInfo"));
        randomSamplingStorage = RandomSamplingStorage(hub.getContractAddress("RandomSamplingStorage"));
        chronos = Chronos(hub.getContractAddress("Chronos"));
    }

    // ---------------------------------------------------------------------------------------------
    // Public interface
    // ---------------------------------------------------------------------------------------------

    /**
     * @notice Claims the pre-calculated reward for the caller and immediately
     *         restakes it for the given node.
     * @param identityId The node identifier the caller is delegating to.
     */
    function increaseDelegatorStakeBase(uint72 identityId, address delegator) external {
        (uint96 addedStake, bool claimed) = rewardsStorage.getReward(identityId, delegator);
        require(addedStake > 0, "No reward");
        require(!claimed, "Already claimed");

        // ────────────────────────────────────────────────────────
        // Replicate Staking.stake logic (without token transfer)
        // ────────────────────────────────────────────────────────
        _validateDelegatorEpochClaims(identityId, delegator);

        bytes32 delegatorKey = _getDelegatorKey(delegator);
        _prepareForStakeChange(chronos.getCurrentEpoch(), identityId, delegatorKey);

        uint96 currentDelegatorStakeBase = stakingStorage.getDelegatorStakeBase(identityId, delegatorKey);
        uint96 newDelegatorStakeBase = currentDelegatorStakeBase + addedStake;

        uint96 totalNodeStakeBefore = stakingStorage.getNodeStake(identityId);
        uint96 totalNodeStakeAfter = totalNodeStakeBefore + addedStake;
        require(totalNodeStakeAfter <= parametersStorage.maximumStake(), "Max stake exceeded");

        // Update staking balances
        stakingStorage.setDelegatorStakeBase(identityId, delegatorKey, newDelegatorStakeBase);
        stakingStorage.setNodeStake(identityId, totalNodeStakeAfter);
        stakingStorage.increaseTotalStake(addedStake);

        _addNodeToShardingTable(identityId, totalNodeStakeAfter);
        askContract.recalculateActiveSet();

        _manageDelegatorStatus(identityId, delegator);

        // Mark reward as processed
        rewardsStorage.markClaimed(identityId, delegator);
    }

    function _getDelegatorKey(address delegator) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(delegator));
    }

    // ─────────────────────────────────────────────────────────────
    // Local replica of internal helpers from Staking.sol
    // ─────────────────────────────────────────────────────────────
    function _validateDelegatorEpochClaims(uint72 identityId, address delegator) internal {
        bytes32 delegatorKey = _getDelegatorKey(delegator);
        uint256 currentEpoch = chronos.getCurrentEpoch();
        uint256 previousEpoch = currentEpoch - 1;

        if (delegatorsInfo.hasEverDelegatedToNode(identityId, delegator)) {
            if (stakingStorage.getDelegatorStakeBase(identityId, delegatorKey) == 0) {
                uint256 lastStakeHeldEpoch = delegatorsInfo.getLastStakeHeldEpoch(identityId, delegator);
                if (lastStakeHeldEpoch > 0 && lastStakeHeldEpoch < currentEpoch) {
                    revert("Claim pending rewards first");
                }
                delegatorsInfo.setLastClaimedEpoch(identityId, delegator, previousEpoch);
            }
        } else {
            delegatorsInfo.setHasEverDelegatedToNode(identityId, delegator, true);
            delegatorsInfo.setLastClaimedEpoch(identityId, delegator, previousEpoch);
        }

        uint256 lastClaimedEpoch = delegatorsInfo.getLastClaimedEpoch(identityId, delegator);
        if (lastClaimedEpoch == previousEpoch) return;
        if (lastClaimedEpoch < previousEpoch - 1) {
            revert("Must claim older epochs");
        }

        uint256 delegatorScore18 = randomSamplingStorage.getEpochNodeDelegatorScore(
            previousEpoch,
            identityId,
            delegatorKey
        );
        uint256 nodeScorePerStake36 = randomSamplingStorage.getNodeEpochScorePerStake(previousEpoch, identityId);
        uint256 delegatorLastSettledScorePerStake36 = randomSamplingStorage
            .getDelegatorLastSettledNodeEpochScorePerStake(previousEpoch, identityId, delegatorKey);

        if (delegatorScore18 == 0 && nodeScorePerStake36 == delegatorLastSettledScorePerStake36) {
            delegatorsInfo.setLastClaimedEpoch(identityId, delegator, previousEpoch);
            return;
        }
        revert("Claim previous epoch rewards first");
    }

    function _prepareForStakeChange(
        uint256 epoch,
        uint72 identityId,
        bytes32 delegatorKey
    ) internal returns (uint256 delegatorEpochScore) {
        uint256 nodeScorePerStake36 = randomSamplingStorage.getNodeEpochScorePerStake(epoch, identityId);
        uint256 currentDelegatorScore18 = randomSamplingStorage.getEpochNodeDelegatorScore(
            epoch,
            identityId,
            delegatorKey
        );
        uint256 delegatorLastSettledNodeEpochScorePerStake36 = randomSamplingStorage
            .getDelegatorLastSettledNodeEpochScorePerStake(epoch, identityId, delegatorKey);

        if (nodeScorePerStake36 == delegatorLastSettledNodeEpochScorePerStake36) {
            return currentDelegatorScore18;
        }

        uint96 stakeBase = stakingStorage.getDelegatorStakeBase(identityId, delegatorKey);
        if (stakeBase == 0) {
            randomSamplingStorage.setDelegatorLastSettledNodeEpochScorePerStake(
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
            randomSamplingStorage.addToEpochNodeDelegatorScore(epoch, identityId, delegatorKey, scoreEarned18);
        }
        randomSamplingStorage.setDelegatorLastSettledNodeEpochScorePerStake(
            epoch,
            identityId,
            delegatorKey,
            nodeScorePerStake36
        );
        return currentDelegatorScore18 + scoreEarned18;
    }

    function _manageDelegatorStatus(uint72 identityId, address delegator) internal {
        if (!delegatorsInfo.isNodeDelegator(identityId, delegator)) {
            delegatorsInfo.addDelegator(identityId, delegator);
        }
        uint256 lastStakeHeldEpoch = delegatorsInfo.getLastStakeHeldEpoch(identityId, delegator);
        if (lastStakeHeldEpoch > 0) {
            delegatorsInfo.setLastStakeHeldEpoch(identityId, delegator, 0);
        }
    }

    function _addNodeToShardingTable(uint72 identityId, uint96 totalNodeStakeAfter) internal {
        if (!shardingTableStorage.nodeExists(identityId)) {
            if (totalNodeStakeAfter >= parametersStorage.minimumStake()) {
                shardingTable.insertNode(identityId);
            }
        }
    }

    // ---------------------------------------------------------------------------------------------
    // INamed & IVersioned
    // ---------------------------------------------------------------------------------------------

    function name() external pure override returns (string memory) {
        return _NAME;
    }

    function version() external pure override returns (string memory) {
        return _VERSION;
    }
}
