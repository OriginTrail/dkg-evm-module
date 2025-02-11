// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {ParanetKnowledgeMinersRegistry} from "../storage/paranets/ParanetKnowledgeMinersRegistry.sol";
import {ParanetsRegistry} from "../storage/paranets/ParanetsRegistry.sol";
import {ParanetNeuroIncentivesPoolStorage} from "./ParanetNeuroIncentivesPoolStorage.sol";
import {KnowledgeCollectionStorage} from "../storage/KnowledgeCollectionStorage.sol";
import {Hub} from "../storage/Hub.sol";
import {INamed} from "../interfaces/INamed.sol";
import {IVersioned} from "../interfaces/IVersioned.sol";
import {ParanetLib} from "../libraries/ParanetLib.sol";

contract ParanetNeuroIncentivesPool is INamed, IVersioned {
    event NeuroEmissionMultiplierUpdateInitiated(uint256 oldMultiplier, uint256 newMultiplier, uint256 timestamp);
    event NeuroEmissionMultiplierUpdateFinalized(uint256 oldMultiplier, uint256 newMultiplier);

    string private constant _NAME = "ParanetNeuroIncentivesPool";
    string private constant _VERSION = "1.0.0";

    Hub public hub;
    ParanetsRegistry public paranetsRegistry;
    ParanetKnowledgeMinersRegistry public paranetKnowledgeMinersRegistry;
    ParanetNeuroIncentivesPoolStorage public paranetNeuroIncentivesPoolStorage;

    // Array of Total NEURO Emission Multipliers
    // Total NEURO Emission Multiplier = Ratio of how much NEURO is released per 1 TRAC spent
    //
    // Examples:
    //      1 * 10^12 = 1 NEURO per 1 TRAC
    //      0.5 * 10^12 = 5 * 10^11 = 0.5 NEURO per 1 TRAC
    //      1 = 1 NEURO wei per 1 TRAC
    //
    ParanetLib.NeuroEmissionMultiplier[] public neuroEmissionMultipliers;

    uint256 public neuroEmissionMultiplierUpdateDelay = 7 days;

    // solhint-disable-next-line no-empty-blocks
    constructor(
        address hubAddress,
        address knowledgeMinersRegistryAddress,
        address paranetNeuroIncentivesPoolStorageAddress,
        uint256 tracToNeuroEmissionMultiplier
    ) {
        hub = Hub(hubAddress);
        paranetKnowledgeMinersRegistry = ParanetKnowledgeMinersRegistry(knowledgeMinersRegistryAddress);
        paranetNeuroIncentivesPoolStorage = ParanetNeuroIncentivesPoolStorage(
            payable(paranetNeuroIncentivesPoolStorageAddress)
        );

        neuroEmissionMultipliers.push(
            ParanetLib.NeuroEmissionMultiplier({
                multiplier: tracToNeuroEmissionMultiplier,
                timestamp: block.timestamp,
                finalized: true
            })
        );
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

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function updateNeuroEmissionMultiplierUpdateDelay(uint256 newDelay) external onlyHubOwner {
        neuroEmissionMultiplierUpdateDelay = newDelay;
    }

    function voterClaimedNeuro(address addr) external view returns (uint256) {
        uint256 voterIndex = paranetNeuroIncentivesPoolStorage.votersIndexes(addr);

        // If the index is out of range or the stored voter doesn't match `voterAddress`,
        // return 0 as a default.
        if (
            voterIndex >= paranetNeuroIncentivesPoolStorage.getVotersCount() ||
            paranetNeuroIncentivesPoolStorage.getVoterAtIndex(voterIndex).addr != addr
        ) {
            return 0;
        }

        return paranetNeuroIncentivesPoolStorage.getVoterAtIndex(voterIndex).claimedNeuro;
    }

    function isKnowledgeMiner(address addr) public view returns (bool) {
        return paranetsRegistry.isKnowledgeMinerRegistered(paranetNeuroIncentivesPoolStorage.paranetId(), addr);
    }

    function isParanetOperator(address addr) public view returns (bool) {
        (address paranetKCStorageContract, uint256 paranetKCTokenId, uint256 paranetKATokenId) = paranetsRegistry
            .getParanetKnowledgeAssetLocator(paranetNeuroIncentivesPoolStorage.paranetId());

        KnowledgeCollectionStorage knowledgeCollectionStorage = KnowledgeCollectionStorage(paranetKCStorageContract);

        uint256 startTokenId = (paranetKCTokenId - 1) *
            knowledgeCollectionStorage.knowledgeCollectionMaxSize() +
            paranetKATokenId;

        uint256 ownedCountInRange = knowledgeCollectionStorage.balanceOf(addr, startTokenId, startTokenId + 1);

        return ownedCountInRange == 1;
    }

    function isProposalVoter(address addr) public view returns (bool) {
        return (paranetNeuroIncentivesPoolStorage.getVotersCount() != 0 &&
            paranetNeuroIncentivesPoolStorage
                .getVoterAtIndex(paranetNeuroIncentivesPoolStorage.votersIndexes(addr))
                .addr ==
            addr);
    }

    function getNeuroEmissionMultipliers() external view returns (ParanetLib.NeuroEmissionMultiplier[] memory) {
        return neuroEmissionMultipliers;
    }

    function getEffectiveNeuroEmissionMultiplier(uint256 timestamp) public view returns (uint256) {
        for (uint256 i = neuroEmissionMultipliers.length; i > 0; i--) {
            if (neuroEmissionMultipliers[i - 1].finalized && timestamp >= neuroEmissionMultipliers[i - 1].timestamp) {
                return neuroEmissionMultipliers[i - 1].multiplier;
            }
        }
        return neuroEmissionMultipliers[0].multiplier;
    }

    // TODO:Should there be some check of this value?
    function initiateNeuroEmissionMultiplierUpdate(uint256 newMultiplier) external onlyVotersRegistrar {
        if (!neuroEmissionMultipliers[neuroEmissionMultipliers.length - 1].finalized) {
            neuroEmissionMultipliers[neuroEmissionMultipliers.length - 1].multiplier = newMultiplier;
            neuroEmissionMultipliers[neuroEmissionMultipliers.length - 1].timestamp =
                block.timestamp +
                neuroEmissionMultiplierUpdateDelay;
        } else {
            neuroEmissionMultipliers.push(
                ParanetLib.NeuroEmissionMultiplier({
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
        require(neuroEmissionMultipliers.length > 0, "No emission multiplier updates");
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

    function getTotalKnowledgeMinerIncentiveEstimation() public view returns (uint256) {
        uint96 unrewardedTracSpent = paranetKnowledgeMinersRegistry.getUnrewardedTracSpent(
            msg.sender,
            paranetNeuroIncentivesPoolStorage.paranetId()
        );

        if (unrewardedTracSpent < ParanetLib.TOKENS_DIGITS_DIFF) {
            return 0;
        }

        // Unrewarded TRAC Spent = how much TRAC Knowledge Miner spent for Mining and haven't got a reward for
        // Effective Emission Ratio = Current active Multiplier for how much NEURO is released per TRAC spent
        //
        // Basic Formula:
        // Reward = UnrewardedTRAC * TotalEmissionRatio * (MinersRewardPercentage / 100)
        //
        // Example:
        // Let's say we have 10 unrewarded TRAC, 0.5 NEURO per TRAC Total Emission and 80% Miners Reward Percentage,
        // 10% Operator Reward Percentage, 10% Voters Reward Percentage
        // Reward = (((10 * 10^18) * (5 * 10^11)) / (10^18)) * (10,000 - 1,000 - 1,000) / 10,000) =
        // = 10 * 5 * 10^11 * 8,000 / 10,000 = 8/10 * (5 * 10^12) = 80% of 5 NEURO = 4 NEURO
        return
            (((unrewardedTracSpent * getEffectiveNeuroEmissionMultiplier(block.timestamp)) /
                ParanetLib.EMISSION_MULTIPLIER_SCALING_FACTOR) *
                (ParanetLib.PERCENTAGE_SCALING_FACTOR -
                    paranetNeuroIncentivesPoolStorage.paranetOperatorRewardPercentage() -
                    paranetNeuroIncentivesPoolStorage.paranetIncentivizationProposalVotersRewardPercentage())) /
            ParanetLib.PERCENTAGE_SCALING_FACTOR;
    }

    function getTotalAllKnowledgeMinersIncentiveEstimation() public view returns (uint256) {
        return
            _getIncentiveEstimation(
                ParanetLib.PERCENTAGE_SCALING_FACTOR -
                    paranetNeuroIncentivesPoolStorage.paranetOperatorRewardPercentage() -
                    paranetNeuroIncentivesPoolStorage.paranetIncentivizationProposalVotersRewardPercentage(),
                paranetNeuroIncentivesPoolStorage.totalMinersClaimedNeuro()
            );
    }

    function getClaimableKnowledgeMinerRewardAmount() public view returns (uint256) {
        uint256 neuroReward = getTotalKnowledgeMinerIncentiveEstimation();

        // Here we should have a limit for Knowledge Miners, which is determined by the % of the Miners Reward
        // and total NEURO received by the contract, so that Miners don't get tokens belonging to Operator/Voters
        // Following the example from the above, if we have 100 NEURO as a total reward, Miners should never get
        // more than 80 NEURO. minersRewardLimit = 80 NEURO
        uint256 totalMinersClaimedNeuro = paranetNeuroIncentivesPoolStorage.totalMinersClaimedNeuro();
        uint256 minersRewardLimit = ((paranetNeuroIncentivesPoolStorage.getBalance() +
            totalMinersClaimedNeuro +
            paranetNeuroIncentivesPoolStorage.totalOperatorsClaimedNeuro() +
            paranetNeuroIncentivesPoolStorage.totalVotersClaimedNeuro()) *
            (ParanetLib.PERCENTAGE_SCALING_FACTOR -
                paranetNeuroIncentivesPoolStorage.paranetOperatorRewardPercentage() -
                paranetNeuroIncentivesPoolStorage.paranetIncentivizationProposalVotersRewardPercentage())) /
            ParanetLib.PERCENTAGE_SCALING_FACTOR;

        return
            totalMinersClaimedNeuro + neuroReward <= minersRewardLimit
                ? neuroReward
                : minersRewardLimit - totalMinersClaimedNeuro;
    }

    function getClaimableAllKnowledgeMinersRewardAmount() public view returns (uint256) {
        uint256 neuroReward = getTotalAllKnowledgeMinersIncentiveEstimation();

        uint256 minersRewardLimit = ((paranetNeuroIncentivesPoolStorage.getBalance() +
            paranetNeuroIncentivesPoolStorage.totalMinersClaimedNeuro() +
            paranetNeuroIncentivesPoolStorage.totalOperatorsClaimedNeuro() +
            paranetNeuroIncentivesPoolStorage.totalVotersClaimedNeuro()) *
            (ParanetLib.PERCENTAGE_SCALING_FACTOR -
                paranetNeuroIncentivesPoolStorage.paranetOperatorRewardPercentage() -
                paranetNeuroIncentivesPoolStorage.paranetIncentivizationProposalVotersRewardPercentage())) /
            ParanetLib.PERCENTAGE_SCALING_FACTOR;

        return
            paranetNeuroIncentivesPoolStorage.totalMinersClaimedNeuro() + neuroReward <= minersRewardLimit
                ? neuroReward
                : minersRewardLimit - paranetNeuroIncentivesPoolStorage.totalMinersClaimedNeuro();
    }

    function claimKnowledgeMinerReward() external onlyParanetKnowledgeMiner {
        ParanetKnowledgeMinersRegistry pkmr = paranetKnowledgeMinersRegistry;

        uint256 neuroReward = getTotalKnowledgeMinerIncentiveEstimation();
        uint256 claimableNeuroReward = getClaimableKnowledgeMinerRewardAmount();

        // Use require here
        if (claimableNeuroReward == 0) {
            revert ParanetLib.NoRewardAvailable(paranetNeuroIncentivesPoolStorage.paranetId(), msg.sender);
        }

        // Updating the Unrewarded TRAC variable in the Knowledge Miner Profile
        // If limit for reward wasn't exceeded, we set Unrewarded TRAC to 0, otherwise we need to calculate
        // how many TRAC tokens were rewarded in this specific call and set variable to the amount that is left
        // unrewarded
        //
        // Example: We have 100 NEURO total reward. 80 NEURO is for Knowledge Miners. Total NEURO Emission Rate is
        // 0.5 NEURO per 1 TRAC. Knowledge Miner has 200 Unrewarded TRAC. 10% Operator Reward Percentage,
        // 10% Voters Reward Percentage
        //
        // neuroReward = 100 NEURO = 100 * 10^12
        // claimableNeuroReward = 80 NEURO = 80 * 10^12
        // newUnrewardedTracSpent = (100 * 10^12 - 80 * 10^12) * 10^18) / (5 * 10^11) = (20 * 10^30) / (5 * 10^11) =
        // = 40 * 10^18 = 40 TRAC
        pkmr.setUnrewardedTracSpent(
            msg.sender,
            paranetNeuroIncentivesPoolStorage.paranetId(),
            neuroReward == claimableNeuroReward
                ? 0
                : uint96(
                    ((neuroReward - claimableNeuroReward) * ParanetLib.EMISSION_MULTIPLIER_SCALING_FACTOR) /
                        getEffectiveNeuroEmissionMultiplier(block.timestamp)
                )
        );
        pkmr.addCumulativeAwardedNeuro(msg.sender, paranetNeuroIncentivesPoolStorage.paranetId(), claimableNeuroReward);

        if (
            paranetNeuroIncentivesPoolStorage.getClaimedMinerRewardsLength() == 0 ||
            paranetNeuroIncentivesPoolStorage
                .getClaimedMinerRewardsAtIndex(paranetNeuroIncentivesPoolStorage.claimedMinerRewardsIndexes(msg.sender))
                .addr !=
            msg.sender
        ) {
            paranetNeuroIncentivesPoolStorage.addMinerClaimedRewardProfile(msg.sender, claimableNeuroReward);
        } else {
            paranetNeuroIncentivesPoolStorage.addMinerClaimedReward(msg.sender, claimableNeuroReward);
        }
        paranetNeuroIncentivesPoolStorage.addTotalMinersClaimedNeuro(claimableNeuroReward);

        paranetNeuroIncentivesPoolStorage.transferReward(msg.sender, claimableNeuroReward);
    }

    function getTotalParanetOperatorIncentiveEstimation() public view returns (uint256) {
        return
            _getIncentiveEstimation(
                paranetNeuroIncentivesPoolStorage.paranetOperatorRewardPercentage(),
                paranetNeuroIncentivesPoolStorage.totalOperatorsClaimedNeuro()
            );
    }

    function getClaimableParanetOperatorRewardAmount() public view returns (uint256) {
        uint256 neuroReward = getTotalParanetOperatorIncentiveEstimation();

        uint256 operatorRewardLimit = ((address(this).balance +
            paranetNeuroIncentivesPoolStorage.totalMinersClaimedNeuro() +
            paranetNeuroIncentivesPoolStorage.totalOperatorsClaimedNeuro() +
            paranetNeuroIncentivesPoolStorage.totalVotersClaimedNeuro()) *
            paranetNeuroIncentivesPoolStorage.paranetOperatorRewardPercentage()) / ParanetLib.PERCENTAGE_SCALING_FACTOR;

        return
            paranetNeuroIncentivesPoolStorage.totalOperatorsClaimedNeuro() + neuroReward <= operatorRewardLimit
                ? neuroReward
                : operatorRewardLimit - paranetNeuroIncentivesPoolStorage.totalOperatorsClaimedNeuro();
    }

    function claimParanetOperatorReward() external onlyParanetOperator {
        uint256 claimableNeuroReward = getClaimableParanetOperatorRewardAmount();

        if (claimableNeuroReward == 0) {
            revert ParanetLib.NoRewardAvailable(paranetNeuroIncentivesPoolStorage.paranetId(), msg.sender);
        }

        if (
            paranetNeuroIncentivesPoolStorage.getClaimedOperatorRewardsLength() == 0 ||
            paranetNeuroIncentivesPoolStorage
                .getClaimedOperatorRewardsAtIndex(
                    paranetNeuroIncentivesPoolStorage.claimedOperatorRewardsIndexes(msg.sender)
                )
                .addr !=
            msg.sender
        ) {
            paranetNeuroIncentivesPoolStorage.addOperatorClaimedRewardsProfile(msg.sender, claimableNeuroReward);
        } else {
            paranetNeuroIncentivesPoolStorage.addClaimedOperatorReward(msg.sender, claimableNeuroReward);
        }
        paranetNeuroIncentivesPoolStorage.addTotalOperatorsClaimedNeuro(claimableNeuroReward);

        paranetNeuroIncentivesPoolStorage.transferReward(msg.sender, claimableNeuroReward);
    }

    function getTotalProposalVoterIncentiveEstimation() public view returns (uint256) {
        uint256 effectiveNeuroEmissionMultiplier = getEffectiveNeuroEmissionMultiplier(block.timestamp);
        uint96 cumulativeKnowledgeValueSingleVoterPart = (((paranetsRegistry.getCumulativeKnowledgeValue(
            paranetNeuroIncentivesPoolStorage.paranetId()
        ) * paranetNeuroIncentivesPoolStorage.paranetIncentivizationProposalVotersRewardPercentage()) /
            ParanetLib.PERCENTAGE_SCALING_FACTOR) *
            paranetNeuroIncentivesPoolStorage
                .getVoterAtIndex(paranetNeuroIncentivesPoolStorage.votersIndexes(msg.sender))
                .weight) / ParanetLib.MAX_CUMULATIVE_VOTERS_WEIGHT;
        uint96 rewardedTracSpentSingleVoterPart = uint96(
            (paranetNeuroIncentivesPoolStorage
                .getVoterAtIndex(paranetNeuroIncentivesPoolStorage.votersIndexes(msg.sender))
                .claimedNeuro * ParanetLib.EMISSION_MULTIPLIER_SCALING_FACTOR) / effectiveNeuroEmissionMultiplier
        );

        if (
            cumulativeKnowledgeValueSingleVoterPart - rewardedTracSpentSingleVoterPart < ParanetLib.TOKENS_DIGITS_DIFF
        ) {
            return 0;
        }

        return
            ((cumulativeKnowledgeValueSingleVoterPart * effectiveNeuroEmissionMultiplier) /
                ParanetLib.EMISSION_MULTIPLIER_SCALING_FACTOR) -
            paranetNeuroIncentivesPoolStorage
                .getVoterAtIndex(paranetNeuroIncentivesPoolStorage.votersIndexes(msg.sender))
                .claimedNeuro;
    }

    function getTotalAllProposalVotersIncentiveEstimation() public view returns (uint256) {
        return
            _getIncentiveEstimation(
                paranetNeuroIncentivesPoolStorage.paranetIncentivizationProposalVotersRewardPercentage(),
                paranetNeuroIncentivesPoolStorage.totalVotersClaimedNeuro()
            );
    }

    function getClaimableProposalVoterRewardAmount() public view returns (uint256) {
        if (
            paranetNeuroIncentivesPoolStorage.getVotersCount() == 0 ||
            paranetNeuroIncentivesPoolStorage
                .getVoterAtIndex(paranetNeuroIncentivesPoolStorage.votersIndexes(msg.sender))
                .addr !=
            msg.sender
        ) {
            return 0;
        }

        uint256 neuroReward = getTotalProposalVoterIncentiveEstimation();

        uint256 voterRewardLimit = ((((paranetNeuroIncentivesPoolStorage.getBalance() +
            paranetNeuroIncentivesPoolStorage.totalMinersClaimedNeuro() +
            paranetNeuroIncentivesPoolStorage.totalOperatorsClaimedNeuro() +
            paranetNeuroIncentivesPoolStorage.totalVotersClaimedNeuro()) *
            paranetNeuroIncentivesPoolStorage.paranetIncentivizationProposalVotersRewardPercentage()) /
            ParanetLib.PERCENTAGE_SCALING_FACTOR) *
            paranetNeuroIncentivesPoolStorage
                .getVoterAtIndex(paranetNeuroIncentivesPoolStorage.votersIndexes(msg.sender))
                .weight) / ParanetLib.MAX_CUMULATIVE_VOTERS_WEIGHT;

        return
            paranetNeuroIncentivesPoolStorage
                .getVoterAtIndex(paranetNeuroIncentivesPoolStorage.votersIndexes(msg.sender))
                .claimedNeuro +
                neuroReward <=
                voterRewardLimit
                ? neuroReward
                : voterRewardLimit -
                    paranetNeuroIncentivesPoolStorage
                        .getVoterAtIndex(paranetNeuroIncentivesPoolStorage.votersIndexes(msg.sender))
                        .claimedNeuro;
    }

    function getClaimableAllProposalVotersRewardAmount() public view returns (uint256) {
        uint256 neuroReward = getTotalAllProposalVotersIncentiveEstimation();

        uint256 votersRewardLimit = ((address(this).balance +
            paranetNeuroIncentivesPoolStorage.totalMinersClaimedNeuro() +
            paranetNeuroIncentivesPoolStorage.totalOperatorsClaimedNeuro() +
            paranetNeuroIncentivesPoolStorage.totalVotersClaimedNeuro()) *
            paranetNeuroIncentivesPoolStorage.paranetIncentivizationProposalVotersRewardPercentage()) /
            ParanetLib.PERCENTAGE_SCALING_FACTOR;

        return
            paranetNeuroIncentivesPoolStorage.totalVotersClaimedNeuro() + neuroReward <= votersRewardLimit
                ? neuroReward
                : votersRewardLimit - paranetNeuroIncentivesPoolStorage.totalVotersClaimedNeuro();
    }

    function claimIncentivizationProposalVoterReward() external onlyParanetIncentivizationProposalVoter {
        if (paranetNeuroIncentivesPoolStorage.cumulativeVotersWeight() != ParanetLib.MAX_CUMULATIVE_VOTERS_WEIGHT) {
            revert ParanetLib.InvalidCumulativeVotersWeight(
                paranetNeuroIncentivesPoolStorage.paranetId(),
                paranetNeuroIncentivesPoolStorage.cumulativeVotersWeight(),
                ParanetLib.MAX_CUMULATIVE_VOTERS_WEIGHT
            );
        }

        uint256 claimableNeuroReward = getClaimableProposalVoterRewardAmount();

        if (claimableNeuroReward == 0) {
            revert ParanetLib.NoRewardAvailable(paranetNeuroIncentivesPoolStorage.paranetId(), msg.sender);
        }

        paranetNeuroIncentivesPoolStorage
            .getVoterAtIndex(paranetNeuroIncentivesPoolStorage.votersIndexes(msg.sender))
            .claimedNeuro += claimableNeuroReward;
        paranetNeuroIncentivesPoolStorage.addTotalVotersClaimedNeuro(claimableNeuroReward);

        paranetNeuroIncentivesPoolStorage.transferReward(msg.sender, claimableNeuroReward);
    }

    function _getIncentiveEstimation(
        uint16 rewardPercentage,
        uint256 totalClaimedNeuro
    ) internal view returns (uint256) {
        uint256 effectiveNeuroEmissionMultiplier = getEffectiveNeuroEmissionMultiplier(block.timestamp);
        uint96 cumulativeKnowledgeValuePart = (paranetsRegistry.getCumulativeKnowledgeValue(
            paranetNeuroIncentivesPoolStorage.paranetId()
        ) * rewardPercentage) / ParanetLib.PERCENTAGE_SCALING_FACTOR;
        uint96 rewardedTracSpentPart = uint96(
            (totalClaimedNeuro * ParanetLib.EMISSION_MULTIPLIER_SCALING_FACTOR) / effectiveNeuroEmissionMultiplier
        );

        if (cumulativeKnowledgeValuePart - rewardedTracSpentPart < ParanetLib.TOKENS_DIGITS_DIFF) {
            return 0;
        }

        return
            ((cumulativeKnowledgeValuePart * effectiveNeuroEmissionMultiplier) /
                ParanetLib.EMISSION_MULTIPLIER_SCALING_FACTOR) - totalClaimedNeuro;
    }

    function _checkHubOwner() internal view virtual {
        require(msg.sender == hub.owner(), "Fn can only be used by hub owner");
    }

    function _checkVotersRegistrar() internal view virtual {
        require(msg.sender == paranetNeuroIncentivesPoolStorage.votersRegistrar(), "Fn can only be used by registrar");
    }

    function _checkParanetOperator() internal view virtual {
        require(isParanetOperator(msg.sender), "Fn can only be used by operator");
    }

    function _checkParanetIncentivizationProposalVoter() internal view virtual {
        require(isProposalVoter(msg.sender), "Fn can only be used by voter");
    }

    function _checkParanetKnowledgeMiner() internal view virtual {
        require(isKnowledgeMiner(msg.sender), "Fn can only be used by K-Miners");
    }
}
