// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { Hub } from "../Hub.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract StakingStorage {

    Hub public hub;
    IERC20 public tokenContract;

    // identityId => totalStake
    mapping(uint72 => uint96) public totalStakes;

    // identityId => operatorFee
    mapping(uint72 => uint96) public operatorFees;

    constructor(address hubAddress) {
        require(hubAddress != address(0));

        hub = Hub(hubAddress);
        tokenContract = IERC20(hub.getContractAddress("Token"));
    }

    modifier onlyContracts() {
        _checkHub();
        _;
    }

    modifier onlyStakingContract() {
        _checkStaking();
        _;
    }

    function initializeStaking(uint72 identityId, uint96 totalStake, uint96 operatorFee) external onlyContracts {
        totalStakes[identityId] = totalStake;
        operatorFees[identityId] = operatorFee;
    }

    function setTotalStake(uint72 identityId, uint96 newTotalStake) external onlyContracts {
        totalStakes[identityId] = newTotalStake;
    }

    function setOperatorFee(uint72 identityId, uint96 operatorFee) external onlyContracts {
        operatorFees[identityId] = operatorFee;
    }

    function transferStake(address receiver, uint96 stakeAmount) external onlyStakingContract {
        tokenContract.transfer(receiver, stakeAmount);
    }

    function _checkHub() internal view virtual {
        require(hub.isContract(msg.sender), "Fn can only be called by the hub");
    }

    function _checkStaking() internal view virtual {
        require(msg.sender == hub.getContractAddress("Staking"), "Fn can only be called by Staking");
    }

}
