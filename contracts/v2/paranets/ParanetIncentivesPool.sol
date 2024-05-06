// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {KnowledgeMinersRegistry} from "../storage/paranets/KnowledgeMinersRegistry.sol";
import {ParanetsRegistry} from "../storage/paranets/ParanetsRegistry.sol";
import {ParanetErrors} from "../errors/paranets/ParanetErrors.sol";
import {ParanetStructs} from "../structs/paranets/ParanetStructs.sol";

contract ParanetIncentivesPool {
    ParanetsRegistry public paranetsRegistry;
    KnowledgeMinersRegistry public knowledgeMinersRegistry;

    bytes32 public parentParanetId;

    uint256 private _ratioPrecision = 1 ether;
    uint256 private _percentagePrecision = 10000;

    uint256 public tracToNeuroRatio;
    uint256 public claimedNeuro;
    uint96 public tracTarget;
    uint96 public tracRewarded;
    uint16 public operatorRewardPercentage;

    // solhint-disable-next-line no-empty-blocks
    constructor(
        address paranetsRegistryAddress,
        address knowledgeMinersRegistryAddress,
        bytes32 paranetId,
        uint256 tracToNeuroRatio_,
        uint96 tracTarget_,
        uint16 operatorRewardPercentage_
    ) {
        paranetsRegistry = ParanetsRegistry(paranetsRegistryAddress);
        knowledgeMinersRegistry = KnowledgeMinersRegistry(knowledgeMinersRegistryAddress);

        parentParanetId = paranetId;
        tracToNeuroRatio = tracToNeuroRatio_;
        tracTarget = tracTarget_;
        operatorRewardPercentage = operatorRewardPercentage_;
    }

    modifier onlyParanetOperator() {
        _checkParanetOperator();
        _;
    }

    modifier onlyParanetKnowledgeMiner() {
        _checkParanetKnowledgeMiner();
        _;
    }

    function getParanetOperatorReward() external onlyParanetOperator {
        uint256 operatorReward = ((tracRewarded * tracToNeuroRatio) / _ratioPrecision) - claimedNeuro;

        if (operatorReward == 0) {
            revert ParanetErrors.NoOperatorRewardAvailable(parentParanetId);
        }

        claimedNeuro += operatorReward;

        payable(msg.sender).transfer(operatorReward);
    }

    function getKnowledgeMinerReward() external onlyParanetKnowledgeMiner {
        KnowledgeMinersRegistry kmr = knowledgeMinersRegistry;
        bytes32 paranetId = parentParanetId;

        uint96 tracSpent = knowledgeMinersRegistry.getUnrewardedTracSpent(paranetId);

        if (tracRewarded + tracSpent > tracTarget) {
            revert ParanetErrors.TracTargetExceeded(paranetId, tracTarget, tracRewarded, tracSpent);
        }

        uint256 neuroReward = ((tracToNeuroRatio * tracSpent * (_percentagePrecision - operatorRewardPercentage)) /
            _percentagePrecision /
            _ratioPrecision);

        if (neuroReward == 0) {
            revert ParanetErrors.NoEarnedReward(paranetId, msg.sender);
        }

        tracRewarded += tracSpent;
        claimedNeuro += neuroReward;
        kmr.setUnrewardedTracSpent(paranetId, 0);
        kmr.addCumulativeAwardedNeuro(paranetId, neuroReward);

        payable(msg.sender).transfer(neuroReward);
    }

    function _checkParanetOperator() internal view virtual {
        require(paranetsRegistry.getOperatorAddress(parentParanetId) == msg.sender, "Fn can only be used by operator");
    }

    function _checkParanetKnowledgeMiner() internal view virtual {
        require(
            paranetsRegistry.isKnowledgeMinerRegistered(parentParanetId, msg.sender),
            "Fn can only be used by K-Miners"
        );
    }
}
