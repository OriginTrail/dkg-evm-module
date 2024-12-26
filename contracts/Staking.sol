// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {ShardingTable} from "./ShardingTable.sol";
import {Ask} from "./Ask.sol";
import {IdentityStorage} from "./storage/IdentityStorage.sol";
import {ParametersStorage} from "./storage/ParametersStorage.sol";
import {ProfileStorage} from "./storage/ProfileStorage.sol";
import {ShardingTableStorage} from "./storage/ShardingTableStorage.sol";
import {StakingStorage} from "./storage/StakingStorage.sol";
import {ContractStatus} from "./abstract/ContractStatus.sol";
import {IInitializable} from "./interfaces/IInitializable.sol";
import {INamed} from "./interfaces/INamed.sol";
import {IVersioned} from "./interfaces/IVersioned.sol";
import {ProfileLib} from "./libraries/ProfileLib.sol";
import {ShardingTableLib} from "./libraries/ShardingTableLib.sol";
import {StakingLib} from "./libraries/StakingLib.sol";
import {TokenLib} from "./libraries/TokenLib.sol";
import {IdentityLib} from "./libraries/IdentityLib.sol";
import {Permissions} from "./libraries/Permissions.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Staking is INamed, IVersioned, ContractStatus, IInitializable {
    string private constant _NAME = "Staking";
    string private constant _VERSION = "1.0.0";

    Ask public askContract;
    ShardingTableStorage public shardingTableStorage;
    ShardingTable public shardingTableContract;
    IdentityStorage public identityStorage;
    ParametersStorage public parametersStorage;
    ProfileStorage public profileStorage;
    StakingStorage public stakingStorage;
    IERC20 public tokenContract;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) ContractStatus(hubAddress) {}

    modifier onlyAdmin(uint72 identityId) {
        _checkAdmin(identityId);
        _;
    }

    modifier profileExists(uint72 identityId) {
        _checkProfileExists(identityId);
        _;
    }

    function initialize() public onlyHub {
        askContract = Ask(hub.getContractAddress("Ask"));
        shardingTableStorage = ShardingTableStorage(hub.getContractAddress("ShardingTableStorage"));
        shardingTableContract = ShardingTable(hub.getContractAddress("ShardingTable"));
        identityStorage = IdentityStorage(hub.getContractAddress("IdentityStorage"));
        parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));
        profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        stakingStorage = StakingStorage(hub.getContractAddress("StakingStorage"));
        tokenContract = IERC20(hub.getContractAddress("Token"));
    }

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function stake(uint72 identityId, uint96 addedStake) external profileExists(identityId) {
        IERC20 token = tokenContract;
        StakingStorage ss = stakingStorage;

        if (addedStake == 0) {
            revert TokenLib.ZeroTokenAmount();
        }
        if (token.allowance(msg.sender, address(this)) < addedStake) {
            revert TokenLib.TooLowAllowance(address(token), token.allowance(msg.sender, address(this)), addedStake);
        }
        if (token.balanceOf(msg.sender) < addedStake) {
            revert TokenLib.TooLowBalance(address(token), token.balanceOf(msg.sender), addedStake);
        }

        bytes32 delegatorKey = keccak256(abi.encodePacked(msg.sender));
        _updateStakeInfo(identityId, delegatorKey);

        (uint96 delegatorStakeBase, uint96 delegatorStakeIndexed, ) = ss.getDelegatorStakeInfo(
            identityId,
            delegatorKey
        );

        uint96 totalNodeStakeBefore = ss.getNodeStake(identityId);
        uint96 totalNodeStakeAfter = totalNodeStakeBefore + addedStake;
        if (totalNodeStakeAfter > parametersStorage.maximumStake()) {
            revert StakingLib.MaximumStakeExceeded(parametersStorage.maximumStake());
        }

        ss.setDelegatorStakeInfo(identityId, delegatorKey, delegatorStakeBase + addedStake, delegatorStakeIndexed);
        ss.setNodeStake(identityId, totalNodeStakeAfter);
        ss.increaseTotalStake(addedStake);

        _addNodeToShardingTable(identityId, totalNodeStakeAfter);

        askContract.recalculateActiveSet();

        token.transferFrom(msg.sender, address(ss), addedStake);
    }

    function redelegate(
        uint72 fromIdentityId,
        uint72 toIdentityId,
        uint96 stakeAmount
    ) external profileExists(fromIdentityId) profileExists(toIdentityId) {
        StakingStorage ss = stakingStorage;
        Ask ask = askContract;

        if (stakeAmount == 0) {
            revert TokenLib.ZeroTokenAmount();
        }

        bytes32 delegatorKey = keccak256(abi.encodePacked(msg.sender));
        _updateStakeInfo(fromIdentityId, delegatorKey);
        _updateStakeInfo(toIdentityId, delegatorKey);

        (uint96 delegatorStakeBase, uint96 delegatorStakeIndexed, ) = ss.getDelegatorStakeInfo(
            fromIdentityId,
            delegatorKey
        );

        if (stakeAmount > delegatorStakeBase + delegatorStakeIndexed) {
            revert StakingLib.WithdrawalExceedsStake(delegatorStakeBase + delegatorStakeIndexed, stakeAmount);
        }

        if (ss.getNodeStake(toIdentityId) + stakeAmount > parametersStorage.maximumStake()) {
            revert StakingLib.MaximumStakeExceeded(parametersStorage.maximumStake());
        }

        uint96 newDelegatorStakeBase = delegatorStakeBase;
        uint96 newDelegatorStakeIndexed = delegatorStakeIndexed;

        if (stakeAmount > delegatorStakeIndexed) {
            newDelegatorStakeBase = delegatorStakeBase - (stakeAmount - delegatorStakeIndexed);
            newDelegatorStakeIndexed = 0;
        } else {
            newDelegatorStakeIndexed = delegatorStakeIndexed - stakeAmount;
        }

        uint96 totalFromNodeStakeBefore = ss.getNodeStake(fromIdentityId);
        uint96 totalFromNodeStakeAfter = totalFromNodeStakeBefore - stakeAmount;

        uint96 totalToNodeStakeBefore = ss.getNodeStake(toIdentityId);
        uint96 totalToNodeStakeAfter = totalToNodeStakeBefore + stakeAmount;

        ss.setDelegatorStakeInfo(fromIdentityId, delegatorKey, newDelegatorStakeBase, newDelegatorStakeIndexed);
        ss.setNodeStake(fromIdentityId, totalFromNodeStakeAfter);

        _removeNodeFromShardingTable(fromIdentityId, totalFromNodeStakeAfter);

        ask.recalculateActiveSet();

        if (stakeAmount > delegatorStakeIndexed) {
            ss.increaseDelegatorStakeBase(toIdentityId, delegatorKey, (delegatorStakeBase - newDelegatorStakeBase));
        }
        ss.increaseDelegatorStakeRewardIndexed(
            toIdentityId,
            delegatorKey,
            (delegatorStakeIndexed - newDelegatorStakeIndexed)
        );
        ss.setNodeStake(toIdentityId, totalToNodeStakeAfter);

        _addNodeToShardingTable(toIdentityId, totalToNodeStakeAfter);

        ask.recalculateActiveSet();
    }

    function requestWithdrawal(uint72 identityId, uint96 removedStake) external profileExists(identityId) {
        StakingStorage ss = stakingStorage;

        if (removedStake == 0) {
            revert TokenLib.ZeroTokenAmount();
        }

        bytes32 delegatorKey = keccak256(abi.encodePacked(msg.sender));
        _updateStakeInfo(identityId, delegatorKey);

        (uint96 delegatorStakeBase, uint96 delegatorStakeIndexed, ) = ss.getDelegatorStakeInfo(
            identityId,
            delegatorKey
        );

        if (removedStake > delegatorStakeBase + delegatorStakeIndexed) {
            revert StakingLib.WithdrawalExceedsStake(delegatorStakeBase + delegatorStakeIndexed, removedStake);
        }

        uint96 newDelegatorStakeBase = delegatorStakeBase;
        uint96 newDelegatorStakeIndexed = delegatorStakeIndexed;

        if (removedStake > delegatorStakeIndexed) {
            newDelegatorStakeBase = delegatorStakeBase - (removedStake - delegatorStakeIndexed);
            newDelegatorStakeIndexed = 0;
        } else {
            newDelegatorStakeIndexed = delegatorStakeIndexed - removedStake;
        }

        uint96 totalNodeStakeBefore = ss.getNodeStake(identityId);
        uint96 totalNodeStakeAfter = totalNodeStakeBefore - removedStake;

        ss.setDelegatorStakeInfo(identityId, delegatorKey, newDelegatorStakeBase, newDelegatorStakeIndexed);
        ss.setNodeStake(identityId, totalNodeStakeAfter);
        ss.decreaseTotalStake(removedStake);

        _removeNodeFromShardingTable(identityId, totalNodeStakeAfter);

        askContract.recalculateActiveSet();

        if (totalNodeStakeAfter >= parametersStorage.maximumStake()) {
            ss.addDelegatorCumulativePaidOutRewards(
                identityId,
                delegatorKey,
                delegatorStakeIndexed - newDelegatorStakeIndexed
            );
            ss.addNodeCumulativePaidOutRewards(identityId, delegatorStakeIndexed - newDelegatorStakeIndexed);
            ss.transferStake(msg.sender, removedStake);
        } else {
            (uint96 prevDelegatorWithdrawalAmount, uint96 prevDelegatorIndexedOutRewardAmount, ) = ss
                .getDelegatorWithdrawalRequest(identityId, delegatorKey);

            ss.createDelegatorWithdrawalRequest(
                identityId,
                delegatorKey,
                removedStake + prevDelegatorWithdrawalAmount,
                delegatorStakeIndexed - newDelegatorStakeIndexed + prevDelegatorIndexedOutRewardAmount,
                block.timestamp + parametersStorage.stakeWithdrawalDelay()
            );
        }
    }

    function finalizeWithdrawal(uint72 identityId) external profileExists(identityId) {
        StakingStorage ss = stakingStorage;

        bytes32 delegatorKey = keccak256(abi.encodePacked(msg.sender));
        (
            uint96 delegatorWithdrawalAmount,
            uint96 delegatorIndexedOutRewardAmount,
            uint256 delegatorWithdrawalTimestamp
        ) = ss.getDelegatorWithdrawalRequest(identityId, delegatorKey);

        if (delegatorWithdrawalAmount == 0) {
            revert StakingLib.WithdrawalWasntInitiated();
        }
        if (block.timestamp < delegatorWithdrawalTimestamp) {
            revert StakingLib.WithdrawalPeriodPending(block.timestamp, delegatorWithdrawalTimestamp);
        }

        ss.deleteDelegatorWithdrawalRequest(identityId, delegatorKey);
        ss.addDelegatorCumulativePaidOutRewards(identityId, delegatorKey, delegatorIndexedOutRewardAmount);
        ss.addNodeCumulativePaidOutRewards(identityId, delegatorIndexedOutRewardAmount);
        ss.transferStake(msg.sender, delegatorWithdrawalAmount);
    }

    function cancelWithdrawal(uint72 identityId) external profileExists(identityId) {
        StakingStorage ss = stakingStorage;

        bytes32 delegatorKey = keccak256(abi.encodePacked(msg.sender));
        (
            uint96 delegatorWithdrawalAmount,
            uint96 delegatorIndexedOutRewardAmount,
            uint256 delegatorWithdrawalTimestamp
        ) = ss.getDelegatorWithdrawalRequest(identityId, delegatorKey);
        if (delegatorWithdrawalAmount == 0) {
            revert StakingLib.WithdrawalWasntInitiated();
        }

        _updateStakeInfo(identityId, delegatorKey);
        (uint96 delegatorStakeBase, uint96 delegatorStakeIndexed, ) = ss.getDelegatorStakeInfo(
            identityId,
            delegatorKey
        );

        uint96 returnableStakeAmount;
        uint96 returnableIndexedOutReward;
        uint96 totalNodeStakeBefore = ss.getNodeStake(identityId);
        uint96 maximumStake = parametersStorage.maximumStake();
        if (totalNodeStakeBefore + delegatorWithdrawalAmount > maximumStake) {
            returnableStakeAmount = maximumStake - totalNodeStakeBefore;
            returnableIndexedOutReward = returnableStakeAmount < delegatorIndexedOutRewardAmount
                ? delegatorIndexedOutRewardAmount - returnableStakeAmount
                : delegatorIndexedOutRewardAmount;

            ss.createDelegatorWithdrawalRequest(
                identityId,
                delegatorKey,
                delegatorWithdrawalAmount - returnableStakeAmount,
                delegatorIndexedOutRewardAmount - returnableIndexedOutReward,
                delegatorWithdrawalTimestamp
            );
        } else {
            returnableStakeAmount = delegatorWithdrawalAmount;
            returnableIndexedOutReward = delegatorIndexedOutRewardAmount;
            ss.deleteDelegatorWithdrawalRequest(identityId, delegatorKey);
        }

        uint96 totalNodeStakeAfter = totalNodeStakeBefore + returnableStakeAmount;

        ss.setDelegatorStakeInfo(
            identityId,
            delegatorKey,
            delegatorStakeBase + returnableStakeAmount,
            delegatorStakeIndexed + returnableIndexedOutReward
        );
        ss.setNodeStake(identityId, totalNodeStakeAfter);
        ss.increaseTotalStake(delegatorWithdrawalAmount);

        _addNodeToShardingTable(identityId, totalNodeStakeAfter);

        askContract.recalculateActiveSet();
    }

    function distributeRewards(
        uint72 identityId,
        uint96 rewardAmount
    ) external onlyContracts profileExists(identityId) {
        StakingStorage ss = stakingStorage;

        if (rewardAmount == 0) {
            revert TokenLib.ZeroTokenAmount();
        }

        ProfileLib.OperatorFee memory operatorFee = profileStorage.getActiveOperatorFee(identityId);

        uint96 delegatorsReward = rewardAmount;
        if (operatorFee.feePercentage != 0) {
            uint96 operatorFeeAmount = uint96((uint256(rewardAmount) * operatorFee.feePercentage) / 10000);
            delegatorsReward -= operatorFeeAmount;

            ss.increaseOperatorFeeBalance(identityId, operatorFeeAmount);
            ss.addOperatorFeeCumulativeEarnedRewards(identityId, operatorFeeAmount);
        }

        if (delegatorsReward == 0) {
            return;
        }

        uint96 totalNodeStakeBefore = ss.getNodeStake(identityId);
        uint96 totalNodeStakeAfter = totalNodeStakeBefore + delegatorsReward;

        uint256 nodeRewardIndex = ss.getNodeRewardIndex(identityId);
        uint256 nodeRewardIndexIncrement = (uint256(delegatorsReward) * 1e18) / totalNodeStakeBefore;

        ss.setNodeRewardIndex(identityId, nodeRewardIndex + nodeRewardIndexIncrement);
        ss.setNodeStake(identityId, totalNodeStakeAfter);
        ss.addNodeCumulativeEarnedRewards(identityId, delegatorsReward);
        ss.increaseTotalStake(delegatorsReward);

        _addNodeToShardingTable(identityId, totalNodeStakeAfter);

        askContract.recalculateActiveSet();
    }

    function restakeOperatorFee(uint72 identityId, uint96 addedStake) external onlyAdmin(identityId) {
        StakingStorage ss = stakingStorage;

        if (addedStake == 0) {
            revert TokenLib.ZeroTokenAmount();
        }

        uint96 oldOperatorFeeBalance = ss.getOperatorFeeBalance(identityId);
        if (addedStake > oldOperatorFeeBalance) {
            revert StakingLib.AmountExceedsOperatorFeeBalance(oldOperatorFeeBalance, addedStake);
        }

        uint96 newOperatorFeeBalance = oldOperatorFeeBalance - addedStake;
        ss.setOperatorFeeBalance(identityId, newOperatorFeeBalance);

        bytes32 operatorKey = keccak256(abi.encodePacked(msg.sender));
        _updateStakeInfo(identityId, operatorKey);

        (uint96 delegatorStakeBase, uint96 delegatorStakeIndexed, ) = ss.getDelegatorStakeInfo(identityId, operatorKey);

        uint96 totalNodeStakeBefore = ss.getNodeStake(identityId);
        uint96 totalNodeStakeAfter = totalNodeStakeBefore + addedStake;

        if (totalNodeStakeAfter > parametersStorage.maximumStake()) {
            revert StakingLib.MaximumStakeExceeded(parametersStorage.maximumStake());
        }

        ss.setDelegatorStakeInfo(identityId, operatorKey, delegatorStakeBase + addedStake, delegatorStakeIndexed);
        ss.setNodeStake(identityId, totalNodeStakeAfter);
        ss.addOperatorFeeCumulativePaidOutRewards(identityId, addedStake);
        ss.increaseTotalStake(addedStake);

        _addNodeToShardingTable(identityId, totalNodeStakeAfter);

        askContract.recalculateActiveSet();
    }

    function requestOperatorFeeWithdrawal(uint72 identityId, uint96 withdrawalAmount) external onlyAdmin(identityId) {
        StakingStorage ss = stakingStorage;

        if (withdrawalAmount == 0) {
            revert TokenLib.ZeroTokenAmount();
        }

        uint96 oldOperatorFeeBalance = ss.getOperatorFeeBalance(identityId);
        if (withdrawalAmount > oldOperatorFeeBalance) {
            revert StakingLib.AmountExceedsOperatorFeeBalance(oldOperatorFeeBalance, withdrawalAmount);
        }

        uint256 releaseTime = block.timestamp + parametersStorage.stakeWithdrawalDelay();

        ss.setOperatorFeeBalance(identityId, oldOperatorFeeBalance - withdrawalAmount);
        ss.createOperatorFeeWithdrawalRequest(identityId, withdrawalAmount, withdrawalAmount, releaseTime);
    }

    function finalizeOperatorFeeWithdrawal(uint72 identityId) external onlyAdmin(identityId) {
        StakingStorage ss = stakingStorage;

        (uint96 operatorFeeWithdrawalAmount, uint96 operatorFeeIndexedOutAmount, uint256 timestamp) = ss
            .getOperatorFeeWithdrawalRequest(identityId);
        if (operatorFeeWithdrawalAmount == 0) {
            revert StakingLib.WithdrawalWasntInitiated();
        }
        if (block.timestamp < timestamp) {
            revert StakingLib.WithdrawalPeriodPending(block.timestamp, timestamp);
        }

        ss.deleteOperatorFeeWithdrawalRequest(identityId);
        ss.addOperatorFeeCumulativePaidOutRewards(identityId, operatorFeeIndexedOutAmount);
        ss.transferStake(msg.sender, operatorFeeWithdrawalAmount);
    }

    function cancelOperatorFeeWithdrawal(uint72 identityId) external onlyAdmin(identityId) {
        StakingStorage ss = stakingStorage;

        uint96 operatorFeeWithdrawalAmount = ss.getOperatorFeeWithdrawalRequestAmount(identityId);
        if (operatorFeeWithdrawalAmount == 0) {
            revert StakingLib.WithdrawalWasntInitiated();
        }

        ss.deleteOperatorFeeWithdrawalRequest(identityId);
        ss.increaseOperatorFeeBalance(identityId, operatorFeeWithdrawalAmount);
    }

    function getOperatorStats(uint72 identityId) external view returns (uint96, uint96, uint96) {
        StakingStorage ss = stakingStorage;

        bytes32[] memory adminKeys = identityStorage.getKeysByPurpose(identityId, IdentityLib.ADMIN_KEY);

        uint96 totalSimBase;
        uint96 totalSimIndexed;
        uint96 totalSimUnrealized;
        uint96 totalEarned;
        uint96 totalPaidOut;
        for (uint256 i; i < adminKeys.length; i++) {
            (uint96 simBase, uint96 simIndexed, uint96 simUnrealized) = simulateStakeInfoUpdate(
                identityId,
                adminKeys[i]
            );

            (uint96 operatorEarned, uint96 operatorPaidOut) = ss.getDelegatorRewardsInfo(identityId, adminKeys[i]);

            totalSimBase += simBase;
            totalSimIndexed += simIndexed;
            totalSimUnrealized += simUnrealized;
            totalEarned += operatorEarned;
            totalPaidOut += operatorPaidOut;
        }

        return (totalSimBase + totalSimIndexed, totalEarned + totalSimUnrealized - totalPaidOut, totalPaidOut);
    }

    function getNodeStats(uint72 identityId) external view returns (uint96, uint96, uint96) {
        return stakingStorage.getNodeRewardsInfo(identityId);
    }

    function getOperatorFeeStats(uint72 identityId) external view returns (uint96, uint96, uint96) {
        return stakingStorage.getNodeOperatorFeesInfo(identityId);
    }

    function getDelegatorStats(uint72 identityId, address delegator) external view returns (uint96, uint96, uint96) {
        bytes32 delegatorKey = keccak256(abi.encodePacked(delegator));
        (uint96 simBase, uint96 simIndexed, uint96 simUnrealized) = simulateStakeInfoUpdate(identityId, delegatorKey);

        (uint96 delegatorEarned, uint96 delegatorPaidOut) = stakingStorage.getDelegatorRewardsInfo(
            identityId,
            delegatorKey
        );

        return (simBase + simIndexed, delegatorEarned + simUnrealized - delegatorPaidOut, delegatorPaidOut);
    }

    function simulateStakeInfoUpdate(
        uint72 identityId,
        bytes32 delegatorKey
    ) public view returns (uint96, uint96, uint96) {
        uint256 nodeRewardIndex = stakingStorage.getNodeRewardIndex(identityId);

        (uint96 delegatorStakeBase, uint96 delegatorStakeIndexed, uint256 delegatorLastRewardIndex) = stakingStorage
            .getDelegatorStakeInfo(identityId, delegatorKey);

        if (nodeRewardIndex <= delegatorLastRewardIndex) {
            return (delegatorStakeBase, delegatorStakeIndexed, 0);
        }

        uint256 diff = nodeRewardIndex - delegatorLastRewardIndex;
        uint256 currentStake = uint256(delegatorStakeBase) + uint256(delegatorStakeIndexed);
        uint96 additionalReward = uint96((currentStake * diff) / 1e18);

        return (delegatorStakeBase, delegatorStakeIndexed + additionalReward, additionalReward);
    }

    function _updateStakeInfo(uint72 identityId, bytes32 delegatorKey) internal {
        StakingStorage ss = stakingStorage;

        (uint96 delegatorStakeBase, uint96 delegatorStakeIndexed, uint256 delegatorLastRewardIndex) = ss
            .getDelegatorStakeInfo(identityId, delegatorKey);
        uint256 nodeRewardIndex = ss.getNodeRewardIndex(identityId);

        if (nodeRewardIndex > delegatorLastRewardIndex) {
            uint256 currentStake = uint256(delegatorStakeBase) + uint256(delegatorStakeIndexed);
            if (currentStake == 0) {
                ss.setDelegatorLastRewardIndex(identityId, delegatorKey, nodeRewardIndex);
            } else {
                uint256 diff = nodeRewardIndex - delegatorLastRewardIndex;
                uint96 additional = uint96((currentStake * diff) / 1e18);
                delegatorStakeIndexed += additional;

                ss.setDelegatorStakeInfo(identityId, delegatorKey, delegatorStakeBase, delegatorStakeIndexed);
                ss.setDelegatorLastRewardIndex(identityId, delegatorKey, nodeRewardIndex);

                ss.addDelegatorCumulativeEarnedRewards(identityId, delegatorKey, additional);
            }
        }
    }

    function _addNodeToShardingTable(uint72 identityId, uint96 newStake) internal {
        ShardingTableStorage sts = shardingTableStorage;
        ParametersStorage params = parametersStorage;

        if (!sts.nodeExists(identityId) && newStake >= params.minimumStake()) {
            if (sts.nodesCount() >= params.shardingTableSizeLimit()) {
                revert ShardingTableLib.ShardingTableIsFull();
            }
            shardingTableContract.insertNode(identityId);
        }
    }

    function _removeNodeFromShardingTable(uint72 identityId, uint96 newStake) internal {
        if (shardingTableStorage.nodeExists(identityId) && newStake < parametersStorage.minimumStake()) {
            shardingTableContract.removeNode(identityId);
        }
    }

    function _checkAdmin(uint72 identityId) internal view virtual {
        if (
            !identityStorage.keyHasPurpose(identityId, keccak256(abi.encodePacked(msg.sender)), IdentityLib.ADMIN_KEY)
        ) {
            revert Permissions.OnlyProfileAdminFunction(msg.sender);
        }
    }

    function _checkProfileExists(uint72 identityId) internal view virtual {
        if (!profileStorage.profileExists(identityId)) {
            revert ProfileLib.ProfileDoesntExist(identityId);
        }
    }
}
