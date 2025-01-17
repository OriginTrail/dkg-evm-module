// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {ParanetKnowledgeMinersRegistry} from "../storage/paranets/ParanetKnowledgeMinersRegistry.sol";
import {ParanetsRegistry} from "../storage/paranets/ParanetsRegistry.sol";
import {KnowledgeCollectionStorage} from "../storage/KnowledgeCollectionStorage.sol";
import {Hub} from "../storage/Hub.sol";
import {INamed} from "../interfaces/INamed.sol";
import {IVersioned} from "../interfaces/IVersioned.sol";
import {ParanetLib} from "../libraries/ParanetLib.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract ParanetNeuroIncentivesPool is INamed, IVersioned {
    event NeuroRewardDeposit(address indexed sender, uint256 amount);
    event NeuroEmissionMultiplierUpdateInitiated(uint256 oldMultiplier, uint256 newMultiplier, uint256 timestamp);
    event NeuroEmissionMultiplierUpdateFinalized(uint256 oldMultiplier, uint256 newMultiplier);
    event ParanetKnowledgeMinerRewardClaimed(address indexed miner, uint256 amount);
    event ParanetOperatorRewardClaimed(address indexed operator, uint256 amount);
    event ParanetIncentivizationProposalVoterRewardClaimed(address indexed voter, uint256 amount);

    string private constant _NAME = "ParanetNeuroIncentivesPool";
    string private constant _VERSION = "1.0.0";

    Hub public hub;
    IERC20 public token;
    ParanetsRegistry public paranetsRegistry;
    ParanetKnowledgeMinersRegistry public paranetKnowledgeMinersRegistry;

    bytes32 public parentParanetId;
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

    // Percentage of how much tokens from total NEURO emission goes to the Paranet Operator
    // Minimum: 0, Maximum: 10,000 (which is 100%)
    uint16 public paranetOperatorRewardPercentage;
    // Percentage of how much tokens from total NEURO emission goes to the Paranet Incentivization
    // Proposal Voters. Minimum: 0, Maximum: 10,000 (which is 100%)
    uint16 public paranetIncentivizationProposalVotersRewardPercentage;
    uint16 public cumulativeVotersWeight;

    // Address which can set Voters list and update Total NEURO Emission multiplier
    address public votersRegistrar;

    uint256 public totalMinersClaimedNeuro;
    uint256 public totalOperatorsClaimedNeuro;
    uint256 public totalVotersClaimedNeuro;

    ParanetLib.ParanetIncentivesPoolClaimedRewardsProfile[] public claimedMinerRewards;
    mapping(address => uint256) public claimedMinerRewardsIndexes;

    ParanetLib.ParanetIncentivesPoolClaimedRewardsProfile[] public claimedOperatorRewards;
    mapping(address => uint256) public claimedOperatorRewardsIndexes;

    ParanetLib.ParanetIncentivizationProposalVoter[] public voters;
    mapping(address => uint256) public votersIndexes;

    // solhint-disable-next-line no-empty-blocks
    constructor(
        address hubAddress,
        address rewardTokenAddress,
        address paranetsRegistryAddress,
        address knowledgeMinersRegistryAddress,
        bytes32 paranetId,
        uint256 tracToNeuroEmissionMultiplier,
        uint16 paranetOperatorRewardPercentage_,
        uint16 paranetIncentivizationProposalVotersRewardPercentage_
    ) {
        require(
            paranetOperatorRewardPercentage_ + paranetIncentivizationProposalVotersRewardPercentage_ <
                ParanetLib.PERCENTAGE_SCALING_FACTOR,
            "Invalid rewards ratio"
        );

        hub = Hub(hubAddress);
        if (rewardTokenAddress != address(0)) {
            token = IERC20(rewardTokenAddress);
        }
        paranetsRegistry = ParanetsRegistry(paranetsRegistryAddress);
        paranetKnowledgeMinersRegistry = ParanetKnowledgeMinersRegistry(knowledgeMinersRegistryAddress);

        parentParanetId = paranetId;
        neuroEmissionMultipliers.push(
            ParanetLib.NeuroEmissionMultiplier({
                multiplier: tracToNeuroEmissionMultiplier,
                timestamp: block.timestamp,
                finalized: true
            })
        );
        paranetOperatorRewardPercentage = paranetOperatorRewardPercentage_;
        paranetIncentivizationProposalVotersRewardPercentage = paranetIncentivizationProposalVotersRewardPercentage_;

        address hubOwner = hub.owner();
        uint256 size;
        assembly {
            size := extcodesize(hubOwner)
        }
        if (size > 0) {
            votersRegistrar = Ownable(hubOwner).owner();
        } else {
            votersRegistrar = hubOwner;
        }
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

    receive() external payable {
        emit NeuroRewardDeposit(msg.sender, msg.value);
    }

    function totalNeuroReceived() external view returns (uint256) {
        return address(this).balance + totalMinersClaimedNeuro + totalOperatorsClaimedNeuro + totalVotersClaimedNeuro;
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

    function minerClaimedNeuro(address minerAddress) external view returns (uint256) {
        return claimedMinerRewards[claimedMinerRewardsIndexes[minerAddress]].claimedNeuro;
    }

    function getAllRewardedMiners()
        external
        view
        returns (ParanetLib.ParanetIncentivesPoolClaimedRewardsProfile[] memory)
    {
        return claimedMinerRewards;
    }

    function operatorClaimedNeuro(address operatorAddress) external view returns (uint256) {
        return claimedOperatorRewards[claimedOperatorRewardsIndexes[operatorAddress]].claimedNeuro;
    }

    function getAllRewardedOperators()
        external
        view
        returns (ParanetLib.ParanetIncentivesPoolClaimedRewardsProfile[] memory)
    {
        return claimedOperatorRewards;
    }

    function voterClaimedNeuro(address voterAddress) external view returns (uint256) {
        return voters[votersIndexes[voterAddress]].claimedNeuro;
    }

    function addVoters(
        ParanetLib.ParanetIncentivizationProposalVoterInput[] calldata voters_
    ) external onlyVotersRegistrar {
        for (uint256 i; i < voters_.length; ) {
            votersIndexes[voters_[i].addr] = voters.length;
            voters.push(
                ParanetLib.ParanetIncentivizationProposalVoter({
                    addr: voters_[i].addr,
                    weight: voters_[i].weight,
                    claimedNeuro: 0
                })
            );

            cumulativeVotersWeight += uint16(voters_[i].weight);

            unchecked {
                i++;
            }
        }

        require(cumulativeVotersWeight <= ParanetLib.MAX_CUMULATIVE_VOTERS_WEIGHT, "Cumulative weight is too big");
    }

    function getVoter(
        address voterAddress
    ) external view returns (ParanetLib.ParanetIncentivizationProposalVoter memory) {
        return voters[votersIndexes[voterAddress]];
    }

    function getVoters() external view returns (ParanetLib.ParanetIncentivizationProposalVoter[] memory) {
        return voters;
    }

    function getVotersCount() external view returns (uint256) {
        return voters.length;
    }

    function removeVoters(uint256 limit) external onlyVotersRegistrar {
        require(voters.length >= limit, "Limit exceeds the num of voters");

        for (uint256 i; i < limit; ) {
            cumulativeVotersWeight -= uint16(voters[voters.length - 1 - i].weight);

            delete votersIndexes[voters[voters.length - 1 - i].addr];
            voters.pop();

            unchecked {
                i++;
            }
        }
    }

    function isKnowledgeMiner(address addr) public view returns (bool) {
        return paranetsRegistry.isKnowledgeMinerRegistered(parentParanetId, addr);
    }

    function isParanetOperator(address addr) public view returns (bool) {
        (address paranetKCStorageContract, uint256 paranetKCTokenId) = paranetsRegistry
            .getParanetKnowledgeCollectionLocator(parentParanetId);

        KnowledgeCollectionStorage knowledgeCollectionStorage = KnowledgeCollectionStorage(paranetKCStorageContract);

        uint256 minted = knowledgeCollectionStorage.getMinted(paranetKCTokenId);
        uint256 burnedCount = knowledgeCollectionStorage.getBurnedAmount(paranetKCTokenId);
        uint256 activeCount = minted - burnedCount;
        if (activeCount == 0) {
            return false;
        }

        uint256 startTokenId = (paranetKCTokenId - 1) * knowledgeCollectionStorage.knowledgeCollectionMaxSize() + 1; // _startTokenId()

        uint256 ownedCountInRange = knowledgeCollectionStorage.balanceOf(addr, startTokenId, minted + burnedCount);

        return ownedCountInRange == activeCount;
    }

    function isProposalVoter(address addr) public view returns (bool) {
        return (voters.length != 0 && voters[votersIndexes[addr]].addr == addr);
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
        uint96 unrewardedTracSpent = paranetKnowledgeMinersRegistry.getUnrewardedTracSpent(msg.sender, parentParanetId);

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
                    paranetOperatorRewardPercentage -
                    paranetIncentivizationProposalVotersRewardPercentage)) / ParanetLib.PERCENTAGE_SCALING_FACTOR;
    }

    function getTotalAllKnowledgeMinersIncentiveEstimation() public view returns (uint256) {
        return
            _getIncentiveEstimation(
                ParanetLib.PERCENTAGE_SCALING_FACTOR -
                    paranetOperatorRewardPercentage -
                    paranetIncentivizationProposalVotersRewardPercentage,
                totalMinersClaimedNeuro
            );
    }

    function getClaimableKnowledgeMinerRewardAmount() public view returns (uint256) {
        uint256 neuroReward = getTotalKnowledgeMinerIncentiveEstimation();

        // Here we should have a limit for Knowledge Miners, which is determined by the % of the Miners Reward
        // and total NEURO received by the contract, so that Miners don't get tokens belonging to Operator/Voters
        // Following the example from the above, if we have 100 NEURO as a total reward, Miners should never get
        // more than 80 NEURO. minersRewardLimit = 80 NEURO
        uint256 minersRewardLimit = ((address(this).balance +
            totalMinersClaimedNeuro +
            totalOperatorsClaimedNeuro +
            totalVotersClaimedNeuro) *
            (ParanetLib.PERCENTAGE_SCALING_FACTOR -
                paranetOperatorRewardPercentage -
                paranetIncentivizationProposalVotersRewardPercentage)) / ParanetLib.PERCENTAGE_SCALING_FACTOR;

        return
            totalMinersClaimedNeuro + neuroReward <= minersRewardLimit
                ? neuroReward
                : minersRewardLimit - totalMinersClaimedNeuro;
    }

    function getClaimableAllKnowledgeMinersRewardAmount() public view returns (uint256) {
        uint256 neuroReward = getTotalAllKnowledgeMinersIncentiveEstimation();

        uint256 minersRewardLimit = ((address(this).balance +
            totalMinersClaimedNeuro +
            totalOperatorsClaimedNeuro +
            totalVotersClaimedNeuro) *
            (ParanetLib.PERCENTAGE_SCALING_FACTOR -
                paranetOperatorRewardPercentage -
                paranetIncentivizationProposalVotersRewardPercentage)) / ParanetLib.PERCENTAGE_SCALING_FACTOR;

        return
            totalMinersClaimedNeuro + neuroReward <= minersRewardLimit
                ? neuroReward
                : minersRewardLimit - totalMinersClaimedNeuro;
    }

    function claimKnowledgeMinerReward() external onlyParanetKnowledgeMiner {
        ParanetKnowledgeMinersRegistry pkmr = paranetKnowledgeMinersRegistry;

        uint256 neuroReward = getTotalKnowledgeMinerIncentiveEstimation();
        uint256 claimableNeuroReward = getClaimableKnowledgeMinerRewardAmount();

        if (claimableNeuroReward == 0) {
            revert ParanetLib.NoRewardAvailable(parentParanetId, msg.sender);
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
            parentParanetId,
            neuroReward == claimableNeuroReward
                ? 0
                : uint96(
                    ((neuroReward - claimableNeuroReward) * ParanetLib.EMISSION_MULTIPLIER_SCALING_FACTOR) /
                        getEffectiveNeuroEmissionMultiplier(block.timestamp)
                )
        );
        pkmr.addCumulativeAwardedNeuro(msg.sender, parentParanetId, claimableNeuroReward);

        if (
            claimedMinerRewards.length == 0 ||
            claimedMinerRewards[claimedMinerRewardsIndexes[msg.sender]].addr != msg.sender
        ) {
            claimedMinerRewardsIndexes[msg.sender] = claimedMinerRewards.length;
            claimedMinerRewards.push(
                ParanetLib.ParanetIncentivesPoolClaimedRewardsProfile({
                    addr: msg.sender,
                    claimedNeuro: claimableNeuroReward
                })
            );
        } else {
            claimedMinerRewards[claimedMinerRewardsIndexes[msg.sender]].claimedNeuro += claimableNeuroReward;
        }
        totalMinersClaimedNeuro += claimableNeuroReward;

        payable(msg.sender).transfer(claimableNeuroReward);

        emit ParanetKnowledgeMinerRewardClaimed(msg.sender, claimableNeuroReward);
    }

    function getTotalParanetOperatorIncentiveEstimation() public view returns (uint256) {
        return _getIncentiveEstimation(paranetOperatorRewardPercentage, totalOperatorsClaimedNeuro);
    }

    function getClaimableParanetOperatorRewardAmount() public view returns (uint256) {
        uint256 neuroReward = getTotalParanetOperatorIncentiveEstimation();

        uint256 operatorRewardLimit = ((address(this).balance +
            totalMinersClaimedNeuro +
            totalOperatorsClaimedNeuro +
            totalVotersClaimedNeuro) * paranetOperatorRewardPercentage) / ParanetLib.PERCENTAGE_SCALING_FACTOR;

        return
            totalOperatorsClaimedNeuro + neuroReward <= operatorRewardLimit
                ? neuroReward
                : operatorRewardLimit - totalOperatorsClaimedNeuro;
    }

    function claimParanetOperatorReward() external onlyParanetOperator {
        uint256 claimableNeuroReward = getClaimableParanetOperatorRewardAmount();

        if (claimableNeuroReward == 0) {
            revert ParanetLib.NoRewardAvailable(parentParanetId, msg.sender);
        }

        if (
            claimedOperatorRewards.length == 0 ||
            claimedOperatorRewards[claimedOperatorRewardsIndexes[msg.sender]].addr != msg.sender
        ) {
            claimedOperatorRewardsIndexes[msg.sender] = claimedOperatorRewards.length;
            claimedOperatorRewards.push(
                ParanetLib.ParanetIncentivesPoolClaimedRewardsProfile({
                    addr: msg.sender,
                    claimedNeuro: claimableNeuroReward
                })
            );
        } else {
            claimedOperatorRewards[claimedOperatorRewardsIndexes[msg.sender]].claimedNeuro += claimableNeuroReward;
        }
        totalOperatorsClaimedNeuro += claimableNeuroReward;

        payable(msg.sender).transfer(claimableNeuroReward);

        emit ParanetOperatorRewardClaimed(msg.sender, claimableNeuroReward);
    }

    function getTotalProposalVoterIncentiveEstimation() public view returns (uint256) {
        uint256 effectiveNeuroEmissionMultiplier = getEffectiveNeuroEmissionMultiplier(block.timestamp);
        uint96 cumulativeKnowledgeValueSingleVoterPart = (((paranetsRegistry.getCumulativeKnowledgeValue(
            parentParanetId
        ) * paranetIncentivizationProposalVotersRewardPercentage) / ParanetLib.PERCENTAGE_SCALING_FACTOR) *
            voters[votersIndexes[msg.sender]].weight) / ParanetLib.MAX_CUMULATIVE_VOTERS_WEIGHT;
        uint96 rewardedTracSpentSingleVoterPart = uint96(
            (voters[votersIndexes[msg.sender]].claimedNeuro * ParanetLib.EMISSION_MULTIPLIER_SCALING_FACTOR) /
                effectiveNeuroEmissionMultiplier
        );

        if (
            cumulativeKnowledgeValueSingleVoterPart - rewardedTracSpentSingleVoterPart < ParanetLib.TOKENS_DIGITS_DIFF
        ) {
            return 0;
        }

        return
            ((cumulativeKnowledgeValueSingleVoterPart * effectiveNeuroEmissionMultiplier) /
                ParanetLib.EMISSION_MULTIPLIER_SCALING_FACTOR) - voters[votersIndexes[msg.sender]].claimedNeuro;
    }

    function getTotalAllProposalVotersIncentiveEstimation() public view returns (uint256) {
        return _getIncentiveEstimation(paranetIncentivizationProposalVotersRewardPercentage, totalVotersClaimedNeuro);
    }

    function getClaimableProposalVoterRewardAmount() public view returns (uint256) {
        if (voters.length == 0 || voters[votersIndexes[msg.sender]].addr != msg.sender) {
            return 0;
        }

        uint256 neuroReward = getTotalProposalVoterIncentiveEstimation();

        uint256 voterRewardLimit = ((((address(this).balance +
            totalMinersClaimedNeuro +
            totalOperatorsClaimedNeuro +
            totalVotersClaimedNeuro) * paranetIncentivizationProposalVotersRewardPercentage) /
            ParanetLib.PERCENTAGE_SCALING_FACTOR) * voters[votersIndexes[msg.sender]].weight) /
            ParanetLib.MAX_CUMULATIVE_VOTERS_WEIGHT;

        return
            voters[votersIndexes[msg.sender]].claimedNeuro + neuroReward <= voterRewardLimit
                ? neuroReward
                : voterRewardLimit - voters[votersIndexes[msg.sender]].claimedNeuro;
    }

    function getClaimableAllProposalVotersRewardAmount() public view returns (uint256) {
        uint256 neuroReward = getTotalAllProposalVotersIncentiveEstimation();

        uint256 votersRewardLimit = ((address(this).balance +
            totalMinersClaimedNeuro +
            totalOperatorsClaimedNeuro +
            totalVotersClaimedNeuro) * paranetIncentivizationProposalVotersRewardPercentage) /
            ParanetLib.PERCENTAGE_SCALING_FACTOR;

        return
            totalVotersClaimedNeuro + neuroReward <= votersRewardLimit
                ? neuroReward
                : votersRewardLimit - totalVotersClaimedNeuro;
    }

    function claimIncentivizationProposalVoterReward() external onlyParanetIncentivizationProposalVoter {
        if (cumulativeVotersWeight != ParanetLib.MAX_CUMULATIVE_VOTERS_WEIGHT) {
            revert ParanetLib.InvalidCumulativeVotersWeight(
                parentParanetId,
                cumulativeVotersWeight,
                ParanetLib.MAX_CUMULATIVE_VOTERS_WEIGHT
            );
        }

        uint256 claimableNeuroReward = getClaimableProposalVoterRewardAmount();

        if (claimableNeuroReward == 0) {
            revert ParanetLib.NoRewardAvailable(parentParanetId, msg.sender);
        }

        voters[votersIndexes[msg.sender]].claimedNeuro += claimableNeuroReward;
        totalVotersClaimedNeuro += claimableNeuroReward;

        payable(msg.sender).transfer(claimableNeuroReward);

        emit ParanetIncentivizationProposalVoterRewardClaimed(msg.sender, claimableNeuroReward);
    }

    function _getIncentiveEstimation(
        uint16 rewardPercentage,
        uint256 totalClaimedNeuro
    ) internal view returns (uint256) {
        uint256 effectiveNeuroEmissionMultiplier = getEffectiveNeuroEmissionMultiplier(block.timestamp);
        uint96 cumulativeKnowledgeValuePart = (paranetsRegistry.getCumulativeKnowledgeValue(parentParanetId) *
            rewardPercentage) / ParanetLib.PERCENTAGE_SCALING_FACTOR;
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
        require(msg.sender == votersRegistrar, "Fn can only be used by registrar");
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
