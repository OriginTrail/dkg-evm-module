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

    function addStake(uint72 identityId, uint256 tracAdded)
        public
    {
        require(tracAdded + stakingStorage.totalStakes(identityId) < parametersStorage.maximumStake(), "Exceeded the maximum stake!");
        require(identityStorage.getIdentityId(msg.sender) != 0, "Identity does not exist!");

        address sharesContractAddress = profileStorage.getSharesContractAddress(identityId);
        Shares sharesContract = Shares(sharesContractAddress);

        uint256 sharesMinted = (tracAdded * sharesContract.totalSupply()) / stakingStorage.totalStakes(identityId);
        sharesContract.mint(msg.sender, sharesMinted);

        // TODO: wait for input where to trasnfer
        // tokenContract.transfer(TBD, tracAdded);

        stakingStorage.setTotalStake(identityId, stakingStorage.totalStakes(identityId) + tracAdded);
    }

    function withdrawStake(uint72 identityId, uint256 sharesBurned)
        public
    {
        address sharesContractAddress = profileStorage.getSharesContractAddress(identityId);
        Shares sharesContract = Shares(sharesContractAddress);

        require(sharesBurned < sharesContract.totalSupply(), "Not enough shares available!");
        require(identityStorage.getIdentityId(msg.sender) != 0, "Identity does not exist!");

        uint256 tracWithdrawn = sharesBurned * stakingStorage.totalStakes(identityId) / sharesContract.totalSupply();
        sharesContract.burnFrom(msg.sender, sharesBurned);

        // TODO: when slashing starts, introduce delay

        tokenContract.transfer(msg.sender, tracWithdrawn);

        stakingStorage.setTotalStake(identityId, stakingStorage.totalStakes(identityId) - tracWithdrawn);
    }

    function addReward(uint72 identityId, uint256 tracAmount)
        public
        onlyContracts
    {

        uint256 operatorFee = stakingStorage.operatorFees(identityId) * tracAmount / 100;
        uint256 reward = tracAmount - operatorFee;

        stakingStorage.setTotalStake(identityId, stakingStorage.totalStakes(identityId) + reward);

        // TODO: wait for input where to trasnfer
        // tokenContract.transfer(TBD, reward);

        tokenContract.transfer(address(profileStorage), operatorFee);
        profileStorage.setReward(identityId, profileStorage.getReward(identityId) + reward);
    }

    function slash(uint72 identityId)
        public
        onlyContracts
    {
        // TBD
    }
}
