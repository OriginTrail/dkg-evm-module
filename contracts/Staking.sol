// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {ShardingTable} from "./ShardingTable.sol";
import {Shares} from "./Shares.sol";
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

    function stake(uint72 identityId, uint96 amount) external profileExists(identityId) {
        IERC20 token = tokenContract;
        StakingStorage ss = stakingStorage;
        ParametersStorage params = parametersStorage;

        if (amount == 0) {
            revert TokenLib.ZeroTokenAmount();
        }
        if (token.allowance(msg.sender, address(this)) < amount) {
            revert TokenLib.TooLowAllowance(address(token), token.allowance(msg.sender, address(this)), amount);
        }

        bytes32 delegatorKey = keccak256(abi.encodePacked(msg.sender));
        _updateStakeInfo(identityId, delegatorKey);

        (uint96 stakeBase, uint96 stakeIndexed, ) = ss.getDelegatorStakeInfo(identityId, delegatorKey);
        uint96 totalBefore = ss.getNodeStake(identityId);
        uint96 totalAfter = totalBefore + amount;
        if (totalAfter > params.maximumStake()) {
            revert IdentityLib.MaximumStakeExceeded(params.maximumStake());
        }

        ss.setDelegatorStakeInfo(identityId, delegatorKey, stakeBase + amount, stakeIndexed);
        ss.setNodeStake(identityId, totalAfter);
        ss.increaseTotalStake(amount);

        _addNodeToShardingTable(identityId, totalAfter);

        token.transferFrom(msg.sender, address(ss), amount);
    }

    function requestWithdrawal(uint72 identityId, uint96 amount) external profileExists(identityId) {
        StakingStorage ss = stakingStorage;

        if (amount == 0) {
            revert TokenLib.ZeroTokenAmount();
        }

        bytes32 delegatorKey = keccak256(abi.encodePacked(msg.sender));
        _updateStakeInfo(identityId, delegatorKey);

        (uint96 stakeBase, uint96 stakeIndexed, ) = ss.getDelegatorStakeInfo(identityId, delegatorKey);
        uint96 currentStake = stakeBase + stakeIndexed;
        if (amount > currentStake) {
            revert StakingLib.WithdrawalExceedsStake(currentStake, amount);
        }

        uint96 newBase = stakeBase;
        uint96 newIndexed = stakeIndexed;

        if (amount > stakeIndexed) {
            newBase = stakeBase - (amount - stakeIndexed);
            newIndexed = 0;
        } else {
            newIndexed = stakeIndexed - amount;
        }

        uint96 totalBefore = ss.getNodeStake(identityId);
        uint96 totalAfter = totalBefore - amount;

        ss.setDelegatorStakeInfo(identityId, delegatorKey, newBase, newIndexed);
        ss.setNodeStake(identityId, totalAfter);
        ss.decreaseTotalStake(amount);

        _removeNodeFromShardingTable(identityId, totalAfter);

        if (totalAfter >= parametersStorage.maximumStake()) {
            ss.transferStake(msg.sender, amount);
        } else {
            ss.createDelegatorWithdrawalRequest(
                identityId,
                delegatorKey,
                amount,
                stakeIndexed - newIndexed,
                block.timestamp + parametersStorage.stakeWithdrawalDelay()
            );
        }
    }

    function finalizeWithdrawal(uint72 identityId) external profileExists(identityId) {
        StakingStorage ss = stakingStorage;

        bytes32 delegatorKey = keccak256(abi.encodePacked(msg.sender));
        (uint96 amount, uint96 indexedOutAmount, uint256 timestamp) = ss.getDelegatorWithdrawalRequest(
            identityId,
            delegatorKey
        );

        if (amount == 0) {
            revert IdentityLib.WithdrawalWasntInitiated();
        }
        if (block.timestamp < timestamp) {
            revert IdentityLib.WithdrawalPeriodPending(block.timestamp, timestamp);
        }

        ss.deleteDelegatorWithdrawalRequest(identityId, delegatorKey);
        ss.addDelegatorCumulativePaidOutRewards(identityId, delegatorKey, indexedOutAmount);
        ss.transferStake(msg.sender, amount);
    }

    function cancelWithdrawal(uint72 identityId) external profileExists(identityId) {
        StakingStorage ss = stakingStorage;

        bytes32 delegatorKey = keccak256(abi.encodePacked(msg.sender));
        uint96 amount = ss.getDelegatorWithdrawalRequestAmount(identityId, delegatorKey);
        if (amount == 0) {
            revert IdentityLib.WithdrawalWasntInitiated();
        }

        _updateStakeInfo(identityId, delegatorKey);
        (uint96 stakeBase, uint96 stakeIndexed, ) = ss.getDelegatorStakeInfo(identityId, delegatorKey);

        uint96 totalBefore = ss.getNodeStake(identityId);
        uint96 totalAfter = totalBefore + amount;

        ss.deleteDelegatorWithdrawalRequest(identityId, delegatorKey);
        ss.setDelegatorStakeInfo(identityId, delegatorKey, stakeBase + amount, stakeIndexed);
        ss.setNodeStake(identityId, totalAfter);
        ss.increaseTotalStake(amount);

        _addNodeToShardingTable(identityId, totalAfter);
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
            uint96 operatorFeeAmount = uint96((uint256(rewardAmount) * operatorFee.feePercentage) / 100);
            delegatorsReward -= operatorFeeAmount;

            ss.increaseOperatorFeeBalance(identityId, operatorFeeAmount);
            ss.addOperatorFeeCumulativeEarnedRewards(identityId, operatorFeeAmount);
        }

        if (delegatorsReward == 0) {
            return;
        }

        uint96 totalBefore = ss.getNodeStake(identityId);
        uint96 totalAfter = totalBefore + delegatorsReward;

        uint256 nodeIndex = ss.getNodeRewardIndex(identityId);
        uint256 increment = (uint256(delegatorsReward) * 1e18) / totalBefore;

        ss.setNodeRewardIndex(identityId, nodeIndex + increment);
        ss.setNodeStake(identityId, totalAfter);
        ss.increaseTotalStake(delegatorsReward);

        _addNodeToShardingTable(identityId, totalAfter);
    }

    function restakeOperatorFee(uint72 identityId, uint96 amount) external onlyAdmin(identityId) {
        StakingStorage ss = stakingStorage;

        if (amount == 0) {
            revert TokenLib.ZeroTokenAmount();
        }

        uint96 oldBalance = ss.getOperatorFeeBalance(identityId);
        if (amount > oldBalance) {
            revert StakingLib.AmountExceedsOperatorFeeBalance(oldBalance, amount);
        }

        uint96 newBalance = oldBalance - amount;
        ss.setOperatorFeeBalance(identityId, newBalance);

        bytes32 operatorKey = keccak256(abi.encodePacked(msg.sender));
        _updateStakeInfo(identityId, operatorKey);

        (uint96 stakeBase, uint96 stakeIndexed, ) = ss.getDelegatorStakeInfo(identityId, operatorKey);
        uint96 totalBefore = ss.getNodeStake(identityId);
        uint96 totalAfter = totalBefore + amount;

        if (totalAfter > parametersStorage.maximumStake()) {
            revert IdentityLib.MaximumStakeExceeded(parametersStorage.maximumStake());
        }

        ss.setDelegatorStakeInfo(identityId, operatorKey, stakeBase + amount, stakeIndexed);
        ss.setNodeStake(identityId, totalAfter);
        ss.addOperatorFeeCumulativePaidOutRewards(identityId, amount);
        ss.increaseTotalStake(amount);

        _addNodeToShardingTable(identityId, totalAfter);
    }

    function requestOperatorFeeWithdrawal(uint72 identityId, uint96 amount) external onlyAdmin(identityId) {
        StakingStorage ss = stakingStorage;

        if (amount == 0) {
            revert TokenLib.ZeroTokenAmount();
        }

        uint96 oldBalance = ss.getOperatorFeeBalance(identityId);
        if (amount > oldBalance) {
            revert StakingLib.AmountExceedsOperatorFeeBalance(oldBalance, amount);
        }

        uint96 newBalance = oldBalance - amount;
        ss.setOperatorFeeBalance(identityId, newBalance);

        uint256 releaseTime = block.timestamp + parametersStorage.stakeWithdrawalDelay();
        ss.createOperatorFeeWithdrawalRequest(identityId, amount, releaseTime);
    }

    function finalizeOperatorFeeWithdrawal(uint72 identityId) external onlyAdmin(identityId) {
        StakingStorage ss = stakingStorage;

        (uint96 amount, uint256 timestamp) = ss.getOperatorFeeWithdrawalRequest(identityId);
        if (amount == 0) {
            revert IdentityLib.WithdrawalWasntInitiated();
        }
        if (block.timestamp < timestamp) {
            revert IdentityLib.WithdrawalPeriodPending(block.timestamp, timestamp);
        }

        ss.deleteOperatorFeeWithdrawalRequest(identityId);
        ss.addOperatorFeeCumulativePaidOutRewards(identityId, amount);
        ss.transferStake(msg.sender, amount);
    }

    function simulateStakeInfoUpdate(
        uint72 identityId,
        bytes32 delegatorKey
    ) public view returns (uint96, uint96, uint96) {
        uint256 nodeIndex = stakingStorage.getNodeRewardIndex(identityId);

        (uint96 currentBase, uint96 currentIndexed, uint256 stakerLastIndex) = stakingStorage.getDelegatorStakeInfo(
            identityId,
            delegatorKey
        );

        if (nodeIndex <= stakerLastIndex) {
            return (currentBase, currentIndexed, 0);
        }

        uint256 diff = nodeIndex - stakerLastIndex;
        uint256 currentStake = uint256(currentBase) + uint256(currentIndexed);
        uint96 additional = uint96((currentStake * diff) / 1e18);

        return (currentBase, currentIndexed + additional, additional);
    }

    function getOperatorStats(uint72 identityId) external view returns (uint96, uint96, uint96) {
        StakingStorage ss = stakingStorage;

        bytes32[] memory adminKeys = identityStorage.getKeysByPurpose(identityId, IdentityLib.ADMIN_KEY);

        uint96 totalSimBase;
        uint96 totalSimIndexed;
        uint96 totalUnrealized;
        uint96 totalEarned;
        uint96 totalPaidOut;
        for (uint256 i; i < adminKeys.length; i++) {
            (uint96 simBase, uint96 simIndexed, uint96 unrealized) = simulateStakeInfoUpdate(identityId, adminKeys[i]);

            (uint96 operatorEarned, uint96 operatorPaidOut) = ss.getDelegatorRewardsInfo(identityId, adminKeys[i]);

            totalSimBase += simBase;
            totalSimIndexed += simIndexed;
            totalUnrealized += unrealized;
            totalEarned += operatorEarned;
            totalPaidOut += operatorPaidOut;
        }

        return (totalSimBase + totalSimIndexed, totalEarned - totalPaidOut, totalUnrealized);
    }

    function getOperatorFeeStats(uint72 identityId) external view returns (uint96, uint96, uint96) {
        return stakingStorage.getNodeOperatorFeesInfo(identityId);
    }

    function getDelegatorStats(uint72 identityId, address delegator) external view returns (uint96, uint96, uint96) {
        bytes32 delegatorKey = keccak256(abi.encodePacked(delegator));
        (uint96 simBase, uint96 simIndexed, uint96 unrealized) = simulateStakeInfoUpdate(identityId, delegatorKey);

        (uint96 delegatorEarned, uint96 delegatorPaidOut) = stakingStorage.getDelegatorRewardsInfo(
            identityId,
            delegatorKey
        );

        return (simBase + simIndexed, delegatorEarned - delegatorPaidOut, unrealized);
    }

    function _updateStakeInfo(uint72 identityId, bytes32 delegatorKey) internal {
        StakingStorage ss = stakingStorage;

        (uint96 stakeBase, uint96 stakeIndexed, uint256 stakerLastIndex) = ss.getDelegatorStakeInfo(
            identityId,
            delegatorKey
        );
        uint256 nodeIndex = ss.getNodeRewardIndex(identityId);

        if (nodeIndex > stakerLastIndex) {
            uint256 diff = nodeIndex - stakerLastIndex;
            uint256 currentStake = uint256(stakeBase) + uint256(stakeIndexed);
            uint96 additional = uint96((currentStake * diff) / 1e18);
            stakeIndexed += additional;
            ss.setDelegatorStakeInfo(identityId, delegatorKey, stakeBase, stakeIndexed);
            ss.addDelegatorCumulativeEarnedRewards(identityId, delegatorKey, additional);
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
