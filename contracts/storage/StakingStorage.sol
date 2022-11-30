// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { Hub } from "../Hub.sol";

contract StakingStorage {

    Hub public hub;

    // identityId => totalStake
    mapping(uint72 => uint96) public totalStakes;

    // identityId => operatorFee
    mapping(uint72 => uint96) public operatorFees;

    constructor(address hubAddress) {
        require(hubAddress != address(0));

        hub = Hub(hubAddress);
    }

    modifier onlyContracts(){
        _checkHub();
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

    function _checkHub() internal view virtual {
        require(hub.isContract(msg.sender), "Fn can only be called by the hub");
    }
}
