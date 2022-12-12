// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import {Guardian} from "../Guardian.sol";
import {Named} from "../interface/Named.sol";
import {Versioned} from "../interface/Versioned.sol";

contract StakingStorage is Named, Versioned, Guardian {
    string private constant _NAME = "StakingStorage";
    string private constant _VERSION = "1.0.0";

    struct WithdrawalRequest {
        uint96 amount;
        uint256 timestamp;
    }

    // identityId => totalStake
    mapping(uint72 => uint96) public totalStakes;

    // identityId => operatorFee
    mapping(uint72 => uint96) public operatorFees;

    // identityId => withdrawalRequest
    mapping(uint72 => mapping(address => WithdrawalRequest)) public withdrawalRequests;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) Guardian(hubAddress) {}

    modifier onlyContracts() {
        _checkHub();
        _;
    }

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function setTotalStake(uint72 identityId, uint96 newTotalStake) external onlyContracts {
        totalStakes[identityId] = newTotalStake;
    }

    function setOperatorFee(uint72 identityId, uint96 operatorFee) external onlyContracts {
        operatorFees[identityId] = operatorFee;
    }

    function createWithdrawalRequest(
        uint72 identityId,
        address staker,
        uint96 amount,
        uint256 timestamp
    ) external onlyContracts {
        withdrawalRequests[identityId][staker] = WithdrawalRequest({amount: amount, timestamp: timestamp});
    }

    function deleteWithdrawalRequest(uint72 identityId, address staker) external onlyContracts {
        delete withdrawalRequests[identityId][staker];
    }

    function getWithdrawalRequestAmount(uint72 identityId, address staker) external view returns (uint96) {
        return withdrawalRequests[identityId][staker].amount;
    }

    function getWithdrawalRequestTimestamp(uint72 identityId, address staker) external view returns (uint256) {
        return withdrawalRequests[identityId][staker].timestamp;
    }

    function withdrawalRequestExists(uint72 identityId, address staker) external view returns (bool) {
        return withdrawalRequests[identityId][staker].amount != 0;
    }

    function transferStake(address receiver, uint96 stakeAmount) external onlyContracts {
        tokenContract.transfer(receiver, stakeAmount);
    }

    function _checkHub() internal view virtual {
        require(hub.isContract(msg.sender), "Fn can only be called by the hub");
    }
}
