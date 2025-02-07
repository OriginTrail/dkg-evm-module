// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {Hub} from "../storage/Hub.sol";
import {HubDependent} from "../abstract/HubDependent.sol";
import {ParanetsRegistry} from "../storage/paranets/ParanetsRegistry.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ParanetNeuroIncentivesPool} from "./ParanetNeuroIncentivesPool.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {INamed} from "../interfaces/INamed.sol";
import {IVersioned} from "../interfaces/IVersioned.sol";
import {ParanetLib} from "../libraries/ParanetLib.sol";

// TODO: Large Arrays in getAllRewardedMiners() / getAllRewardedOperators() / getVoters()
//       If this arrays are too large maybe introduce pagination?
// TODO: There is no selective voter remove function
// TODO: When working with arrays check if it's empty
// TODO: Add getter for length, at index, reverse look up for arrays

contract ParanetNeuroIncentivesPoolStorage is INamed, IVersioned, HubDependent {
    event NeuroRewardDeposit(address sender, uint256 amount);

    string private constant _NAME = "ParanetNeuroIncentivesPoolStorage";
    string private constant _VERSION = "1.0.0";

    IERC20 public token;
    ParanetsRegistry public paranetsRegistry;
    ParanetNeuroIncentivesPool public paranetNeuroIncentivesPool;
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

    uint16 public cumulativeVotersWeight;
    ParanetLib.ParanetIncentivizationProposalVoter[] public voters;
    mapping(address => uint256) public votersIndexes;

    constructor(
        address hubAddress,
        address rewardTokenAddress,
        address paranetsRegistryAddress,
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
        paranetsRegistry = ParanetsRegistry(paranetsRegistryAddress);

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

    function addVoters(
        ParanetLib.ParanetIncentivizationProposalVoterInput[] calldata voters_
    ) external onlyVotersRegistrar {
        for (uint256 i; i < voters_.length; ) {
            address voterAddr = voters_[i].addr;
            uint16 weight = uint16(voters_[i].weight);

            require(voterAddr != address(0), "Zero address is not a valid voter");

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

    // What if voterAddress doesn't exist, would this remove voter at index 0???
    function removeVoter(address voterAddress) external onlyVotersRegistrar {
        uint256 index = votersIndexes[voterAddress];
        ParanetLib.ParanetIncentivizationProposalVoter memory voterToRemove = voters[index];
        require(voterToRemove.addr == voterAddress, "Voter not found");

        uint16 removedWeight = uint16(voterToRemove.weight);

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

    /**
     * @notice Increments the `claimedNeuro` for a specific voter by `amount`.
     */
    function addVoterClaimedNeuro(address voter, uint256 amount) external {
        // Only the main pool contract or an allowed address can do this.
        require(msg.sender == address(paranetNeuroIncentivesPool), "Not authorized to add claim");

        uint256 idx = votersIndexes[voter];
        if (idx < voters.length && voters[idx].addr == voter) {
            voters[idx].claimedNeuro += amount;
        }
    }

    function getClaimedMinerRewardsLength() external view returns (uint256) {
        return claimedMinerRewards.length;
    }

    // TODO: paranetId is public, maybe remove getter and access it directly
    function getParanetId() public view returns (bytes32) {
        return paranetId;
    }

    // This should only be done through hub registerd contracts
    function setParanetNeuroIncentivesPool(address paranetNeuroIncentivesPoolAddress) external onlyContracts {
        paranetNeuroIncentivesPool = ParanetNeuroIncentivesPool(paranetNeuroIncentivesPoolAddress);
    }

    function transferReward(address rewardAddress, uint256 amount) public {
        require(msg.sender == address(paranetNeuroIncentivesPool), "Not authorized to add claim");
        if (address(token) == address(0)) {
            payable(rewardAddress).transfer(amount);
        } else {
            token.transfer(rewardAddress, amount);
        }
    }

    function getBalance() public view returns (uint256) {
        if (address(token) == address(0)) {
            return address(this).balance;
        } else {
            return token.balanceOf(address(this));
        }
    }
}
