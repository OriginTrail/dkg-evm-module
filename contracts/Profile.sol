// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { Hub } from "./Hub.sol";
import { IdentityStorage } from "./storage/IdentityStorage.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ParametersStorage } from "./storage/ParametersStorage.sol";
import { ProfileStorage } from "./storage/ProfileStorage.sol";
import { ShardingTable } from "./ShardingTable.sol";

contract Profile {
    event ProfileCreated(
        uint72 indexed identityId,
        bytes nodeId
    );
    event StakeIncreased(
        uint72 indexed identityId,
        bytes nodeId,
        uint96 stakedAmount,
        uint96 newStake
    );
    event StakeWithdrawalInitiated(
        uint72 indexed identityId,
        bytes nodeId,
        uint96 stakeWithdrawalAmount,
        uint256 stakeWithdrawalTimestamp,
        uint96 newStake
    );
    event StakeWithdrawn(
        uint72 indexed identityId,
        bytes nodeId,
        uint96 withdrawnStakeAmount
    );
    event RewardWithdrawalInitiated(
        uint72 indexed identityId,
        bytes nodeId,
        uint96 rewardWithdrawalAmount,
        uint256 rewardWithdrawalTimestamp
    );
    event RewardWithdrawn(
        uint72 indexed identityId,
        bytes nodeId,
        uint96 withdrawnRewardAmount
    );
    event StakeFrozen(
        uint72 indexed identityId,
        bytes indexed nodeId,
        uint96 frozenStakeAmount
    );
    event StakeUnfrozen(
        uint72 indexed identityId,
        bytes nodeId,
        uint96 unfrozenStakeAmount
    );

    Hub public hub;

    constructor(address hubAddress) {
        require(hubAddress != address(0));
        hub = Hub(hubAddress);
    }

    modifier onlyWithAdminKey(uint72 identityId) {
        require(
            IdentityStorage(hub.getContractAddress("IdentityStorage")).keyHasPurpose(
                identityId,
                keccak256(abi.encodePacked(msg.sender)),
                1
            ),
            "Function can be called only by identity admin"
        );
        _;
	}

    modifier onlyWithPublicKey(uint72 identityId) {
        require(
            IdentityStorage(hub.getContractAddress("IdentityStorage")).keyHasPurpose(
                identityId,
                keccak256(abi.encodePacked(msg.sender)),
                2
            ),
            "Function can be called only using operational key of the identity"
        );
        _;
    }

    function createProfile(address adminWallet, bytes memory nodeId, uint96 initialAsk, uint96 initialStake)
        public
    {
        IERC20 tokenContract = IERC20(hub.getContractAddress("Token"));
        address profileStorageAddress = hub.getContractAddress("ProfileStorage");

        require(
            tokenContract.allowance(msg.sender, address(this)) >= initialStake,
            "Allowance must be >= initial stake"
        );
        require(tokenContract.balanceOf(msg.sender) >= initialStake, "Balance must be >= initial stake");

        tokenContract.transferFrom(msg.sender, profileStorageAddress, initialStake);

        ProfileStorage profileStorage = ProfileStorage(profileStorageAddress);

        uint72 identityId = profileStorage.createProfile(
            msg.sender,
            adminWallet,
            nodeId,
            initialAsk,
            initialStake
        );

        ParametersStorage parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));
        if (initialStake >= parametersStorage.minimalStake()) {
            ShardingTable shardingTable = ShardingTable(hub.getContractAddress("ShardingTable"));
            shardingTable.pushBack(identityId);
        }

        emit ProfileCreated(identityId, nodeId);
    }

    function addNewNodeIdHash(uint72 identityId, uint8 hashFunctionId) public onlyWithPublicKey(identityId) {
        ProfileStorage(hub.getContractAddress("ProfileStorage")).setNodeAddress(identityId, hashFunctionId);
    }

    function increaseStake(uint72 identityId, uint96 amount)
        public
        onlyWithAdminKey(identityId)
    {
        IERC20 tokenContract = IERC20(hub.getContractAddress("Token"));
        address profileStorageAddress = hub.getContractAddress("ProfileStorage");

        require(tokenContract.allowance(msg.sender, address(this)) >= amount, "Allowance must be >= chosen amount");
        require(tokenContract.balanceOf(msg.sender) >= amount, "Balance must be >= chosen amount");

        ProfileStorage profileStorage = ProfileStorage(profileStorageAddress);

        uint96 oldStake = profileStorage.getStake(identityId);
        uint96 newStake = oldStake + amount;
        profileStorage.setStake(identityId, newStake);

        tokenContract.transferFrom(msg.sender, profileStorageAddress, amount);

        ParametersStorage parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));

        if (oldStake < parametersStorage.minimalStake() && newStake >= parametersStorage.minimalStake()) {
            ShardingTable shardingTable = ShardingTable(hub.getContractAddress("ShardingTable"));
            shardingTable.pushBack(identityId);
        }

        emit StakeIncreased(
            identityId,
            profileStorage.getNodeId(identityId),
            amount,
            newStake
        );
    }

    function startStakeWithdrawal(uint72 identityId, uint96 amount)
        public
        onlyWithAdminKey(identityId)
    {
        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        require(amount <= profileStorage.getStake(identityId), "Amount can't be bigger than available stake");

        uint96 oldStake = profileStorage.getStake(identityId);
        uint96 newStake = oldStake - amount;
        uint96 newStakeWithdrawalAmount = profileStorage.getStakeWithdrawalAmount(identityId) + amount;

        ParametersStorage parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));

        profileStorage.setStake(identityId, newStake);
        profileStorage.setStakeWithdrawalAmount(identityId, newStakeWithdrawalAmount);
        uint256 stakeWithdrawalTimestamp = block.timestamp + parametersStorage.stakeWithdrawalDelay();
        profileStorage.setStakeWithdrawalTimestamp(identityId, stakeWithdrawalTimestamp);

        if (oldStake >= parametersStorage.minimalStake() && newStake < parametersStorage.minimalStake()) {
            ShardingTable shardingTable = ShardingTable(hub.getContractAddress("ShardingTable"));
            shardingTable.removeNode(identityId);
        }

        emit StakeWithdrawalInitiated(
            identityId,
            profileStorage.getNodeId(identityId),
            newStakeWithdrawalAmount,
            stakeWithdrawalTimestamp,
            newStake
        );
    }

    function withdrawFreeStake(uint72 identityId)
        public
        onlyWithAdminKey(identityId)
    {
        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        uint96 stakeWithdrawalAmount = profileStorage.getStakeWithdrawalAmount(identityId);

        require(stakeWithdrawalAmount > 0, "Withdrawal hasn't been initiated");
        require(
            profileStorage.getStakeWithdrawalTimestamp(identityId) < block.timestamp,
            "Withdrawal period hasn't ended yet"
        );

        profileStorage.transferTokens(msg.sender, stakeWithdrawalAmount);

        profileStorage.setStakeWithdrawalAmount(identityId, 0);

        emit StakeWithdrawn(
            identityId,
            profileStorage.getNodeId(identityId),
            stakeWithdrawalAmount
        );
    }

    function stakeReward(uint72 identityId)
        public
        onlyWithAdminKey(identityId)
    {
        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        uint96 rewardAmount = profileStorage.getReward(identityId);
        require(rewardAmount > 0, "You have no reward");

        uint96 oldStake = profileStorage.getStake(identityId);
        uint96 newStake = oldStake + rewardAmount;

        profileStorage.setReward(identityId, 0);
        profileStorage.setStake(identityId, newStake);

        ParametersStorage parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));

        if (oldStake < parametersStorage.minimalStake() && newStake >= parametersStorage.minimalStake()) {
            ShardingTable shardingTable = ShardingTable(hub.getContractAddress("ShardingTable"));
            shardingTable.pushBack(identityId);
        }

        emit StakeIncreased(
            identityId,
            profileStorage.getNodeId(identityId),
            rewardAmount,
            newStake
        );
    }

    function startRewardWithdrawal(uint72 identityId)
        public
        onlyWithAdminKey(identityId)
    {
        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        uint96 reward = profileStorage.getReward(identityId);

        require(reward > 0, "No reward to withdraw");

        ParametersStorage parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));

        profileStorage.setReward(identityId, 0);
        profileStorage.setRewardWithdrawalAmount(
            identityId,
            profileStorage.getRewardWithdrawalAmount(identityId) + reward
        );
        uint256 rewardWithdrawalTimestamp = block.timestamp + parametersStorage.rewardWithdrawalDelay();
        profileStorage.setRewardWithdrawalTimestamp(identityId, rewardWithdrawalTimestamp);

        emit RewardWithdrawalInitiated(
            identityId,
            profileStorage.getNodeId(identityId),
            reward,
            rewardWithdrawalTimestamp
        );
    }

    function withdrawFreeReward(uint72 identityId)
        public
        onlyWithAdminKey(identityId)
    {
        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        uint96 rewardWithdrawalAmount = profileStorage.getRewardWithdrawalAmount(identityId);

        require(rewardWithdrawalAmount > 0, "Withdrawal hasn't been initiated");
        require(
            profileStorage.getRewardWithdrawalTimestamp(identityId) < block.timestamp,
            "Withdrawal period hasn't ended yet"
        );

        profileStorage.setRewardWithdrawalAmount(identityId, 0);
        profileStorage.transferTokens(msg.sender, rewardWithdrawalAmount);

        emit RewardWithdrawn(
            identityId,
            profileStorage.getNodeId(identityId),
            rewardWithdrawalAmount
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
