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
    ServiceAgreementStorageV1 public serviceAgreementStorage;
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
        serviceAgreementStorage = ServiceAgreementStorageV1(hub.getContractAddress("ServiceAgreementStorage"));
        shardingTableStorage = ShardingTableStorage(hub.getContractAddress("ShardingTableStorage"));
        tokenContract = IERC20(hub.getContractAddress("Token"));
    }

    modifier onlyContracts() {
        _checkHub();
        _;
    }

    modifier onlyAdmin(uint72 identityId) {
        _checkAdmin(identityId);
        _;
    }

    function addStake(address sender, uint72 identityId, uint96 stakeAmount) external onlyContracts {
        _addStake(sender, identityId, stakeAmount);
    }

    function addStake(uint72 identityId, uint96 stakeAmount) external {
        _addStake(msg.sender, identityId, stakeAmount);
    }

    function withdrawStake(uint72 identityId, uint96 sharesToBurn) external {
        Shares sharesContract = Shares(profileStorage.getSharesContractAddress(identityId));

        require(profileStorage.profileExists(identityId), "Profile doesn't exist");

        StakingStorage ss = stakingStorage;
        ShardingTable stc = shardingTableContract;
        ShardingTableStorage sts = shardingTableStorage;

        // TODO: potential optimization of types
        uint256 tokensWithdrawalAmount = (
            uint256(ss.totalStakes(identityId)) * sharesToBurn / sharesContract.totalSupply()
        );
        sharesContract.burnFrom(msg.sender, sharesToBurn);

        // TODO: when slashing starts, introduce delay

        tokenContract.transfer(msg.sender, tokensWithdrawalAmount);

        ss.setTotalStake(identityId, ss.totalStakes(identityId) - uint96(tokensWithdrawalAmount));

        if (sts.nodeExists(identityId) && ss.totalStakes(identityId) < parametersStorage.minimumStake()) {
            stc.removeNode(identityId);
        }

        emit StakeWithdrawn(identityId, msg.sender, uint96(tokensWithdrawalAmount));
    }

    function addReward(uint72 identityId, uint96 rewardAmount) external onlyContracts {
        ServiceAgreementStorageV1 sas = serviceAgreementStorage;
        StakingStorage ss = stakingStorage;

        uint96 operatorFee = rewardAmount * ss.operatorFees(identityId) / 100;
        uint96 delegatorsReward = rewardAmount - operatorFee;

        if(operatorFee != 0) {
            ProfileStorage ps = profileStorage;
            ps.setAccumulatedOperatorFee(identityId, ps.getAccumulatedOperatorFee(identityId) + operatorFee);
            sas.transferReward(address(ps), operatorFee);
        }

        if(delegatorsReward != 0) {
            ss.setTotalStake(identityId, ss.totalStakes(identityId) + delegatorsReward);
            sas.transferReward(address(ss), delegatorsReward);

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

    function setOperatorFee(uint72 identityId, uint8 operatorFee) external onlyAdmin(identityId) {
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

        tknc.transfer(address(ss), stakeAmount);

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

    function _checkAdmin(uint72 identityId) internal view virtual {
        require(
            identityStorage.keyHasPurpose(identityId, keccak256(abi.encodePacked(msg.sender)), ADMIN_KEY),
            "Admin function"
        );
    }

}
