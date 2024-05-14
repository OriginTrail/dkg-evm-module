// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {ParanetKnowledgeMinersRegistry} from "../storage/paranets/ParanetKnowledgeMinersRegistry.sol";
import {ParanetsRegistry} from "../storage/paranets/ParanetsRegistry.sol";
import {ParanetErrors} from "../errors/paranets/ParanetErrors.sol";
import {ParanetStructs} from "../structs/paranets/ParanetStructs.sol";

contract ParanetIncentivesPool {
    event Deposit(address indexed sender, uint256 amount);

    ParanetsRegistry public paranetsRegistry;
    ParanetKnowledgeMinersRegistry public paranetKnowledgeMinersRegistry;

    bytes32 public parentParanetId;

    uint64 constant RATIO_SCALING_FACTOR = 10 ** 18;
    uint16 constant PERCENTAGE_SCALING_FACTOR = 10 ** 4;

    uint256 public totalNeuroReceived;
    uint256 public tracToNeuroRatio;
    uint256 public minersClaimedNeuro;
    uint256 public operatorClaimedNeuro;
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
        paranetKnowledgeMinersRegistry = ParanetKnowledgeMinersRegistry(knowledgeMinersRegistryAddress);

        parentParanetId = paranetId;
        tracToNeuroRatio = tracToNeuroRatio_;
        tracTarget = tracTarget_;
        operatorRewardPercentage = operatorRewardPercentage_;
    }

    modifier onlyWhenPoolActive() {
        _checkPoolActive();
        _;
    }

    modifier onlyParanetOperator() {
        _checkParanetOperator();
        _;
    }

    modifier onlyParanetKnowledgeMiner() {
        _checkParanetKnowledgeMiner();
        _;
    }

    receive() external payable {
        totalNeuroReceived += msg.value;

        emit Deposit(msg.sender, msg.value);
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function getParanetOperatorReward() external onlyWhenPoolActive onlyParanetOperator {
        uint256 operatorReward = ((totalNeuroReceived * tracRewarded) / tracTarget) -
            (minersClaimedNeuro + operatorClaimedNeuro);

        if (operatorReward == 0) {
            revert ParanetErrors.NoOperatorRewardAvailable(parentParanetId);
        }

        operatorClaimedNeuro += operatorReward;

        payable(msg.sender).transfer(operatorReward);
    }

    function getKnowledgeMinerReward() external onlyWhenPoolActive onlyParanetKnowledgeMiner {
        if (tracRewarded == tracTarget) {
            revert ParanetErrors.TracTargetAchieved(parentParanetId, tracTarget);
        }

        ParanetKnowledgeMinersRegistry pkmr = paranetKnowledgeMinersRegistry;

        uint96 tracSpent = pkmr.getUnrewardedTracSpent(msg.sender, parentParanetId);
        uint96 tracToBeRewarded = tracRewarded + tracSpent > tracTarget ? tracTarget - tracRewarded : tracSpent;

        uint256 neuroReward = ((totalNeuroReceived *
            (tracRewarded + tracToBeRewarded) *
            (PERCENTAGE_SCALING_FACTOR - operatorRewardPercentage)) /
            tracTarget /
            PERCENTAGE_SCALING_FACTOR) - minersClaimedNeuro;

        if (neuroReward == 0) {
            revert ParanetErrors.NoKnowledgeMinerRewardAvailable(parentParanetId, msg.sender);
        }

        tracRewarded += tracToBeRewarded;
        minersClaimedNeuro += neuroReward;
        pkmr.setUnrewardedTracSpent(msg.sender, parentParanetId, 0);
        pkmr.addCumulativeAwardedNeuro(msg.sender, parentParanetId, neuroReward);

        payable(msg.sender).transfer(neuroReward);
    }

    function _checkPoolActive() internal view virtual {
        require(totalNeuroReceived >= (tracToNeuroRatio * tracTarget) / RATIO_SCALING_FACTOR, "Pool is inactive");
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
