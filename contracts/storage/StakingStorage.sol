// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {Guardian} from "../Guardian.sol";
import {StakingLib} from "../libraries/StakingLib.sol";
import {INamed} from "../interfaces/INamed.sol";
import {IVersioned} from "../interfaces/IVersioned.sol";

contract StakingStorage is INamed, IVersioned, Guardian {
    string private constant _NAME = "StakingStorage";
    string private constant _VERSION = "1.0.0";

    uint96 private _totalStake;

    mapping(uint72 => StakingLib.NodeData) public nodes;
    mapping(uint72 => mapping(bytes32 => StakingLib.DelegatorData)) public delegators;
    mapping(uint72 => mapping(bytes32 => StakingLib.StakeWithdrawalRequest)) public withdrawals;
    mapping(uint72 => StakingLib.OperatorFeeWithdrawalRequest) public operatorFeeWithdrawals;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) Guardian(hubAddress) {}

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    // -----------------------------------------------------------------------------------------------------------------
    // Global Stake Operations
    // -----------------------------------------------------------------------------------------------------------------

    function getTotalStake() external view returns (uint96) {
        return _totalStake;
    }

    function setTotalStake(uint96 newTotalStake) external onlyContracts {
        _totalStake = newTotalStake;
    }

    function increaseTotalStake(uint96 addedStake) external onlyContracts {
        _totalStake += addedStake;
    }

    function decreaseTotalStake(uint96 removedStake) external onlyContracts {
        _totalStake -= removedStake;
    }

    // -----------------------------------------------------------------------------------------------------------------
    // Nodes Staking Data Operations
    // -----------------------------------------------------------------------------------------------------------------

    function setNodeStakeInfo(uint72 identityId, uint96 stake, uint256 rewardIndex) external onlyContracts {
        StakingLib.NodeData storage node = nodes[identityId];

        node.stake = stake;
        node.rewardIndex = rewardIndex;
    }

    function getNodeData(uint72 identityId) external view returns (uint96, uint256, uint96, uint96, uint96) {
        StakingLib.NodeData memory node = nodes[identityId];
        return (
            node.stake,
            node.rewardIndex,
            node.operatorFeeBalance,
            node.operatorFeeCumulativeEarnedRewards,
            node.operatorFeeCumulativePaidOutRewards
        );
    }

    function getNodeStakeInfo(uint72 identityId) external view returns (uint96, uint256) {
        StakingLib.NodeData memory node = nodes[identityId];
        return (node.stake, node.rewardIndex);
    }

    function getNodeOperatorFeesInfo(uint72 identityId) external view returns (uint96, uint96, uint96) {
        StakingLib.NodeData memory node = nodes[identityId];
        return (
            node.operatorFeeBalance,
            node.operatorFeeCumulativeEarnedRewards,
            node.operatorFeeCumulativePaidOutRewards
        );
    }

    function setNodeStake(uint72 identityId, uint96 newNodeStake) external onlyContracts {
        nodes[identityId].stake = newNodeStake;
    }

    function getNodeStake(uint72 identityId) external view returns (uint96) {
        return nodes[identityId].stake;
    }

    function setNodeRewardIndex(uint72 identityId, uint256 newIndex) external onlyContracts {
        nodes[identityId].rewardIndex = newIndex;
    }

    function getNodeRewardIndex(uint72 identityId) external view returns (uint256) {
        return nodes[identityId].rewardIndex;
    }

    function setOperatorFeeBalance(uint72 identityId, uint96 newBalance) external onlyContracts {
        nodes[identityId].operatorFeeBalance = newBalance;
    }

    function increaseOperatorFeeBalance(uint72 identityId, uint96 addedFee) external onlyContracts {
        nodes[identityId].operatorFeeBalance += addedFee;
    }

    function decreaseOperatorFeeBalance(uint72 identityId, uint96 removedFee) external onlyContracts {
        nodes[identityId].operatorFeeBalance -= removedFee;
    }

    function getOperatorFeeBalance(uint72 identityId) external view returns (uint96) {
        return nodes[identityId].operatorFeeBalance;
    }

    function addOperatorFeeCumulativeEarnedRewards(uint72 identityId, uint96 amount) external onlyContracts {
        nodes[identityId].operatorFeeCumulativeEarnedRewards += amount;
    }

    function getOperatorFeeCumulativeEarnedRewards(uint72 identityId) external view returns (uint96) {
        return nodes[identityId].operatorFeeCumulativeEarnedRewards;
    }

    function addOperatorFeeCumulativePaidOutRewards(uint72 identityId, uint96 amount) external onlyContracts {
        nodes[identityId].operatorFeeCumulativePaidOutRewards += amount;
    }

    function getOperatorFeeCumulativePaidOutRewards(uint72 identityId) external view returns (uint96) {
        return nodes[identityId].operatorFeeCumulativePaidOutRewards;
    }

    // -----------------------------------------------------------------------------------------------------------------
    // Delegators Stake Data Operations
    // -----------------------------------------------------------------------------------------------------------------

    function setDelegatorStakeInfo(
        uint72 identityId,
        bytes32 delegatorKey,
        uint96 stakeBase,
        uint96 stakeRewardIndexed
    ) external onlyContracts {
        StakingLib.DelegatorData storage delegator = delegators[identityId][delegatorKey];

        delegator.stakeBase = stakeBase;
        delegator.stakeRewardIndexed = stakeRewardIndexed;
    }

    function getDelegatorData(
        uint72 identityId,
        bytes32 delegatorKey
    ) external view returns (uint96, uint96, uint256, uint96, uint96) {
        StakingLib.DelegatorData memory delegator = delegators[identityId][delegatorKey];
        return (
            delegator.stakeBase,
            delegator.stakeRewardIndexed,
            delegator.lastRewardIndex,
            delegator.cumulativeEarnedRewards,
            delegator.cumulativePaidOutRewards
        );
    }

    function getDelegatorStakeInfo(
        uint72 identityId,
        bytes32 delegatorKey
    ) external view returns (uint96, uint96, uint256) {
        StakingLib.DelegatorData memory delegator = delegators[identityId][delegatorKey];
        return (delegator.stakeBase, delegator.stakeRewardIndexed, delegator.lastRewardIndex);
    }

    function getDelegatorRewardsInfo(uint72 identityId, bytes32 delegatorKey) external view returns (uint96, uint96) {
        StakingLib.DelegatorData memory delegator = delegators[identityId][delegatorKey];
        return (delegator.cumulativeEarnedRewards, delegator.cumulativePaidOutRewards);
    }

    function setDelegatorStakeBase(uint72 identityId, bytes32 delegatorKey, uint96 stakeBase) external onlyContracts {
        delegators[identityId][delegatorKey].stakeBase = stakeBase;
    }

    function getDelegatorStakeBase(uint72 identityId, bytes32 delegatorKey) external view returns (uint96) {
        return delegators[identityId][delegatorKey].stakeBase;
    }

    function setDelegatorStakeRewardIndexed(
        uint72 identityId,
        bytes32 delegatorKey,
        uint96 stakeRewardIndexed
    ) external onlyContracts {
        delegators[identityId][delegatorKey].stakeRewardIndexed = stakeRewardIndexed;
    }

    function getDelegatorStakeRewardIndexed(uint72 identityId, bytes32 delegatorKey) external view returns (uint96) {
        return delegators[identityId][delegatorKey].stakeRewardIndexed;
    }

    function setDelegatorLastRewardIndex(
        uint72 identityId,
        bytes32 delegatorKey,
        uint256 lastRewardIndex
    ) external onlyContracts {
        delegators[identityId][delegatorKey].lastRewardIndex = lastRewardIndex;
    }

    function getDelegatorLastRewardIndex(uint72 identityId, bytes32 delegatorKey) external view returns (uint256) {
        return delegators[identityId][delegatorKey].lastRewardIndex;
    }

    function addDelegatorCumulativeEarnedRewards(
        uint72 identityId,
        bytes32 delegatorKey,
        uint96 amount
    ) external onlyContracts {
        delegators[identityId][delegatorKey].cumulativeEarnedRewards += amount;
    }

    function getDelegatorCumulativeEarnedRewards(
        uint72 identityId,
        bytes32 delegatorKey
    ) external view returns (uint96) {
        return delegators[identityId][delegatorKey].cumulativeEarnedRewards;
    }

    function addDelegatorCumulativePaidOutRewards(
        uint72 identityId,
        bytes32 delegatorKey,
        uint96 amount
    ) external onlyContracts {
        delegators[identityId][delegatorKey].cumulativePaidOutRewards += amount;
    }

    function getDelegatorCumulativePaidOutRewards(
        uint72 identityId,
        bytes32 delegatorKey
    ) external view returns (uint96) {
        return delegators[identityId][delegatorKey].cumulativePaidOutRewards;
    }

    // -----------------------------------------------------------------------------------------------------------------
    // Delegators Stake Withdrawals Operations
    // -----------------------------------------------------------------------------------------------------------------

    function createDelegatorWithdrawalRequest(
        uint72 identityId,
        bytes32 delegatorKey,
        uint96 amount,
        uint96 indexedOutAmount,
        uint256 timestamp
    ) external onlyContracts {
        withdrawals[identityId][delegatorKey] = StakingLib.StakeWithdrawalRequest(amount, indexedOutAmount, timestamp);
    }

    function getDelegatorWithdrawalRequest(
        uint72 identityId,
        bytes32 delegatorKey
    ) external view returns (uint96, uint96, uint256) {
        StakingLib.StakeWithdrawalRequest memory wr = withdrawals[identityId][delegatorKey];
        return (wr.amount, wr.indexedOutAmount, wr.timestamp);
    }

    function deleteDelegatorWithdrawalRequest(uint72 identityId, bytes32 delegatorKey) external onlyContracts {
        delete withdrawals[identityId][delegatorKey];
    }

    function getDelegatorWithdrawalRequestAmount(
        uint72 identityId,
        bytes32 delegatorKey
    ) external view returns (uint96) {
        return withdrawals[identityId][delegatorKey].amount;
    }

    function getDelegatorWithdrawalRequestIndexedOutAmount(
        uint72 identityId,
        bytes32 delegatorKey
    ) external view returns (uint96) {
        return withdrawals[identityId][delegatorKey].indexedOutAmount;
    }

    function getDelegatorWithdrawalRequestTimestamp(
        uint72 identityId,
        bytes32 delegatorKey
    ) external view returns (uint256) {
        return withdrawals[identityId][delegatorKey].timestamp;
    }

    function delegatorWithdrawalRequestExists(uint72 identityId, bytes32 delegatorKey) external view returns (bool) {
        return withdrawals[identityId][delegatorKey].amount != 0;
    }

    // -----------------------------------------------------------------------------------------------------------------
    // Node Operators Stake Withdrawals Operations
    // -----------------------------------------------------------------------------------------------------------------

    function createOperatorFeeWithdrawalRequest(
        uint72 identityId,
        uint96 amount,
        uint256 timestamp
    ) external onlyContracts {
        operatorFeeWithdrawals[identityId] = StakingLib.OperatorFeeWithdrawalRequest(amount, timestamp);
    }

    function deleteOperatorFeeWithdrawalRequest(uint72 identityId) external onlyContracts {
        delete operatorFeeWithdrawals[identityId];
    }

    function getOperatorFeeWithdrawalRequest(uint72 identityId) external view returns (uint96, uint256) {
        StakingLib.OperatorFeeWithdrawalRequest memory wr = operatorFeeWithdrawals[identityId];
        return (wr.amount, wr.timestamp);
    }

    function getOperatorFeeWithdrawalRequestAmount(uint72 identityId) external view returns (uint96) {
        return operatorFeeWithdrawals[identityId].amount;
    }

    function getOperatorFeeWithdrawalRequestTimestamp(uint72 identityId) external view returns (uint256) {
        return operatorFeeWithdrawals[identityId].timestamp;
    }

    function operatorFeeWithdrawalRequestExists(uint72 identityId) external view returns (bool) {
        return operatorFeeWithdrawals[identityId].amount != 0;
    }

    // -----------------------------------------------------------------------------------------------------------------
    // Token Related Operations
    // -----------------------------------------------------------------------------------------------------------------

    function transferStake(address receiver, uint96 stakeAmount) external onlyContracts {
        tokenContract.transfer(receiver, stakeAmount);
    }
}
