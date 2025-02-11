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

contract ParanetNeuroIncentivesPoolStorage is INamed, IVersioned, HubDependent, IInitializable {
    event NeuroRewardDeposit(address sender, uint256 amount);
    event VoterWeightUpdated(address indexed voter, uint96 oldWeight, uint96 newWeight);
    event TotalMinersClaimedNeuroSet(uint256 oldAmount, uint256 newAmount);
    event TotalOperatorsClaimedNeuroSet(uint256 oldAmount, uint256 newAmount);
    event TotalVotersClaimedNeuroSet(uint256 oldAmount, uint256 newAmount);
    event TotalMinersClaimedNeuroDecremented(uint256 amount, uint256 newTotal);
    event TotalOperatorsClaimedNeuroDecremented(uint256 amount, uint256 newTotal);
    event TotalVotersClaimedNeuroDecremented(uint256 amount, uint256 newTotal);
    event VotersRegistrarTransferred(address indexed previousRegistrar, address indexed newRegistrar);
    event MinerRewardProfileAdded(address indexed miner, uint256 amount);
    event MinerRewardIncreased(address indexed miner, uint256 additionalAmount, uint256 newTotal);
    event OperatorRewardProfileAdded(address indexed operator, uint256 amount);
    event OperatorRewardIncreased(address indexed operator, uint256 additionalAmount, uint256 newTotal);
    event VoterAdded(address indexed voter, uint16 weight);
    event VoterRemoved(address indexed voter, uint96 weight);
    event VotersRemoved(uint256 count);
    event VoterRewardClaimed(address indexed voter, uint256 amount);
    event IncentivesPoolAddressSet(address indexed oldAddress, address indexed newAddress);
    event RewardTransferred(address indexed recipient, uint256 amount);

    string private constant _NAME = "ParanetNeuroIncentivesPoolStorage";
    string private constant _VERSION = "1.0.0";
    uint256 private constant MAX_VOTERS_PER_BATCH = 100;

    IERC20 public token;
    ParanetsRegistry public paranetsRegistry;
    address public paranetNeuroIncentivesPoolAddress;
    bytes32 public paranetId;

    // Percentage of how much tokens from total NEURO emission goes to the Paranet Operator
    // Minimum: 0, Maximum: 10,000 (which is 100%)
    uint16 public paranetOperatorRewardPercentage;
    // Percentage of how much tokens from total NEURO emission goes to the Paranet Incentivization
    // Proposal Voters. Minimum: 0, Maximum: 10,000 (which is 100%)
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

        ParanetsRegistry pr = ParanetsRegistry(hub.getContractAddress("ParanetsRegistry"));
        require(pr.paranetExists(paranetId_), "Non existent paranet");
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

    function initialize() public onlyContracts {
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
        address oldRegistrar = votersRegistrar;
        votersRegistrar = newRegistrar;
        emit VotersRegistrarTransferred(oldRegistrar, newRegistrar);
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
        require(msg.sender == paranetNeuroIncentivesPoolAddress, "Caller is not incentives pool contract");
        claimedMinerRewardsIndexes[addr] = claimedMinerRewards.length;
        claimedMinerRewards.push(
            ParanetLib.ParanetIncentivesPoolClaimedRewardsProfile({addr: addr, claimedNeuro: claimableNeuroReward})
        );
        emit MinerRewardProfileAdded(addr, claimableNeuroReward);
    }

    function addMinerClaimedReward(address addr, uint256 claimableNeuroReward) external {
        require(msg.sender == paranetNeuroIncentivesPoolAddress, "Caller is not incentives pool contract");
        uint256 newTotal = claimedMinerRewards[claimedMinerRewardsIndexes[addr]].claimedNeuro + claimableNeuroReward;
        claimedMinerRewards[claimedMinerRewardsIndexes[addr]].claimedNeuro = newTotal;
        emit MinerRewardIncreased(addr, claimableNeuroReward, newTotal);
    }

    function addOperatorClaimedRewardsProfile(address addr, uint256 claimableNeuroReward) external {
        require(msg.sender == paranetNeuroIncentivesPoolAddress, "Caller is not incentives pool contract");
        claimedOperatorRewardsIndexes[addr] = claimedOperatorRewards.length;
        claimedOperatorRewards.push(
            ParanetLib.ParanetIncentivesPoolClaimedRewardsProfile({addr: addr, claimedNeuro: claimableNeuroReward})
        );
        emit OperatorRewardProfileAdded(addr, claimableNeuroReward);
    }

    function addClaimedOperatorReward(address addr, uint256 claimableNeuroReward) external {
        require(msg.sender == paranetNeuroIncentivesPoolAddress, "Caller is not incentives pool contract");
        uint256 newTotal = claimedOperatorRewards[claimedOperatorRewardsIndexes[addr]].claimedNeuro +
            claimableNeuroReward;
        claimedOperatorRewards[claimedOperatorRewardsIndexes[addr]].claimedNeuro = newTotal;
        emit OperatorRewardIncreased(addr, claimableNeuroReward, newTotal);
    }

    function getAllRewardedOperators()
        external
        view
        returns (ParanetLib.ParanetIncentivesPoolClaimedRewardsProfile[] memory)
    {
        return claimedOperatorRewards;
    }

    function addVoters(
        ParanetLib.ParanetIncentivizationProposalVoterInput[] calldata voters_
    ) external onlyVotersRegistrar {
        require(voters_.length <= MAX_VOTERS_PER_BATCH, "Batch too large");
        for (uint256 i; i < voters_.length; ) {
            address voterAddr = voters_[i].addr;
            uint16 weight = uint16(voters_[i].weight);

            uint256 existingIndex = votersIndexes[voterAddr];
            if (existingIndex < voters.length) {
                revert("Voter already exists");
            }

            votersIndexes[voterAddr] = voters.length;
            voters.push(
                ParanetLib.ParanetIncentivizationProposalVoter({addr: voterAddr, weight: weight, claimedNeuro: 0})
            );

            cumulativeVotersWeight += weight;

            emit VoterAdded(voterAddr, weight);

            unchecked {
                i++;
            }
        }

        require(cumulativeVotersWeight <= ParanetLib.MAX_CUMULATIVE_VOTERS_WEIGHT, "Cumulative weight is too big");
    }

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

            emit VoterRemoved(voter.addr, voter.weight);

            unchecked {
                i++;
            }
        }

        emit VotersRemoved(limit);
    }

    function removeVoter(address voterAddress) external onlyVotersRegistrar {
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

        emit VoterRemoved(voterAddress, removedWeight);
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
        if (index >= voters.length || voters[index].addr != voterAddress) {
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
        return (idx <= voters.length && voters[idx].addr == addr);
    }

    function addVoterClaimedNeuro(address voter, uint256 amount) external {
        require(msg.sender == paranetNeuroIncentivesPoolAddress, "Caller is not incentives pool contract");
        uint256 idx = votersIndexes[voter];
        if (idx < voters.length && voters[idx].addr == voter) {
            voters[idx].claimedNeuro += amount;
            emit VoterRewardClaimed(voter, amount);
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
        require(msg.sender == paranetNeuroIncentivesPoolAddress, "Caller is not incentives pool contract");
        totalMinersClaimedNeuro += amount;
    }

    function addTotalOperatorsClaimedNeuro(uint256 amount) external {
        require(msg.sender == paranetNeuroIncentivesPoolAddress, "Caller is not incentives pool contract");
        totalOperatorsClaimedNeuro += amount;
    }

    function addTotalVotersClaimedNeuro(uint256 amount) external {
        require(msg.sender == paranetNeuroIncentivesPoolAddress, "Caller is not incentives pool contract");
        totalVotersClaimedNeuro += amount;
    }

    function setParanetNeuroIncentivesPool(address _paranetNeuroIncentivesPoolAddress) external onlyContracts {
        address oldAddress = paranetNeuroIncentivesPoolAddress;
        paranetNeuroIncentivesPoolAddress = _paranetNeuroIncentivesPoolAddress;
        emit IncentivesPoolAddressSet(oldAddress, _paranetNeuroIncentivesPoolAddress);
    }

    function getBalance() public view returns (uint256) {
        if (address(token) == address(0)) {
            return address(this).balance;
        } else {
            return token.balanceOf(address(this));
        }
    }

    function transferReward(address rewardAddress, uint256 amount) public {
        require(msg.sender == paranetNeuroIncentivesPoolAddress, "Caller is not incentives pool contract");
        if (address(token) == address(0)) {
            payable(rewardAddress).transfer(amount);
        } else {
            token.transfer(rewardAddress, amount);
        }
        emit RewardTransferred(rewardAddress, amount);
    }

    function setTotalMinersClaimedNeuro(uint256 amount) external {
        require(msg.sender == paranetNeuroIncentivesPoolAddress, "Caller is not incentives pool contract");
        totalMinersClaimedNeuro = amount;
    }

    function setTotalOperatorsClaimedNeuro(uint256 amount) external {
        require(msg.sender == paranetNeuroIncentivesPoolAddress, "Caller is not incentives pool contract");
        totalOperatorsClaimedNeuro = amount;
    }

    function setTotalVotersClaimedNeuro(uint256 amount) external {
        require(msg.sender == paranetNeuroIncentivesPoolAddress, "Caller is not incentives pool contract");
        totalVotersClaimedNeuro = amount;
    }

    function decrementTotalMinersClaimedNeuro(uint256 amount) external {
        require(msg.sender == paranetNeuroIncentivesPoolAddress, "Caller is not incentives pool contract");
        totalMinersClaimedNeuro -= amount;
    }

    function decrementTotalOperatorsClaimedNeuro(uint256 amount) external {
        require(msg.sender == paranetNeuroIncentivesPoolAddress, "Caller is not incentives pool contract");
        totalOperatorsClaimedNeuro -= amount;
    }

    function decrementTotalVotersClaimedNeuro(uint256 amount) external {
        require(msg.sender == paranetNeuroIncentivesPoolAddress, "Caller is not incentives pool contract");
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
        require(index <= voters.length && voters[index].addr == voter, "Voter not found");

        uint96 oldWeight = voters[index].weight;
        require(
            cumulativeVotersWeight - oldWeight + newWeight <= ParanetLib.MAX_CUMULATIVE_VOTERS_WEIGHT,
            "New weight would exceed maximum"
        );

        cumulativeVotersWeight = cumulativeVotersWeight - oldWeight + newWeight;
        voters[index].weight = newWeight;

        emit VoterWeightUpdated(voter, oldWeight, newWeight);
    }

    modifier onlyVotersRegistrar() {
        require(msg.sender == votersRegistrar, "Fn can only be used by registrar");
        _;
    }
}
