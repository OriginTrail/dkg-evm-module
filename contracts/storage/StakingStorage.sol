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
        require(
            hub.isContract(msg.sender),
            "Function can only be called by contracts!"
        );
        _;
    }

    function createStaking(uint72 identityId, uint96 totalStake, uint96 operatorFee)
        public
        onlyContracts
    {
        totalStakes[identityId] = totalStake;
        operatorFees[identityId] = operatorFee;
    }

    function setTotalStake(uint72 identityId, uint96 newTotalStake)
        public
        onlyContracts
    {
        require(newTotalStake > 0, "Total stake must be greater than 0");
        totalStakes[identityId] = newTotalStake;
    }

    function setOperatorFee(uint72 identityId, uint96 operatorFee)
        public
        onlyContracts
    {
        require(operatorFee <= 100, "Operator fee must be less than or equal to 100%");
        operatorFees[identityId] = operatorFee;
    }
}
