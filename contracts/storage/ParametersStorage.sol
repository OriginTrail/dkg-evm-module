// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {HubDependent} from "../abstract/HubDependent.sol";
import {INamed} from "../interfaces/INamed.sol";
import {IVersioned} from "../interfaces/IVersioned.sol";

contract ParametersStorage is INamed, IVersioned, HubDependent {
    event ParameterChanged(string parameterName, uint256 parameterValue);

    string private constant _NAME = "ParametersStorage";
    string private constant _VERSION = "1.0.0";

    uint96 public minimumStake;
    uint96 public maximumStake;

    uint256 public stakeWithdrawalDelay;
    uint256 public nodeAskUpdateDelay;
    uint256 public operatorFeeUpdateDelay;

    uint16 public opWalletsLimitOnProfileCreation;
    uint16 public shardingTableSizeLimit;

    uint256 public minimumRequiredSignatures;

    uint256 public askUpperBoundFactor;
    uint256 public askLowerBoundFactor;

    constructor(address hubAddress) HubDependent(hubAddress) {
        minimumStake = 50_000 ether;
        maximumStake = 2_000_000 ether;

        stakeWithdrawalDelay = 28 days;
        nodeAskUpdateDelay = 1 days;
        operatorFeeUpdateDelay = 28 days;

        opWalletsLimitOnProfileCreation = 50;
        shardingTableSizeLimit = 500;

        minimumRequiredSignatures = 3;

        askUpperBoundFactor = 1467000000000000000;
        askLowerBoundFactor = 533000000000000000;
    }

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function setAskUpperBoundFactor(uint256 _askUpperBoundFactor) external onlyHub {
        askUpperBoundFactor = _askUpperBoundFactor;
    }

    function setAskLowerBoundFactor(uint256 _askLowerBoundFactor) external onlyHub {
        askLowerBoundFactor = _askLowerBoundFactor;
    }

    function setMinimumRequiredSignatures(uint256 _minimumRequiredSignatures) external onlyHub {
        minimumRequiredSignatures = _minimumRequiredSignatures;

        emit ParameterChanged("minimumRequiredSignatures", _minimumRequiredSignatures);
    }

    function setMinimumStake(uint96 newMinimumStake) external onlyHub {
        minimumStake = newMinimumStake;

        emit ParameterChanged("minimumStake", newMinimumStake);
    }

    function setMaximumStake(uint96 newMaximumStake) external onlyHub {
        maximumStake = newMaximumStake;

        emit ParameterChanged("maximumStake", newMaximumStake);
    }

    function setStakeWithdrawalDelay(uint256 newStakeWithdrawalDelay) external onlyHub {
        stakeWithdrawalDelay = newStakeWithdrawalDelay;

        emit ParameterChanged("stakeWithdrawalDelay", newStakeWithdrawalDelay);
    }

    function setNodeAskUpdateDelay(uint256 newNodeAskUpdateDelay) external onlyHub {
        nodeAskUpdateDelay = newNodeAskUpdateDelay;

        emit ParameterChanged("nodeAskUpdateDelay", newNodeAskUpdateDelay);
    }

    function setOperatorFeeUpdateDelay(uint256 newOperatorFeeUpdateDelay) external onlyHub {
        operatorFeeUpdateDelay = newOperatorFeeUpdateDelay;

        emit ParameterChanged("operatorFeeUpdateDelay", newOperatorFeeUpdateDelay);
    }

    function setOpWalletsLimitOnProfileCreation(uint16 opWalletsLimitOnProfileCreation_) external onlyHub {
        opWalletsLimitOnProfileCreation = opWalletsLimitOnProfileCreation_;

        emit ParameterChanged("opWalletsLimitOnProfileCreation", opWalletsLimitOnProfileCreation);
    }

    function setShardingTableSizeLimit(uint16 shardingTableSizeLimit_) external onlyHub {
        shardingTableSizeLimit = shardingTableSizeLimit_;

        emit ParameterChanged("shardingTableSizeLimit", shardingTableSizeLimit);
    }
}
