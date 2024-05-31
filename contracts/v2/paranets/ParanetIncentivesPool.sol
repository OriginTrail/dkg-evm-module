// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {ParanetKnowledgeMinersRegistry} from "../storage/paranets/ParanetKnowledgeMinersRegistry.sol";
import {ParanetsRegistry} from "../storage/paranets/ParanetsRegistry.sol";
import {HubV2} from "../Hub.sol";
import {ParanetErrors} from "../errors/paranets/ParanetErrors.sol";
import {ParanetStructs} from "../structs/paranets/ParanetStructs.sol";

contract ParanetIncentivesPool {
    event RewardDeposit(address indexed sender, uint256 amount);
    event NeuroEmissionMultiplierUpdateInitiated(uint256 oldMultiplier, uint256 newMultiplier, uint256 timestamp);
    event NeuroEmissionMultiplierUpdateFinalized(uint256 oldMultiplier, uint256 newMultiplier);
    event KnowledgeMinerRewardClaimed(address indexed miner, uint256 amount);
    event ParanetOperatorRewardClaimed(address indexed operator, uint256 amount);

    HubV2 public hub;
    ParanetsRegistry public paranetsRegistry;
    ParanetKnowledgeMinersRegistry public paranetKnowledgeMinersRegistry;

    bytes32 public parentParanetId;
    ParanetStructs.NeuroEmissionMultiplier[] public neuroEmissionMultipliers;

    uint256 public neuroEmissionMultiplierUpdateDelay = 7 days;

    uint64 constant EMISSION_MULTIPLIER_SCALING_FACTOR = 10 ** 18;
    uint16 constant PERCENTAGE_SCALING_FACTOR = 10 ** 4;
    uint16 constant VOTERS_WEIGHTS_SCALING_FACTOR = 10 ** 4;

    uint16 public paranetOperatorRewardPercentage;
    uint16 public paranetIncentivizationProposalVotersRewardPercentage;

    address public votersRegistrar;

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
        uint256 tracToNeuroEmissionMultiplier,
        uint16 paranetOperatorRewardPercentage_,
        uint16 paranetIncentivizationProposalVotersRewardPercentage_
    ) {
        require(tracToNeuroEmissionMultiplier <= EMISSION_MULTIPLIER_SCALING_FACTOR);
        require(
            paranetOperatorRewardPercentage_ + paranetIncentivizationProposalVotersRewardPercentage_ <
                PERCENTAGE_SCALING_FACTOR
        );

        hub = HubV2(hubAddress);
        paranetsRegistry = ParanetsRegistry(paranetsRegistryAddress);
        paranetKnowledgeMinersRegistry = ParanetKnowledgeMinersRegistry(knowledgeMinersRegistryAddress);

        parentParanetId = paranetId;
        neuroEmissionMultipliers.push(
            ParanetStructs.NeuroEmissionMultiplier({
                multiplier: tracToNeuroEmissionMultiplier,
                timestamp: block.timestamp,
                finalized: true
            })
        );
        paranetOperatorRewardPercentage = paranetOperatorRewardPercentage_;
        paranetIncentivizationProposalVotersRewardPercentage = paranetIncentivizationProposalVotersRewardPercentage_;
        votersRegistrar = hub.owner();
    }

    modifier onlyHubOwner() {
        _checkHubOwner();
        _;
    }

    modifier onlyVotersRegistrar() {
        _checkVotersRegistrar();
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

    function updateNeuroEmissionMultiplierUpdateDelay(uint256 newDelay) external onlyHubOwner {
        neuroEmissionMultiplierUpdateDelay = newDelay;
    }

    function transferVotersRegistrarRole(address newRegistrar) external onlyVotersRegistrar {
        votersRegistrar = newRegistrar;
    }

    function addVoters(
        ParanetStructs.ParanetIncentivizationProposalVoterInput[] calldata voters_
    ) external onlyVotersRegistrar {
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

    function getEffectiveEmissionRatio(uint256 timestamp) public view returns (uint256) {
        for (uint256 i = neuroEmissionMultipliers.length; i > 0; i--) {
            if (neuroEmissionMultipliers[i - 1].finalized && timestamp >= neuroEmissionMultipliers[i - 1].timestamp) {
                return neuroEmissionMultipliers[i - 1].multiplier;
            }
        }
        return neuroEmissionMultipliers[0].multiplier;
    }

    function initiateNeuroEmissionMultiplierUpdate(uint256 newMultiplier) external onlyVotersRegistrar {
        if (!neuroEmissionMultipliers[neuroEmissionMultipliers.length - 1].finalized) {
            neuroEmissionMultipliers[neuroEmissionMultipliers.length - 1].multiplier = newMultiplier;
            neuroEmissionMultipliers[neuroEmissionMultipliers.length - 1].timestamp =
                block.timestamp +
                neuroEmissionMultiplierUpdateDelay;
        } else {
            neuroEmissionMultipliers.push(
                ParanetStructs.NeuroEmissionMultiplier({
                    multiplier: newMultiplier,
                    timestamp: block.timestamp + neuroEmissionMultiplierUpdateDelay,
                    finalized: false
                })
            );
        }

        emit NeuroEmissionMultiplierUpdateInitiated(
            neuroEmissionMultipliers[neuroEmissionMultipliers.length - 2].multiplier,
            newMultiplier,
            block.timestamp + neuroEmissionMultiplierUpdateDelay
        );
    }

    function finalizeNeuroEmissionMultiplierUpdate() external onlyVotersRegistrar {
        require(neuroEmissionMultipliers.length > 0, "No emission multiplier updates initiated");
        require(
            !neuroEmissionMultipliers[neuroEmissionMultipliers.length - 1].finalized,
            "Last update already finalized"
        );
        require(
            block.timestamp >= neuroEmissionMultipliers[neuroEmissionMultipliers.length - 1].timestamp,
            "Delay period not yet passed"
        );

        neuroEmissionMultipliers[neuroEmissionMultipliers.length - 1].finalized = true;

        emit NeuroEmissionMultiplierUpdateFinalized(
            neuroEmissionMultipliers[neuroEmissionMultipliers.length - 2].multiplier,
            neuroEmissionMultipliers[neuroEmissionMultipliers.length - 1].multiplier
        );
    }

    function claimKnowledgeMinerReward() external onlyParanetKnowledgeMiner {
        ParanetKnowledgeMinersRegistry pkmr = paranetKnowledgeMinersRegistry;

        uint256 neuroReward = (((pkmr.getUnrewardedTracSpent(msg.sender, parentParanetId) *
            getEffectiveEmissionRatio(block.timestamp)) / EMISSION_MULTIPLIER_SCALING_FACTOR) *
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
                ((((neuroReward - claimableNeuroReward) * EMISSION_MULTIPLIER_SCALING_FACTOR) /
                    getEffectiveEmissionRatio(block.timestamp)) * PERCENTAGE_SCALING_FACTOR) /
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
            getEffectiveEmissionRatio(block.timestamp)) / EMISSION_MULTIPLIER_SCALING_FACTOR) *
            paranetOperatorRewardPercentage) /
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
            getEffectiveEmissionRatio(block.timestamp)) / EMISSION_MULTIPLIER_SCALING_FACTOR) *
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

    function _checkVotersRegistrar() internal view virtual {
        require(msg.sender == votersRegistrar, "Fn can only be used by registrar");
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
