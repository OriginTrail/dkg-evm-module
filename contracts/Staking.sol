// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { Hub } from "./Hub.sol";
import { Shares } from "./Shares.sol";
import { StakingStorage } from "./storage/StakingStorage.sol";
import { ParametersStorage } from "./storage/ParametersStorage.sol";
import { IdentityStorage } from "./storage/IdentityStorage.sol";
import { ProfileStorage } from "./storage/ProfileStorage.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Staking {

    Hub public hub;
    StakingStorage public stakingStorage;
    ParametersStorage public parametersStorage;
    IdentityStorage public identityStorage;
    ProfileStorage public profileStorage;
    IERC20 public tokenContract;

    constructor(address hubAddress) {
        require(hubAddress != address(0));
        hub = Hub(hubAddress);

        stakingStorage = StakingStorage(hub.getContractAddress("StakingStorage"));
        parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));
        identityStorage = IdentityStorage(hub.getContractAddress("IdentityStorage"));
        profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        tokenContract = IERC20(hub.getContractAddress("Token"));
    }

    modifier onlyContracts(){
        require(
            hub.isContract(msg.sender),
            "Function can only be called by contracts!"
        );
        _;
    }

    function addStake(uint72 identityId, uint96 tracAdded)
        public
    {
        require(tracAdded + stakingStorage.totalStakes(identityId) < parametersStorage.maximumStake(), "Exceeded the maximum stake!");
        require(parametersStorage.delegationEnabled() || identityStorage.getIdentityId(msg.sender) != 0, "Identity does not exist or user delegation disabled!");

        address sharesContractAddress = profileStorage.getSharesContractAddress(identityId);
        Shares sharesContract = Shares(sharesContractAddress);

        uint256 sharesMinted;
        if(sharesContract.totalSupply() == 0) {
            sharesMinted = uint256(tracAdded);
        } else {
            sharesMinted = uint256(tracAdded) * sharesContract.totalSupply() / uint256(stakingStorage.totalStakes(identityId));
        }
        sharesContract.mint(msg.sender, sharesMinted);

        // TODO: wait for input where to transfer
        // tokenContract.transfer(TBD, tracAdded);

        stakingStorage.setTotalStake(identityId, stakingStorage.totalStakes(identityId) + tracAdded);
    }

    function withdrawStake(uint72 identityId, uint96 sharesBurned)
        public
    {
        address sharesContractAddress = profileStorage.getSharesContractAddress(identityId);
        Shares sharesContract = Shares(sharesContractAddress);

        require(sharesBurned < uint96(sharesContract.totalSupply()), "Not enough shares available!");
        require(identityStorage.getIdentityId(msg.sender) != 0, "Identity does not exist!");

        uint256 tracWithdrawn = uint256(sharesBurned) * uint256(stakingStorage.totalStakes(identityId)) / sharesContract.totalSupply();
        sharesContract.burnFrom(msg.sender, sharesBurned);

        // TODO: when slashing starts, introduce delay

        tokenContract.transfer(msg.sender, tracWithdrawn);

        stakingStorage.setTotalStake(identityId, stakingStorage.totalStakes(identityId) - uint96(tracWithdrawn));
    }

    function addReward(uint72 identityId, uint96 tracAmount)
        public
        onlyContracts
    {

        uint96 operatorFee = stakingStorage.operatorFees(identityId) * tracAmount / 100;
        uint96 reward = tracAmount - operatorFee;

        // TODO: wait for input where to trasnfer
        // tokenContract.transfer(TBD, reward);
        tokenContract.transfer(address(profileStorage), operatorFee);

        stakingStorage.setTotalStake(identityId, stakingStorage.totalStakes(identityId) + reward);
        profileStorage.setReward(identityId, profileStorage.getReward(identityId) + reward);
    }

    function slash(uint72 identityId)
        public
        onlyContracts
    {
        // TBD
    }
}
