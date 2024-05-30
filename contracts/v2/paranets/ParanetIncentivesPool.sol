// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {ParanetKnowledgeMinersRegistry} from "../storage/paranets/ParanetKnowledgeMinersRegistry.sol";
import {ParanetsRegistry} from "../storage/paranets/ParanetsRegistry.sol";
import {ParanetErrors} from "../errors/paranets/ParanetErrors.sol";
import {ParanetStructs} from "../structs/paranets/ParanetStructs.sol";

contract ParanetIncentivesPool {
    event RewardDeposit(address indexed sender, uint256 amount);
    event KnowledgeMinerRewardClaimed(address indexed miner, uint256 amount);
    event ParanetOperatorRewardClaimed(address indexed operator, uint256 amount);

    ParanetsRegistry public paranetsRegistry;
    ParanetKnowledgeMinersRegistry public paranetKnowledgeMinersRegistry;

    bytes32 public parentParanetId;

    uint64 constant RATIO_SCALING_FACTOR = 10 ** 18;
    uint16 constant PERCENTAGE_SCALING_FACTOR = 10 ** 4;

    uint256 public tracToNeuroMinerEmissionMultiplier;
    uint256 public tracToNeuroOperatorEmissionMultiplier;
    uint256 public tracToNeuroVoterEmissionMultiplier;

    uint256 public operatorClaimedNeuro;
    mapping(address => uint256) public votersClaimedNeuro;

    // solhint-disable-next-line no-empty-blocks
    constructor(
        address paranetsRegistryAddress,
        address knowledgeMinersRegistryAddress,
        bytes32 paranetId,
        uint256 tracToNeuroRatio_,
        uint96 tracTarget_,
        uint16 operatorRewardPercentage_,
        ParanetStructs.ParanetIncentivizationProposalVoterInput[] voters
    ) {
        paranetsRegistry = ParanetsRegistry(paranetsRegistryAddress);
        paranetKnowledgeMinersRegistry = ParanetKnowledgeMinersRegistry(knowledgeMinersRegistryAddress);

        parentParanetId = paranetId;
        tracToNeuroRatio = tracToNeuroRatio_;
        tracTarget = tracTarget_;
        operatorRewardPercentage = operatorRewardPercentage_;
    }

    // 1000 NEURO
    // 1:1 ratio
    // Miner submits 500 TRAC -- gets 50% of rewards
    // Somebody sends 1000 more NEURO to the contract
    // Total NEURO changes to 2000
    // And it changes all the percentages
    //
    // MinersSpentTrac - 500 TRAC, 500 NEURO
    // Operator (assuming 10% operator fee) can claim 50 NEURO
    //
    // Voters (5%)
    // Same logic as for Operators

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

        emit RewardDeposit(msg.sender, msg.value);
    }

    function getNeuroBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function claimParanetOperatorReward() external onlyParanetOperator {
        uint256 operatorReward = ((totalNeuroReceived * tracRewarded) / tracTarget) -
            (minersClaimedNeuro + operatorClaimedNeuro);

        if (operatorReward == 0) {
            revert ParanetErrors.NoOperatorRewardAvailable(parentParanetId);
        }

        operatorClaimedNeuro += operatorReward;

        payable(msg.sender).transfer(operatorReward);

        emit ParanetOperatorRewardClaimed(msg.sender, operatorReward);
    }

    function claimIncentivizationVoterReward() {}

    function claimKnowledgeMinerReward() external onlyParanetKnowledgeMiner {
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

        emit KnowledgeMinerRewardClaimed(msg.sender, neuroReward);
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
