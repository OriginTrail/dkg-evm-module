// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {HubDependent} from "../abstract/HubDependent.sol";
import {ParanetsRegistry} from "../storage/paranets/ParanetsRegistry.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {INamed} from "../interfaces/INamed.sol";
import {IVersioned} from "../interfaces/IVersioned.sol";
import {IInitializable} from "../interfaces/IInitializable.sol";
import {ParanetLib} from "../libraries/ParanetLib.sol";

// TODO: When working with arrays check if it's empty
// TODO: Add getter for length, at index, reverse look up for arrays

contract ParanetNeuroIncentivesPoolStorage is INamed, IVersioned, HubDependent, IInitializable {
    event NeuroRewardDeposit(address sender, uint256 amount);
    event VoterWeightUpdated(address indexed voter, uint96 oldWeight, uint96 newWeight);
    event TotalMinersClaimedNeuroSet(uint256 oldAmount, uint256 newAmount);
    event TotalOperatorsClaimedNeuroSet(uint256 oldAmount, uint256 newAmount);
    event TotalVotersClaimedNeuroSet(uint256 oldAmount, uint256 newAmount);
    event TotalMinersClaimedNeuroDecremented(uint256 amount, uint256 newTotal);
    event TotalOperatorsClaimedNeuroDecremented(uint256 amount, uint256 newTotal);
    event TotalVotersClaimedNeuroDecremented(uint256 amount, uint256 newTotal);

    string private constant _NAME = "ParanetNeuroIncentivesPoolStorage";
    string private constant _VERSION = "1.0.0";
    uint256 private constant MAX_VOTERS_PER_BATCH = 100;

    IERC20 public token;
    ParanetsRegistry public paranetsRegistry;
    address public paranetNeuroIncentivesPoolAddress;
    bytes32 public paranetId;

    // Percentage of how much tokens from total NEURO emission goes to the Paranet Operator
    // Minimum: 0, Maximum: 10,000 (which is 100%)
    // TODO: Check if this is correct type
    uint16 public paranetOperatorRewardPercentage;
    // Percentage of how much tokens from total NEURO emission goes to the Paranet Incentivization
    // Proposal Voters. Minimum: 0, Maximum: 10,000 (which is 100%)
    // TODO: Check if this is correct type
    uint16 public paranetIncentivizationProposalVotersRewardPercentage;

    // Address which can set Voters list and update Total NEURO Emission multiplier
    address public votersRegistrar;

    uint256 public totalMinersClaimedNeuro;
    uint256 public totalOperatorsClaimedNeuro;
    uint256 public totalVotersClaimedNeuro;

    ParanetLib.ParanetIncentivesPoolClaimedRewardsProfile[] public claimedMinerRewards;
    mapping(address => uint256) public claimedMinerRewardsIndexes;

    ParanetLib.ParanetIncentivesPoolClaimedRewardsProfile[] public claimedOperatorRewards;
    mapping(address => uint256) public claimedOperatorRewardsIndexes;

    // Is this good type ?
    uint96 public cumulativeVotersWeight;
    ParanetLib.ParanetIncentivizationProposalVoter[] public voters;
    mapping(address => uint256) public votersIndexes;

    constructor(
        address hubAddress,
        address rewardTokenAddress,
        bytes32 paranetId_,
        uint16 paranetOperatorRewardPercentage_,
        uint16 paranetIncentivizationProposalVotersRewardPercentage_
    ) HubDependent(hubAddress) {
        require(
            paranetOperatorRewardPercentage_ + paranetIncentivizationProposalVotersRewardPercentage_ <
                ParanetLib.PERCENTAGE_SCALING_FACTOR,
            "Invalid rewards ratio"
        );

        if (rewardTokenAddress != address(0)) {
            token = IERC20(rewardTokenAddress);
        }

        require(paranetsRegistry.paranetExists(paranetId_), "Non existent paranet");
        paranetId = paranetId_;

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

    // TODO: It shouldn't be onlyHub, but onlyParanetOperator probably
    function initialize() public onlyHub {
        paranetsRegistry = ParanetsRegistry(hub.getContractAddress("ParanetsRegistry"));
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
        return getBalance() + totalMinersClaimedNeuro + totalOperatorsClaimedNeuro + totalVotersClaimedNeuro;
    }

    function transferVotersRegistrarRole(address newRegistrar) external onlyVotersRegistrar {
        votersRegistrar = newRegistrar;
    }

    function getAllRewardedMiners()
        external
        view
        returns (ParanetLib.ParanetIncentivesPoolClaimedRewardsProfile[] memory)
    {
        return claimedMinerRewards;
    }

    function minerClaimedNeuro(address minerAddress) external view returns (uint256) {
        return claimedMinerRewards[claimedMinerRewardsIndexes[minerAddress]].claimedNeuro;
    }

    function operatorClaimedNeuro(address operatorAddress) external view returns (uint256) {
        return claimedOperatorRewards[claimedOperatorRewardsIndexes[operatorAddress]].claimedNeuro;
    }

    function addMinerClaimedRewardProfile(address addr, uint256 claimableNeuroReward) external {
        require(msg.sender == paranetNeuroIncentivesPoolAddress, "Not authorized to add claim");
        claimedMinerRewardsIndexes[addr] = claimedMinerRewards.length;
        claimedMinerRewards.push(
            ParanetLib.ParanetIncentivesPoolClaimedRewardsProfile({
                addr: msg.sender,
                claimedNeuro: claimableNeuroReward
            })
        );
    }

    function addMinerClaimedReward(address addr, uint256 claimableNeuroReward) external {
        require(msg.sender == paranetNeuroIncentivesPoolAddress, "Not authorized to add claim");
        claimedMinerRewards[claimedMinerRewardsIndexes[addr]].claimedNeuro += claimableNeuroReward;
    }

    function addClaimedOperatorReward(address addr, uint256 claimableNeuroReward) external {
        require(msg.sender == paranetNeuroIncentivesPoolAddress, "Not authorized to add claim");
        claimedOperatorRewards[claimedOperatorRewardsIndexes[addr]].claimedNeuro += claimableNeuroReward;
    }

    function addOperatorClaimedRewardsProfile(address addr, uint256 claimableNeuroReward) external {
        require(msg.sender == paranetNeuroIncentivesPoolAddress, "Not authorized to add claim");
        claimedMinerRewardsIndexes[addr] = claimedMinerRewards.length;
        claimedMinerRewards.push(
            ParanetLib.ParanetIncentivesPoolClaimedRewardsProfile({addr: addr, claimedNeuro: claimableNeuroReward})
        );
    }

    function getAllRewardedOperators()
        external
        view
        returns (ParanetLib.ParanetIncentivesPoolClaimedRewardsProfile[] memory)
    {
        return claimedOperatorRewards;
    }

    modifier onlyVotersRegistrar() {
        require(msg.sender == votersRegistrar, "Fn can only be used by registrar");
        _;
    }

    // TODO: Limit size of voters_ array
    function addVoters(
        ParanetLib.ParanetIncentivizationProposalVoterInput[] calldata voters_
    ) external onlyVotersRegistrar {
        require(voters_.length <= MAX_VOTERS_PER_BATCH, "Batch too large");
        for (uint256 i; i < voters_.length; ) {
            address voterAddr = voters_[i].addr;
            uint16 weight = uint16(voters_[i].weight);

            require(voterAddr != address(0), "Zero address is not valid voter");

            uint256 existingIndex = votersIndexes[voterAddr];
            if (existingIndex < voters.length) {
                revert("Voter already exists");
            }

            votersIndexes[voterAddr] = voters.length;
            voters.push(
                ParanetLib.ParanetIncentivizationProposalVoter({addr: voterAddr, weight: weight, claimedNeuro: 0})
            );

            cumulativeVotersWeight += weight;

            unchecked {
                i++;
            }
        }

        require(cumulativeVotersWeight <= ParanetLib.MAX_CUMULATIVE_VOTERS_WEIGHT, "Cumulative weight is too big");
    }

    /**
     * @notice Remove the last `limit` voters from the array.
     */
    function removeVoters(uint256 limit) external onlyVotersRegistrar {
        require(voters.length >= limit, "Limit exceeds number of voters");

        for (uint256 i; i < limit; ) {
            ParanetLib.ParanetIncentivizationProposalVoter memory voter = voters[voters.length - 1];
            // Decrease total weight
            cumulativeVotersWeight -= uint16(voter.weight);

            // Clean up indexes
            delete votersIndexes[voter.addr];

            // Remove last element
            voters.pop();

            unchecked {
                i++;
            }
        }
    }

    function removeVoter(address voterAddress) external onlyVotersRegistrar {
        require(voterAddress != address(0), "Zero address");
        uint256 index = votersIndexes[voterAddress];
        require(index < voters.length, "Invalid voter index");

        ParanetLib.ParanetIncentivizationProposalVoter memory voterToRemove = voters[index];
        require(voterToRemove.addr == voterAddress, "Voter not found");

        uint96 removedWeight = voterToRemove.weight;
        require(cumulativeVotersWeight >= removedWeight, "Weight underflow");

        // Move last element to deleted position
        uint256 lastIndex = voters.length - 1;
        if (index != lastIndex) {
            ParanetLib.ParanetIncentivizationProposalVoter memory lastVoter = voters[lastIndex];
            voters[index] = lastVoter;
            votersIndexes[lastVoter.addr] = index;
        }

        voters.pop();
        delete votersIndexes[voterAddress];
        cumulativeVotersWeight -= removedWeight;
    }

    function getVotersCount() external view returns (uint256) {
        return voters.length;
    }

    function getVoters() external view returns (ParanetLib.ParanetIncentivizationProposalVoter[] memory) {
        return voters;
    }

    function getVoter(
        address voterAddress
    ) external view returns (ParanetLib.ParanetIncentivizationProposalVoter memory) {
        if (voters.length == 0) {
            return ParanetLib.ParanetIncentivizationProposalVoter({addr: address(0), weight: 0, claimedNeuro: 0});
        }

        uint256 index = votersIndexes[voterAddress];
        if (index > voters.length || voters[index].addr != voterAddress) {
            return ParanetLib.ParanetIncentivizationProposalVoter({addr: address(0), weight: 0, claimedNeuro: 0});
        }

        return voters[index];
    }

    function getVoterAtIndex(
        uint256 index
    ) external view returns (ParanetLib.ParanetIncentivizationProposalVoter memory) {
        return voters[index];
    }

    function isProposalVoter(address addr) external view returns (bool) {
        if (voters.length == 0) return false;
        uint256 idx = votersIndexes[addr];
        return (idx < voters.length && voters[idx].addr == addr);
    }

    function addVoterClaimedNeuro(address voter, uint256 amount) external {
        require(msg.sender == paranetNeuroIncentivesPoolAddress, "Not authorized to add claim");

        uint256 idx = votersIndexes[voter];
        if (idx < voters.length && voters[idx].addr == voter) {
            voters[idx].claimedNeuro += amount;
        }
    }

    function getClaimedMinerRewardsLength() external view returns (uint256) {
        return claimedMinerRewards.length;
    }

    function getClaimedMinerRewardsAtIndex(
        uint256 index
    ) external view returns (ParanetLib.ParanetIncentivesPoolClaimedRewardsProfile memory) {
        return claimedMinerRewards[index];
    }

    function getClaimedOperatorRewardsLength() external view returns (uint256) {
        return claimedOperatorRewards.length;
    }

    function getClaimedOperatorRewardsAtIndex(
        uint256 index
    ) external view returns (ParanetLib.ParanetIncentivesPoolClaimedRewardsProfile memory) {
        return claimedOperatorRewards[index];
    }

    function addTotalMinersClaimedNeuro(uint256 amount) external {
        require(msg.sender == paranetNeuroIncentivesPoolAddress, "Not authorized to add claim");
        totalMinersClaimedNeuro += amount;
    }

    function addTotalOperatorsClaimedNeuro(uint256 amount) external {
        require(msg.sender == paranetNeuroIncentivesPoolAddress, "Not authorized to add claim");
        totalOperatorsClaimedNeuro += amount;
    }

    function addTotalVotersClaimedNeuro(uint256 amount) external {
        require(msg.sender == paranetNeuroIncentivesPoolAddress, "Not authorized to add claim");
        totalVotersClaimedNeuro += amount;
    }

    function setParanetNeuroIncentivesPool(address _paranetNeuroIncentivesPoolAddress) external onlyContracts {
        paranetNeuroIncentivesPoolAddress = _paranetNeuroIncentivesPoolAddress;
    }

    function getBalance() public view returns (uint256) {
        if (address(token) == address(0)) {
            return address(this).balance;
        } else {
            return token.balanceOf(address(this));
        }
    }

    function transferReward(address rewardAddress, uint256 amount) public {
        require(msg.sender == paranetNeuroIncentivesPoolAddress, "Not authorized to transfer reward");

        if (address(token) == address(0)) {
            payable(rewardAddress).transfer(amount);
        } else {
            token.transfer(rewardAddress, amount);
        }
    }

    function setTotalMinersClaimedNeuro(uint256 amount) external {
        require(msg.sender == paranetNeuroIncentivesPoolAddress, "Not authorized to set claim");
        totalMinersClaimedNeuro = amount;
    }

    function setTotalOperatorsClaimedNeuro(uint256 amount) external {
        require(msg.sender == paranetNeuroIncentivesPoolAddress, "Not authorized to set claim");
        totalOperatorsClaimedNeuro = amount;
    }

    function setTotalVotersClaimedNeuro(uint256 amount) external {
        require(msg.sender == paranetNeuroIncentivesPoolAddress, "Not authorized to set claim");
        totalVotersClaimedNeuro = amount;
    }

    function decrementTotalMinersClaimedNeuro(uint256 amount) external {
        require(msg.sender == paranetNeuroIncentivesPoolAddress, "Not authorized to decrement claim");
        require(amount <= totalMinersClaimedNeuro, "Amount exceeds total claimed");
        totalMinersClaimedNeuro -= amount;
    }

    function decrementTotalOperatorsClaimedNeuro(uint256 amount) external {
        require(msg.sender == paranetNeuroIncentivesPoolAddress, "Not authorized to decrement claim");
        require(amount <= totalOperatorsClaimedNeuro, "Amount exceeds total claimed");
        totalOperatorsClaimedNeuro -= amount;
    }

    function decrementTotalVotersClaimedNeuro(uint256 amount) external {
        require(msg.sender == paranetNeuroIncentivesPoolAddress, "Not authorized to decrement claim");
        require(amount <= totalVotersClaimedNeuro, "Amount exceeds total claimed");
        totalVotersClaimedNeuro -= amount;
    }

    function getPaginatedClaimedMinerRewards(
        uint256 offset,
        uint256 limit
    ) external view returns (ParanetLib.ParanetIncentivesPoolClaimedRewardsProfile[] memory rewards, uint256 total) {
        total = claimedMinerRewards.length;

        if (offset >= total || limit == 0) {
            return (new ParanetLib.ParanetIncentivesPoolClaimedRewardsProfile[](0), total);
        }

        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }
        uint256 resultLength = end - offset;

        rewards = new ParanetLib.ParanetIncentivesPoolClaimedRewardsProfile[](resultLength);
        for (uint256 i = 0; i < resultLength; i++) {
            rewards[i] = claimedMinerRewards[offset + i];
        }
    }

    function getPaginatedClaimedOperatorRewards(
        uint256 offset,
        uint256 limit
    ) external view returns (ParanetLib.ParanetIncentivesPoolClaimedRewardsProfile[] memory rewards, uint256 total) {
        total = claimedOperatorRewards.length;

        if (offset >= total || limit == 0) {
            return (new ParanetLib.ParanetIncentivesPoolClaimedRewardsProfile[](0), total);
        }

        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }
        uint256 resultLength = end - offset;

        rewards = new ParanetLib.ParanetIncentivesPoolClaimedRewardsProfile[](resultLength);
        for (uint256 i = 0; i < resultLength; i++) {
            rewards[i] = claimedOperatorRewards[offset + i];
        }
    }

    function getPaginatedVoters(
        uint256 offset,
        uint256 limit
    ) external view returns (ParanetLib.ParanetIncentivizationProposalVoter[] memory votersList, uint256 total) {
        total = voters.length;

        if (offset >= total || limit == 0) {
            return (new ParanetLib.ParanetIncentivizationProposalVoter[](0), total);
        }

        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }
        uint256 resultLength = end - offset;

        votersList = new ParanetLib.ParanetIncentivizationProposalVoter[](resultLength);
        for (uint256 i = 0; i < resultLength; i++) {
            votersList[i] = voters[offset + i];
        }
    }

    function updateVoterWeight(address voter, uint96 newWeight) external onlyVotersRegistrar {
        uint256 index = votersIndexes[voter];
        require(index < voters.length && voters[index].addr == voter, "Voter not found");

        uint96 oldWeight = voters[index].weight;
        require(
            cumulativeVotersWeight - oldWeight + newWeight <= ParanetLib.MAX_CUMULATIVE_VOTERS_WEIGHT,
            "New weight would exceed maximum"
        );

        cumulativeVotersWeight = cumulativeVotersWeight - oldWeight + newWeight;
        voters[index].weight = newWeight;

        emit VoterWeightUpdated(voter, oldWeight, newWeight);
    }
}
