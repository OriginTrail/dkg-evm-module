// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { ParametersStorage } from "./storage/ParametersStorage.sol";
import { ProfileStorage } from "./storage/ProfileStorage.sol";
import { ShardingTable } from "./ShardingTable.sol";
import { Hub } from "./Hub.sol";
import { Identity } from "./Identity.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC734 } from "./interface/ERC734.sol";


contract Profile {
    event ProfileCreated(uint96 indexed identityId, address indexed identityContractAddress);
    event StakeIncreased(uint96 indexed identityId, address indexed identityContractAddress, uint96 newStake);
    event StakeWithdrawalInitiated(
        uint96 indexed identityId,
        address indexed identityContractAddress,
        uint96 stakeWithdrawalAmount,
        uint256 stakeWithdrawalTimestamp
    );
    event StakeWithdrawn(
        uint96 indexed identityId, address indexed identityContractAddress, uint96 withdrawnAmount, uint96 stakeLeft
    );
    event RewardStaked(
        uint96 indexed identityId, address indexed identityContractAddress, uint96 stakedAmount, uint96 newStake
    );
    event RewardWithdrawalInitiated(
        uint96 indexed identityId,
        address indexed identityContractAddress,
        uint96 rewardWithdrawalAmount,
        uint256 rewardWithdrawalTimestamp
    );
    event RewardWithdrawn(uint96 indexed identityId, address indexed identityContractAddress, uint96 withdrawnRewardAmount);
    event StakeFrozen(uint96 indexed identityId, address indexed identityContractAddress, uint96 frozenStakeAmount);
    event StakeUnfrozen(uint96 indexed identityId, address indexed identityContractAddress, uint96 unfrozenStakeAmount);

    Hub public hub;

    constructor(address hubAddress) {
        require(hubAddress != address(0));
        hub = Hub(hubAddress);
    }

    function createProfile(address managementWallet, bytes memory nodeId, uint96 initialAsk, uint96 initialStake)
        public
    {
        IERC20 tokenContract = IERC20(hub.getContractAddress("Token"));
        address profileStorageAddress = hub.getContractAddress("ProfileStorage");

        require(tokenContract.allowance(msg.sender, address(this)) >= initialStake, "Allowance must be >= initial stake");
        require(tokenContract.balanceOf(msg.sender) >= initialStake, "Balance must be >= initial stake");
        tokenContract.transferFrom(msg.sender, profileStorageAddress, initialStake);

        ProfileStorage profileStorage = ProfileStorage(profileStorageAddress);

        (identityId, identityContractAddress) = profileStorage.createProfile(
            msg.sender,
            managementWallet,
            nodeId,
            initialAsk,
            initialStake
        );
       
        ParametersStorage parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));
        ShardingTable shardingTable = ShardingTable(hub.getContractAddress("ShardingTable"));
        if (initialStake >= parametersStorage.minimalStake()) {
            shardingTable.pushBack(identityId);
        }

        emit ProfileCreated(identityId, identityContractAddress);
    }

    function increaseStake(uint96 amount)
        public
    {
        IERC20 tokenContract = IERC20(hub.getContractAddress("Token"));
        address profileStorageAddress = hub.getContractAddress("ProfileStorage");

        require(tokenContract.allowance(msg.sender, address(this)) >= amount, "Allowance must be >= chosen amount");
        require(tokenContract.balanceOf(msg.sender) >= amount, "Balance must be >= chosen amount");
        tokenContract.transferFrom(msg.sender, profileStorageAddress, amount);

        ProfileStorage profileStorage = ProfileStorage(profileStorageAddress);

        uint96 identityId = profileStorage.identityIds(msg.sender);

        uint256 oldStake = profileStorage.getStake(identityId);
        uint256 newStake = oldStake + amount;
        profileStorage.setStake(identityId, newStake);

        ParametersStorage parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));

        uint96 minimalStake = parametersStorage.minimalStake();
        if (oldStake < minimalStake && newStake >= minimalStake) {
            ShardingTable shardingTable = ShardingTable(hub.getContractAddress("ShardingTable"));
            shardingTable.pushBack(identityId);
        }

        emit StakeIncreased(identityId, profileStorage.identityContractAddresses(identityId), newStake);
    }

    function startStakeWithdrawal(uint96 amount)
        public
    {
        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        uint96 identityId = profileStorage.identityIds(msg.sender);

        uint96 oldStakeWithdrawalAmount = profileStorage.getStakeWithdrawalAmount(identityId);
        uint96 availableStake = (
            profileStorage.getStake(identityId) -
            oldStakeWithdrawalAmount -
            profileStorage.getFrozenAmount(identityId)
        );

        require(amount <= availableStake, "Amount can't be bigger than available stake");

        uint96 newStakeWithdrawalAmount = oldStakeWithdrawalAmount + amount;

        ParametersStorage parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));

        profileStorage.setStakeWithdrawalAmount(identityId, newStakeWithdrawalAmount);
        uint256 stakeWithdrawalTimestamp = block.timestamp + parametersStorage.stakeWithdrawalDelay();
        profileStorage.setStakeWithdrawalTimestamp(identityId, stakeWithdrawalTimestamp);

        emit StakeWithdrawalInitiated(
            identityId,
            profileStorage.identityContractAddresses(identityId),
            newStakeWithdrawalAmount,
            stakeWithdrawalTimestamp
        );
    }

    function withdrawFreeStake()
        public
    {
        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        uint96 identityId = profileStorage.identityIds(msg.sender);

        uint96 stakeWithdrawalAmount = profileStorage.getStakeWithdrawalAmount(identityId);

        require(stakeWithdrawalAmount > 0, "Withdrawal hasn't been initiated");
        require(profileStorage.getStakeWithdrawalTimestamp(identityId) < block.timestamp, "Withdrawal period hasn't ended yet");

        profileStorage.transferTokens(msg.sender, stakeWithdrawalAmount);

        uint96 oldStake = profileStorage.getStake(identityId);
        uint96 newStake = oldStake - stakeWithdrawalAmount;

        profileStorage.setStake(identityId, newStake);
        profileStorage.setStakeWithdrawalAmount(identityId, 0);

        ParametersStorage parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));

        uint96 minimalStake = parametersStorage.minimalStake();
        if (oldStake >= minimalStake && newStake < minimalStake) {
            ShardingTable shardingTable = ShardingTable(hub.getContractAddress("ShardingTable"));
            shardingTable.removeNode(identityId);
        }

        emit StakeWithdrawn(
            identityId,
            profileStorage.identityContractAddresses(identityId),
            stakeWithdrawalAmount,
            newStake
        );
    }

    function stakeReward()
        public
    {
        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        uint96 identityId = profileStorage.identityIds(msg.sender);

        uint96 rewardAmount = profileStorage.getReward(identityId);
        require(rewardAmount > 0, "You have no reward");

        uint96 oldStake = profileStorage.getStake(identityId);
        uint96 newStake = oldStake + rewardAmount;

        profileStorage.setReward(identityId, 0);
        profileStorage.setStake(identityId, newStake);

        emit RewardStaked(
            identityId,
            profileStorage.identityContractAddresses(identityId),
            rewardAmount,
            newStake
        );
    }

    function startRewardWithdrawal()
        public
    {
        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        uint96 identityId = profileStorage.identityIds(msg.sender);

        uint96 reward = profileStorage.getReward(identityId);
        uint96 availableReward = (
            reward -
            profileStorage.getRewardWithdrawalAmount(identityId)
        );

        require(availableReward > 0, "No reward to withdraw");

        ParametersStorage parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));

        profileStorage.setRewardWithdrawalAmount(identityId, reward);
        uint256 rewardWithdrawalTimestamp = block.timestamp + parametersStorage.rewardWithdrawalDelay();
        profileStorage.setRewardWithdrawalTimestamp(identityId, rewardWithdrawalTimestamp);

        emit RewardWithdrawalInitiated(
            identityId,
            profileStorage.identityContractAddresses(identityId),
            reward,
            rewardWithdrawalTimestamp
        );
    }

    function withdrawFreeReward()
        public
    {
        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        uint96 identityId = profileStorage.identityIds(msg.sender);

        uint96 rewardWithdrawalAmount = profileStorage.getRewardWithdrawalAmount(identityId);

        require(rewardWithdrawalAmount > 0, "Withdrawal hasn't been initiated");
        require(profileStorage.getRewardWithdrawalTimestamp(identityId) < block.timestamp, "Withdrawal period hasn't ended yet");

        profileStorage.transferTokens(msg.sender, rewardWithdrawalAmount);

        uint96 oldReward = profileStorage.getReward(identityId);
        uint96 newReward = oldReward - rewardWithdrawalAmount;

        profileStorage.setReward(identityId, newReward);
        profileStorage.setRewardWithdrawalAmount(identityId, 0);

        emit RewardWithdrawn(
            identityId,
            profileStorage.identityContractAddresses(identityId),
            rewardWithdrawalAmount,
            newReward
        );
    }

    // function freezeStake(uint8 percentage)
    //     public
    // {
    //     emit StakeFrozen(identityId, frozenStakeAmount);
    // }

    // function unfreezeStake()
    //     public
    // {
    //     emit StakeUnfrozen(identityId, unfrozenStakeAmount);
    // }
}
