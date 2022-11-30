// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { Hub } from "../Hub.sol";

contract StakingStorage {

    Hub public hub;

    // identityId => totalStake
    mapping(uint96 => uint256) public totalStakes;

    // identityId => operatorFee
    mapping(uint96 => uint256) public operatorFees;

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

    function createStaking(uint96 identityId, uint256 totalStake, uint256 operatorFee)
        public
        onlyContracts
    {
        totalStakes[identityId] = totalStake;
        operatorFees[identityId] = operatorFee;
    }

    function setTotalStake(uint96 identityId, uint256 newTotalStake)
        public
        onlyContracts
    {
        require(newTotalStake > 0, "Total stake must be greater than 0");
        totalStakes[identityId] = newTotalStake;
    }

    function setOperatorFee(uint96 identityId, uint256 operatorFee)
        public
        onlyContracts
    {
        require(operatorFee <= 100, "Operator fee must be less than or equal to 100%");
        operatorFees[identityId] = operatorFee;
    }
}
