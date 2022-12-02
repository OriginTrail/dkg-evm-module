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
        address indexed staker,
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

    function addStake(uint72 identityId, uint96 tracAdded) external onlyAdmin(identityId) {
        StakingStorage ss = stakingStorage;
        ParametersStorage ps = parametersStorage;
        ShardingTable stc = shardingTableContract;
        ShardingTableStorage sts = shardingTableStorage;
        IERC20 tknc = tokenContract;

        require(
            tknc.allowance(msg.sender, address(this)) >= tracAdded,
            "Account does not have sufficient allowance"
        );
        require(tracAdded + ss.totalStakes(identityId) <= ps.maximumStake(), "Exceeded the maximum stake!");
        require(
            ps.delegationEnabled() || identityStorage.identityExists(identityId),
            "No identity/delegation disabled"
        );

        Shares sharesContract = Shares(profileStorage.getSharesContractAddress(identityId));

        uint256 sharesMinted;
        if(sharesContract.totalSupply() == 0) {
            sharesMinted = tracAdded;
        } else {
            sharesMinted = (
                tracAdded * sharesContract.totalSupply() / ss.totalStakes(identityId)
            );
        }
        sharesContract.mint(msg.sender, sharesMinted);

        tknc.transfer(address(ss), tracAdded);

        ss.setTotalStake(identityId, ss.totalStakes(identityId) + tracAdded);

        if (!sts.nodeExists(identityId) && ss.totalStakes(identityId) >= parametersStorage.minimumStake()) {
            stc.pushBack(identityId);
        }

        emit StakeIncreased(identityId, msg.sender, tracAdded);
    }

    function withdrawStake(uint72 identityId, uint96 sharesBurned) external onlyAdmin(identityId) {
        Shares sharesContract = Shares(profileStorage.getSharesContractAddress(identityId));

        // TODO: validate check below
        require(sharesBurned < sharesContract.totalSupply(), "Not enough shares available");
        require(identityStorage.identityExists(identityId), "Identity doesn't exist");

        StakingStorage ss = stakingStorage;
        ShardingTable stc = shardingTableContract;
        ShardingTableStorage sts = shardingTableStorage;

        // TODO: check if conversion to uint256 needed
        uint256 tracWithdrawn = (
            sharesBurned * ss.totalStakes(identityId) / sharesContract.totalSupply()
        );
        sharesContract.burnFrom(msg.sender, sharesBurned);

        // TODO: when slashing starts, introduce delay

        tokenContract.transfer(msg.sender, tracWithdrawn);

        ss.setTotalStake(identityId, ss.totalStakes(identityId) - uint96(tracWithdrawn));

        if (sts.nodeExists(identityId) && ss.totalStakes(identityId) < parametersStorage.minimumStake()) {
            stc.removeNode(identityId);
        }

        emit StakeWithdrawn(identityId, msg.sender, uint96(tracWithdrawn));
    }

    function addReward(uint72 identityId, address admin, uint96 tracAmount) external onlyContracts {
        ServiceAgreementStorageV1 sas = serviceAgreementStorage;
        StakingStorage ss = stakingStorage;

        uint96 operatorFee = tracAmount * ss.operatorFees(identityId) / 100;
        uint96 reward = tracAmount - operatorFee;

        if(reward > 0) {
            sas.transferReward(address(ss), reward);
        }

        if(operatorFee > 0) {
            sas.transferReward(admin, operatorFee);
        }

        ss.setTotalStake(identityId, ss.totalStakes(identityId) + reward);

        if (
            !shardingTableStorage.nodeExists(identityId) &&
            ss.totalStakes(identityId) >= parametersStorage.minimumStake()
        ) {
            shardingTableContract.pushBack(identityId);
        }

        emit RewardAdded(identityId, admin, tracAmount);
    }

    function slash(uint72 identityId) external onlyContracts {
        // TBD
    }

    function setOperatorFee(uint72 identityId, uint8 operatorFee) external onlyAdmin(identityId) {
        require(operatorFee <= 100, "Operator fee out of [0, 100]");
        stakingStorage.setOperatorFee(identityId, operatorFee);
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
