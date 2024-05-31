// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {ParanetKnowledgeMinersRegistry} from "../storage/paranets/ParanetKnowledgeMinersRegistry.sol";
import {ParanetsRegistry} from "../storage/paranets/ParanetsRegistry.sol";
import {HubV2} from "../Hub.sol";
import {ParanetErrors} from "../errors/paranets/ParanetErrors.sol";
import {ParanetStructs} from "../structs/paranets/ParanetStructs.sol";

contract ParanetIncentivesPool {
    event RewardDeposit(address indexed sender, uint256 amount);
    event KnowledgeMinerRewardClaimed(address indexed miner, uint256 amount);
    event ParanetOperatorRewardClaimed(address indexed operator, uint256 amount);

    uint64 constant RATIO_SCALING_FACTOR = 10 ** 18;
    uint16 constant PERCENTAGE_SCALING_FACTOR = 10 ** 4;
    uint16 constant VOTERS_WEIGHTS_SCALING_FACTOR = 10 ** 4;

    HubV2 public hub;
    ParanetsRegistry public paranetsRegistry;
    ParanetKnowledgeMinersRegistry public paranetKnowledgeMinersRegistry;

    bytes32 public parentParanetId;
    uint256 public tracToNeuroEmissionMultiplier;
    uint16 public paranetOperatorRewardPercentage;
    uint16 public paranetIncentivizationProposalVotersRewardPercentage;

    uint256 public totalNeuroReceived;

    uint256 public claimedMinersNeuro;
    uint256 public claimedOperatorNeuro;

    mapping(address => ParanetStructs.ParanetIncentivizationProposalVoter) public voters;

    // solhint-disable-next-line no-empty-blocks
    constructor(
        address hubAddress,
        address paranetsRegistryAddress,
        address knowledgeMinersRegistryAddress,
        bytes32 paranetId,
        uint256 tracToNeuroEmissionMultiplier_,
        uint16 paranetOperatorRewardPercentage_,
        uint16 paranetIncentivizationProposalVotersRewardPercentage_
    ) {
        require(
            paranetOperatorRewardPercentage_ + paranetIncentivizationProposalVotersRewardPercentage_ <
                PERCENTAGE_SCALING_FACTOR
        );

        hub = HubV2(hubAddress);
        paranetsRegistry = ParanetsRegistry(paranetsRegistryAddress);
        paranetKnowledgeMinersRegistry = ParanetKnowledgeMinersRegistry(knowledgeMinersRegistryAddress);

        parentParanetId = paranetId;
        tracToNeuroEmissionMultiplier = tracToNeuroEmissionMultiplier_;
        paranetOperatorRewardPercentage = paranetOperatorRewardPercentage_;
        paranetIncentivizationProposalVotersRewardPercentage = paranetIncentivizationProposalVotersRewardPercentage_;
    }

    modifier onlyHubOwner() {
        _checkHubOwner();
        _;
    }

    modifier onlyParanetOperator() {
        _checkParanetOperator();
        _;
    }

    modifier onlyParanetIncentivizationProposalVoter() {
        _checkParanetIncentivizationProposalVoter();
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

    function addVoters(
        ParanetStructs.ParanetIncentivizationProposalVoterInput[] calldata voters_
    ) external onlyHubOwner {
        uint16 cumulativeWeight;

        for (uint i; i < voters_.length; ) {
            voters[voters_[i].addr] = ParanetStructs.ParanetIncentivizationProposalVoter({
                addr: voters_[i].addr,
                weight: voters_[i].weight,
                claimedNeuro: 0
            });

            cumulativeWeight += uint16(voters_[i].weight);

            unchecked {
                i++;
            }
        }

        require(cumulativeWeight == VOTERS_WEIGHTS_SCALING_FACTOR, "Invalid cumulative weight");
    }

    function claimKnowledgeMinerReward() external onlyParanetKnowledgeMiner {
        ParanetKnowledgeMinersRegistry pkmr = paranetKnowledgeMinersRegistry;

        uint256 neuroReward = (((pkmr.getUnrewardedTracSpent(msg.sender, parentParanetId) *
            tracToNeuroEmissionMultiplier) / RATIO_SCALING_FACTOR) *
            (PERCENTAGE_SCALING_FACTOR -
                paranetOperatorRewardPercentage -
                paranetIncentivizationProposalVotersRewardPercentage)) / PERCENTAGE_SCALING_FACTOR;
        uint256 totalMinersReward = (totalNeuroReceived *
            (PERCENTAGE_SCALING_FACTOR -
                paranetOperatorRewardPercentage -
                paranetIncentivizationProposalVotersRewardPercentage)) / PERCENTAGE_SCALING_FACTOR;
        uint256 claimableNeuroReward = claimedMinersNeuro + neuroReward <= totalMinersReward
            ? neuroReward
            : totalMinersReward - claimedMinersNeuro;

        if (claimableNeuroReward == 0) {
            revert ParanetErrors.NoKnowledgeMinerRewardAvailable(parentParanetId, msg.sender);
        }

        pkmr.setUnrewardedTracSpent(
            msg.sender,
            parentParanetId,
            uint96(
                ((((neuroReward - claimableNeuroReward) * RATIO_SCALING_FACTOR) / tracToNeuroEmissionMultiplier) *
                    PERCENTAGE_SCALING_FACTOR) /
                    (PERCENTAGE_SCALING_FACTOR -
                        paranetOperatorRewardPercentage -
                        paranetIncentivizationProposalVotersRewardPercentage)
            )
        );
        pkmr.addCumulativeAwardedNeuro(msg.sender, parentParanetId, claimableNeuroReward);

        claimedMinersNeuro += claimableNeuroReward;

        payable(msg.sender).transfer(claimableNeuroReward);

        emit KnowledgeMinerRewardClaimed(msg.sender, claimableNeuroReward);
    }

    function claimParanetOperatorReward() external onlyParanetOperator {
        uint256 claimableNeuroReward = (((paranetsRegistry.getCumulativeKnowledgeValue(parentParanetId) *
            tracToNeuroEmissionMultiplier) / RATIO_SCALING_FACTOR) * paranetOperatorRewardPercentage) /
            PERCENTAGE_SCALING_FACTOR -
            claimedOperatorNeuro;

        if (claimableNeuroReward == 0) {
            revert ParanetErrors.NoOperatorRewardAvailable(parentParanetId);
        }

        claimedOperatorNeuro += claimableNeuroReward;

        payable(msg.sender).transfer(claimableNeuroReward);

        emit ParanetOperatorRewardClaimed(msg.sender, claimableNeuroReward);
    }

    function claimIncentivizationProposalVoterReward() external onlyParanetIncentivizationProposalVoter {
        uint256 claimableNeuroReward = (((((paranetsRegistry.getCumulativeKnowledgeValue(parentParanetId) *
            tracToNeuroEmissionMultiplier) / RATIO_SCALING_FACTOR) *
            paranetIncentivizationProposalVotersRewardPercentage) / PERCENTAGE_SCALING_FACTOR) *
            voters[msg.sender].weight) /
            VOTERS_WEIGHTS_SCALING_FACTOR -
            voters[msg.sender].claimedNeuro;

        if (claimableNeuroReward == 0) {
            revert ParanetErrors.NoVotersRewardAvailable(parentParanetId);
        }

        voters[msg.sender].claimedNeuro += claimableNeuroReward;

        payable(msg.sender).transfer(claimableNeuroReward);

        emit ParanetOperatorRewardClaimed(msg.sender, claimableNeuroReward);
    }

    function _checkHubOwner() internal view virtual {
        require(msg.sender == hub.owner(), "Fn can only be used by hub owner");
    }

    function _checkParanetOperator() internal view virtual {
        require(paranetsRegistry.getOperatorAddress(parentParanetId) == msg.sender, "Fn can only be used by operator");
    }

    function _checkParanetIncentivizationProposalVoter() internal view virtual {
        require(voters[msg.sender].addr == msg.sender, "Fn can only be used by voter");
    }

    function _checkParanetKnowledgeMiner() internal view virtual {
        require(
            paranetsRegistry.isKnowledgeMinerRegistered(parentParanetId, msg.sender),
            "Fn can only be used by K-Miners"
        );
    }
}
