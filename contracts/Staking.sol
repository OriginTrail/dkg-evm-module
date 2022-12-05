// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { Hub } from "./Hub.sol";
import { ShardingTable } from "./ShardingTable.sol";
import { Shares } from "./Shares.sol";
import { IdentityStorage } from "./storage/IdentityStorage.sol";
import { ParametersStorage } from "./storage/ParametersStorage.sol";
import { ProfileStorage } from "./storage/ProfileStorage.sol";
import { ServiceAgreementStorageV1 } from "./storage/ServiceAgreementStorageV1.sol";
import { ShardingTableStorage } from "./storage/ShardingTableStorage.sol";
import { StakingStorage } from "./storage/StakingStorage.sol";
import { ADMIN_KEY } from "./constants/IdentityConstants.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Staking {

    event StakeIncreased(
        uint72 indexed identityId,
        address indexed staker,
        uint96 newStakeAmount
    );
    event StakeWithdrawalStarted(
        uint72 indexed identityId,
        address indexed staker,
        uint96 stakeAmount,
        uint256 withdrawalPeriodEnd
    );
    event StakeWithdrawn(
        uint72 indexed identityId,
        address indexed staker,
        uint96 withdrawnStakeAmount
    );
    event RewardAdded(
        uint72 indexed identityId,
        uint96 rewardAmount
    );

    Hub public hub;
    ShardingTable public shardingTableContract;
    IdentityStorage public identityStorage;
    ParametersStorage public parametersStorage;
    ProfileStorage public profileStorage;
    StakingStorage public stakingStorage;
    ServiceAgreementStorageV1 public serviceAgreementStorageV1;
    ShardingTableStorage public shardingTableStorage;
    IERC20 public tokenContract;

    constructor(address hubAddress) {
        require(hubAddress != address(0));

        hub = Hub(hubAddress);
        shardingTableContract = ShardingTable(hub.getContractAddress("ShardingTable"));
        identityStorage = IdentityStorage(hub.getContractAddress("IdentityStorage"));
        parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));
        profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        stakingStorage = StakingStorage(hub.getContractAddress("StakingStorage"));
        serviceAgreementStorageV1 = ServiceAgreementStorageV1(hub.getContractAddress("ServiceAgreementStorageV1"));
        shardingTableStorage = ShardingTableStorage(hub.getContractAddress("ShardingTableStorage"));
        tokenContract = IERC20(hub.getContractAddress("Token"));
    }

    modifier onlyContracts() {
        _checkHub();
        _;
    }

    modifier onlyProfileOrAdmin(uint72 identityId) {
        _checkProfileOrAdmin(identityId);
        _;
    }

    function addStake(address sender, uint72 identityId, uint96 stakeAmount) external onlyContracts {
        _addStake(sender, identityId, stakeAmount);
    }

    function addStake(uint72 identityId, uint96 stakeAmount) external {
        _addStake(msg.sender, identityId, stakeAmount);
    }

    function startStakeWithdrawal(uint72 identityId, uint96 sharesToBurn) external {
        require(sharesToBurn != 0, "Withdrawal amount cannot be 0");

        ProfileStorage ps = profileStorage;
        StakingStorage ss = stakingStorage;

        require(ps.profileExists(identityId), "Profile doesn't exist");

        Shares sharesContract = Shares(ps.getSharesContractAddress(identityId));

        require(sharesToBurn <= sharesContract.balanceOf(msg.sender), "sharesToBurn must be <= balance");

        uint96 oldStake = ss.totalStakes(identityId);
        uint96 stakeWithdrawalAmount = (
            uint96(uint256(oldStake) * sharesToBurn / sharesContract.totalSupply())
        );
        uint96 newStake = oldStake - stakeWithdrawalAmount;
        uint96 newStakeWithdrawalAmount = ss.getWithdrawalRequestAmount(identityId, msg.sender) + stakeWithdrawalAmount;

        ParametersStorage params = parametersStorage;

        uint256 withdrawalPeriodEnd = block.timestamp + params.stakeWithdrawalDelay();
        ss.createWithdrawalRequest(
            identityId,
            msg.sender,
            newStakeWithdrawalAmount,
            withdrawalPeriodEnd
        );
        ss.setTotalStake(identityId, newStake);
        sharesContract.burnFrom(msg.sender, sharesToBurn);

        if (shardingTableStorage.nodeExists(identityId) && (newStake < params.minimumStake())) {
            shardingTableContract.removeNode(identityId);
        }

        emit StakeWithdrawalStarted(identityId, msg.sender, newStakeWithdrawalAmount, withdrawalPeriodEnd);
    }

    function withdrawStake(uint72 identityId) external {
        require(profileStorage.profileExists(identityId), "Profile doesn't exist");

        StakingStorage ss = stakingStorage;

        uint96 stakeWithdrawalAmount;
        uint256 withdrawalTimestamp;
        (stakeWithdrawalAmount, withdrawalTimestamp) = ss.withdrawalRequests(identityId, msg.sender);

        require(withdrawalTimestamp < block.timestamp, "Withdrawal period hasn't ended yet");

        ss.deleteWithdrawalRequest(identityId, msg.sender);
        ss.transferStake(msg.sender, stakeWithdrawalAmount);

        emit StakeWithdrawn(identityId, msg.sender, stakeWithdrawalAmount);
    }

    function addReward(uint72 identityId, uint96 rewardAmount) external onlyContracts {
        ServiceAgreementStorageV1 sasV1 = serviceAgreementStorageV1;
        StakingStorage ss = stakingStorage;

        uint96 operatorFee = rewardAmount * ss.operatorFees(identityId) / 100;
        uint96 delegatorsReward = rewardAmount - operatorFee;

        if(operatorFee != 0) {
            ProfileStorage ps = profileStorage;
            ps.setAccumulatedOperatorFee(identityId, ps.getAccumulatedOperatorFee(identityId) + operatorFee);
            sasV1.transferReward(address(ps), operatorFee);
        }

        if(delegatorsReward != 0) {
            ss.setTotalStake(identityId, ss.totalStakes(identityId) + delegatorsReward);
            sasV1.transferReward(address(ss), delegatorsReward);

            if (
                !shardingTableStorage.nodeExists(identityId) &&
                ss.totalStakes(identityId) >= parametersStorage.minimumStake()
            ) {
                shardingTableContract.pushBack(identityId);
            }
        }

        emit RewardAdded(identityId, rewardAmount);
    }

    function slash(uint72 identityId) external onlyContracts {
        // TBD
    }

    function setOperatorFee(uint72 identityId, uint8 operatorFee) external onlyProfileOrAdmin(identityId) {
        require(operatorFee <= 100, "Operator fee out of [0, 100]");
        stakingStorage.setOperatorFee(identityId, operatorFee);
    }

    function _addStake(address sender, uint72 identityId, uint96 stakeAmount) internal {
        StakingStorage ss = stakingStorage;
        ParametersStorage ps = parametersStorage;
        IERC20 tknc = tokenContract;

        require(tknc.allowance(sender, address(this)) >= stakeAmount, "Allowance < stakeAmount");
        require(stakeAmount + ss.totalStakes(identityId) <= ps.maximumStake(), "Exceeded the maximum stake");
        require(profileStorage.profileExists(identityId), "Profile doesn't exist");

        Shares sharesContract = Shares(profileStorage.getSharesContractAddress(identityId));

        uint256 sharesMinted;
        if(sharesContract.totalSupply() == 0) {
            sharesMinted = stakeAmount;
        } else {
            sharesMinted = (
                stakeAmount * sharesContract.totalSupply() / ss.totalStakes(identityId)
            );
        }
        sharesContract.mint(sender, sharesMinted);

        tknc.transferFrom(sender, address(ss), stakeAmount);

        ss.setTotalStake(identityId, ss.totalStakes(identityId) + stakeAmount);

        if (
            !shardingTableStorage.nodeExists(identityId) &&
            ss.totalStakes(identityId) >= parametersStorage.minimumStake()
        ) {
            shardingTableContract.pushBack(identityId);
        }

        emit StakeIncreased(identityId, sender, stakeAmount);
    }

    function _checkHub() internal view virtual {
        require(hub.isContract(msg.sender), "Fn can only be called by the hub");
    }

    function _checkProfileOrAdmin(uint72 identityId) internal view virtual {
        require(
            (msg.sender == hub.getContractAddress("Profile")) ||
            identityStorage.keyHasPurpose(identityId, keccak256(abi.encodePacked(msg.sender)), ADMIN_KEY),
            "Admin function"
        );
    }

}
