// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import {StakingStorage} from "./storage/StakingStorage.sol";
import {V8_1_1_Rewards_Period_Storage} from "./storage/V8_1_1_Rewards_Period_Storage.sol";
import {ShardingTableStorage} from "./storage/ShardingTableStorage.sol";
import {ParametersStorage} from "./storage/ParametersStorage.sol";
import {Ask} from "./Ask.sol";
import {ShardingTable} from "./ShardingTable.sol";
import {DelegatorsInfo} from "./storage/DelegatorsInfo.sol";
import {ContractStatus} from "./abstract/ContractStatus.sol";
import {INamed} from "./interfaces/INamed.sol";
import {IVersioned} from "./interfaces/IVersioned.sol";
import {RandomSamplingStorage} from "./storage/RandomSamplingStorage.sol";
import {Chronos} from "./storage/Chronos.sol";
import {Staking} from "./Staking.sol";
import {ClaimV6Helper} from "./ClaimV6Helper.sol";

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
contract V8_1_1_Rewards_Period is INamed, IVersioned, ContractStatus {
    string private constant _NAME = "V8_1_1_Rewards_Period";
    string private constant _VERSION = "1.0.0";

    V8_1_1_Rewards_Period_Storage public rewardsStorage;
    StakingStorage public stakingStorage;
    ShardingTableStorage public shardingTableStorage;
    ShardingTable public shardingTable;
    ParametersStorage public parametersStorage;
    Ask public askContract;
    DelegatorsInfo public delegatorsInfo;
    RandomSamplingStorage public randomSamplingStorage;
    Chronos public chronos;
    Staking public stakingMain;
    ClaimV6Helper public claimV6Helper;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) ContractStatus(hubAddress) {}

    function initialize() external onlyHub {
        rewardsStorage = V8_1_1_Rewards_Period_Storage(hub.getContractAddress("V8_1_1_Rewards_Period_Storage"));
        stakingStorage = StakingStorage(hub.getContractAddress("StakingStorage"));
        shardingTableStorage = ShardingTableStorage(hub.getContractAddress("ShardingTableStorage"));
        shardingTable = ShardingTable(hub.getContractAddress("ShardingTable"));
        parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));
        askContract = Ask(hub.getContractAddress("Ask"));
        delegatorsInfo = DelegatorsInfo(hub.getContractAddress("DelegatorsInfo"));
        randomSamplingStorage = RandomSamplingStorage(hub.getContractAddress("RandomSamplingStorage"));
        chronos = Chronos(hub.getContractAddress("Chronos"));
        stakingMain = Staking(hub.getContractAddress("Staking"));
        claimV6Helper = ClaimV6Helper(hub.getContractAddress("ClaimV6Helper"));
    }

    /**
     * @notice Claims the pre-calculated reward for the caller and immediately
     *         restakes it for the given node.
     * @param identityId The node identifier the caller is delegating to.
     */
    function claimV8TuningPeriodRewards(uint72 identityId, address delegator) external {
        (uint96 addedStake, bool claimed) = rewardsStorage.getReward(identityId, delegator);
        require(addedStake > 0, "No reward");
        require(!claimed, "Already claimed");

        // Validate epoch claims for V8 and V6 rewards
        stakingMain._validateDelegatorEpochClaims(identityId, delegator);

        bytes32 delegatorKey = keccak256(abi.encodePacked(delegator));
        uint256 currentEpoch = chronos.getCurrentEpoch();

        // Settle pending score changes in both v8 and v6 systems
        stakingMain._prepareForStakeChange(currentEpoch, identityId, delegatorKey);
        claimV6Helper.prepareForStakeChangeV6(currentEpoch, identityId, delegatorKey);

        uint96 currentDelegatorStakeBase = stakingStorage.getDelegatorStakeBase(identityId, delegatorKey);
        uint96 newDelegatorStakeBase = currentDelegatorStakeBase + addedStake;

        uint96 totalNodeStakeBefore = stakingStorage.getNodeStake(identityId);
        uint96 totalNodeStakeAfter = totalNodeStakeBefore + addedStake;

        // Mark reward as processed - avoid reentrancy
        rewardsStorage.markClaimed(identityId, delegator);

        // Update staking balances
        stakingStorage.setDelegatorStakeBase(identityId, delegatorKey, newDelegatorStakeBase);
        stakingStorage.setNodeStake(identityId, totalNodeStakeAfter);
        stakingStorage.increaseTotalStake(addedStake);

        _addNodeToShardingTable(identityId, totalNodeStakeAfter);
        askContract.recalculateActiveSet();

        _manageDelegatorStatus(identityId, delegator);
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
