// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {ShardingTable} from "./ShardingTable.sol";
import {Ask} from "./Ask.sol";
import {IdentityStorage} from "./storage/IdentityStorage.sol";
import {ParametersStorage} from "./storage/ParametersStorage.sol";
import {ProfileStorage} from "./storage/ProfileStorage.sol";
import {ShardingTableStorage} from "./storage/ShardingTableStorage.sol";
import {StakingStorage} from "./storage/StakingStorage.sol";
import {DelegatorsInfo} from "./storage/DelegatorsInfo.sol";
import {ContractStatus} from "./abstract/ContractStatus.sol";
import {IInitializable} from "./interfaces/IInitializable.sol";
import {INamed} from "./interfaces/INamed.sol";
import {IVersioned} from "./interfaces/IVersioned.sol";
import {ProfileLib} from "./libraries/ProfileLib.sol";
import {ShardingTableLib} from "./libraries/ShardingTableLib.sol";
import {StakingLib} from "./libraries/StakingLib.sol";
import {TokenLib} from "./libraries/TokenLib.sol";
import {IdentityLib} from "./libraries/IdentityLib.sol";
import {Permissions} from "./libraries/Permissions.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {RandomSamplingStorage} from "./storage/RandomSamplingStorage.sol";
import {Chronos} from "./storage/Chronos.sol";
import {EpochStorage} from "./storage/EpochStorage.sol";

contract Staking is INamed, IVersioned, ContractStatus, IInitializable {
    string private constant _NAME = "Staking";
    string private constant _VERSION = "1.0.1";

    event StakeRedelegated(
        uint72 indexed fromIdentityId,
        uint72 indexed toIdentityId,
        address indexed delegator,
        uint96 amount
    );

    Ask public askContract;
    ShardingTableStorage public shardingTableStorage;
    ShardingTable public shardingTableContract;
    IdentityStorage public identityStorage;
    ParametersStorage public parametersStorage;
    ProfileStorage public profileStorage;
    StakingStorage public stakingStorage;
    DelegatorsInfo public delegatorsInfo;
    IERC20 public tokenContract;
    RandomSamplingStorage public randomSamplingStorage;
    Chronos public chronos;
    EpochStorage public epochStorage;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) ContractStatus(hubAddress) {}

    modifier onlyAdmin(uint72 identityId) {
        _checkAdmin(identityId);
        _;
    }

    modifier profileExists(uint72 identityId) {
        _checkProfileExists(identityId);
        _;
    }

    function initialize() public onlyHub {
        askContract = Ask(hub.getContractAddress("Ask"));
        shardingTableStorage = ShardingTableStorage(hub.getContractAddress("ShardingTableStorage"));
        shardingTableContract = ShardingTable(hub.getContractAddress("ShardingTable"));
        identityStorage = IdentityStorage(hub.getContractAddress("IdentityStorage"));
        parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));
        profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        stakingStorage = StakingStorage(hub.getContractAddress("StakingStorage"));
        delegatorsInfo = DelegatorsInfo(hub.getContractAddress("DelegatorsInfo"));
        tokenContract = IERC20(hub.getContractAddress("Token"));
        randomSamplingStorage = RandomSamplingStorage(hub.getContractAddress("RandomSamplingStorage"));
        chronos = Chronos(hub.getContractAddress("Chronos"));
        epochStorage = EpochStorage(hub.getContractAddress("EpochStorage"));
    }

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function stake(uint72 identityId, uint96 addedStake) external profileExists(identityId) {
        IERC20 token = tokenContract;
        StakingStorage ss = stakingStorage;

        if (addedStake == 0) {
            revert TokenLib.ZeroTokenAmount();
        }
        if (token.allowance(msg.sender, address(this)) < addedStake) {
            revert TokenLib.TooLowAllowance(address(token), token.allowance(msg.sender, address(this)), addedStake);
        }
        if (token.balanceOf(msg.sender) < addedStake) {
            revert TokenLib.TooLowBalance(address(token), token.balanceOf(msg.sender), addedStake);
        }

        _validateDelegatorEpochClaims(identityId, msg.sender);

        bytes32 delegatorKey = keccak256(abi.encodePacked(msg.sender));
        _prepareForStakeChange(chronos.getCurrentEpoch(), identityId, delegatorKey);

        uint96 delegatorStakeBase = stakingStorage.getDelegatorStakeBase(identityId, delegatorKey);

        uint96 totalNodeStakeBefore = ss.getNodeStake(identityId);
        uint96 totalNodeStakeAfter = totalNodeStakeBefore + addedStake;
        if (totalNodeStakeAfter > parametersStorage.maximumStake()) {
            revert StakingLib.MaximumStakeExceeded(parametersStorage.maximumStake());
        }
        ss.setDelegatorStakeBase(identityId, delegatorKey, delegatorStakeBase + addedStake);
        ss.setNodeStake(identityId, totalNodeStakeAfter);
        ss.increaseTotalStake(addedStake);

        _addNodeToShardingTable(identityId, totalNodeStakeAfter);

        askContract.recalculateActiveSet();

        _updateDelegatorState(identityId, msg.sender);

        token.transferFrom(msg.sender, address(ss), addedStake);
    }

    function redelegate(
        uint72 fromIdentityId,
        uint72 toIdentityId,
        uint96 stakeAmount
    ) external profileExists(fromIdentityId) profileExists(toIdentityId) {
        StakingStorage ss = stakingStorage;
        Ask ask = askContract;

        if (fromIdentityId == toIdentityId) {
            revert("Cannot redelegate to the same node");
        }

        if (stakeAmount == 0) {
            revert TokenLib.ZeroTokenAmount();
        }

        bytes32 delegatorKey = keccak256(abi.encodePacked(msg.sender));
        uint256 currentEpoch = chronos.getCurrentEpoch();

        _validateDelegatorEpochClaims(fromIdentityId, msg.sender);
        _validateDelegatorEpochClaims(toIdentityId, msg.sender);

        uint256 fromDelegatorEpochScore = _prepareForStakeChange(currentEpoch, fromIdentityId, delegatorKey);
        _prepareForStakeChange(currentEpoch, toIdentityId, delegatorKey);

        uint96 fromDelegatorStakeBase = ss.getDelegatorStakeBase(fromIdentityId, delegatorKey);

        if (stakeAmount > fromDelegatorStakeBase) {
            revert StakingLib.WithdrawalExceedsStake(fromDelegatorStakeBase, stakeAmount);
        }

        uint96 maxStake = parametersStorage.maximumStake();
        if (ss.getNodeStake(toIdentityId) + stakeAmount > maxStake) {
            revert StakingLib.MaximumStakeExceeded(maxStake);
        }

        uint96 newFromDelegatorStakeBase = fromDelegatorStakeBase - stakeAmount;
        uint96 totalFromNodeStakeBefore = ss.getNodeStake(fromIdentityId);
        uint96 totalFromNodeStakeAfter = totalFromNodeStakeBefore - stakeAmount;
        uint96 totalToNodeStakeBefore = ss.getNodeStake(toIdentityId);
        uint96 totalToNodeStakeAfter = totalToNodeStakeBefore + stakeAmount;

        ss.setDelegatorStakeBase(fromIdentityId, delegatorKey, newFromDelegatorStakeBase);
        ss.setNodeStake(fromIdentityId, totalFromNodeStakeAfter);

        _removeNodeFromShardingTable(fromIdentityId, totalFromNodeStakeAfter);

        ask.recalculateActiveSet();

        ss.increaseDelegatorStakeBase(toIdentityId, delegatorKey, stakeAmount);
        ss.setNodeStake(toIdentityId, totalToNodeStakeAfter);

        _addNodeToShardingTable(toIdentityId, totalToNodeStakeAfter);

        ask.recalculateActiveSet();

        if (newFromDelegatorStakeBase == 0) {
            delegatorsInfo.removeDelegator(fromIdentityId, msg.sender);
            if (fromDelegatorEpochScore > 0) {
                delegatorsInfo.setLastStakeHeldEpoch(fromIdentityId, msg.sender, currentEpoch);
            }
        }

        _updateDelegatorState(toIdentityId, msg.sender);

        emit StakeRedelegated(fromIdentityId, toIdentityId, msg.sender, stakeAmount);
    }

    function requestWithdrawal(uint72 identityId, uint96 removedStake) external profileExists(identityId) {
        StakingStorage ss = stakingStorage;

        if (removedStake == 0) {
            revert TokenLib.ZeroTokenAmount();
        }

        _validateDelegatorEpochClaims(identityId, msg.sender);

        bytes32 delegatorKey = keccak256(abi.encodePacked(msg.sender));
        uint256 currentEpoch = chronos.getCurrentEpoch();

        uint256 delegatorEpochScore = _prepareForStakeChange(currentEpoch, identityId, delegatorKey);

        uint96 delegatorStakeBase = ss.getDelegatorStakeBase(identityId, delegatorKey);
        if (removedStake > delegatorStakeBase) {
            revert StakingLib.WithdrawalExceedsStake(delegatorStakeBase, removedStake);
        }

        uint96 newDelegatorStakeBase = delegatorStakeBase - removedStake;
        uint96 totalNodeStakeBefore = ss.getNodeStake(identityId);
        uint96 totalNodeStakeAfter = totalNodeStakeBefore - removedStake;

        ss.setDelegatorStakeBase(identityId, delegatorKey, newDelegatorStakeBase);
        ss.setNodeStake(identityId, totalNodeStakeAfter);
        ss.decreaseTotalStake(removedStake);

        _removeNodeFromShardingTable(identityId, totalNodeStakeAfter);
        askContract.recalculateActiveSet();

        if (newDelegatorStakeBase == 0) {
            delegatorsInfo.removeDelegator(identityId, msg.sender);
            if (delegatorEpochScore > 0) {
                delegatorsInfo.setLastStakeHeldEpoch(identityId, msg.sender, currentEpoch);
            }
        }

        if (totalNodeStakeAfter >= parametersStorage.maximumStake()) {
            ss.transferStake(msg.sender, removedStake);
        } else {
            (uint96 prevDelegatorWithdrawalAmount, , ) = ss.getDelegatorWithdrawalRequest(identityId, delegatorKey);
            ss.createDelegatorWithdrawalRequest(
                identityId,
                delegatorKey,
                removedStake + prevDelegatorWithdrawalAmount,
                0, // no indexed rewards any more
                block.timestamp + parametersStorage.stakeWithdrawalDelay()
            );
        }
    }

    function finalizeWithdrawal(uint72 identityId) external profileExists(identityId) {
        StakingStorage ss = stakingStorage;

        bytes32 delegatorKey = keccak256(abi.encodePacked(msg.sender));
        (uint96 withdrawalAmount, , uint256 withdrawalReleaseTimestamp) = ss.getDelegatorWithdrawalRequest(
            identityId,
            delegatorKey
        );

        if (withdrawalAmount == 0) {
            revert StakingLib.WithdrawalWasntInitiated();
        }
        if (block.timestamp < withdrawalReleaseTimestamp) {
            revert StakingLib.WithdrawalPeriodPending(block.timestamp, withdrawalReleaseTimestamp);
        }

        ss.deleteDelegatorWithdrawalRequest(identityId, delegatorKey);
        ss.transferStake(msg.sender, withdrawalAmount);
    }

    function cancelWithdrawal(uint72 identityId) external profileExists(identityId) {
        StakingStorage ss = stakingStorage;

        bytes32 delegatorKey = keccak256(abi.encodePacked(msg.sender));
        (uint96 prevDelegatorWithdrawalAmount /*unused*/, , uint256 withdrawalReleaseTimestamp) = ss
            .getDelegatorWithdrawalRequest(identityId, delegatorKey);
        if (prevDelegatorWithdrawalAmount == 0) revert StakingLib.WithdrawalWasntInitiated();

        _validateDelegatorEpochClaims(identityId, msg.sender); // cannot revert stake while rewards pending
        _prepareForStakeChange(chronos.getCurrentEpoch(), identityId, delegatorKey);

        uint96 nodeStakeBefore = ss.getNodeStake(identityId);
        uint96 maxStake = parametersStorage.maximumStake();
        uint96 restake;
        uint96 keepPending = 0;

        if (nodeStakeBefore + prevDelegatorWithdrawalAmount > maxStake) {
            restake = maxStake - nodeStakeBefore; // might be zero
            keepPending = prevDelegatorWithdrawalAmount - restake;
        } else {
            restake = prevDelegatorWithdrawalAmount;
        }

        if (restake > 0) {
            uint96 newBase = ss.getDelegatorStakeBase(identityId, delegatorKey) + restake;

            ss.setDelegatorStakeBase(identityId, delegatorKey, newBase);
            ss.setNodeStake(identityId, nodeStakeBefore + restake);
            ss.increaseTotalStake(restake);

            // the delegator might have had zero stake before the cancel
            if (!delegatorsInfo.isNodeDelegator(identityId, msg.sender)) {
                delegatorsInfo.addDelegator(identityId, msg.sender);
            }

            // If delegator was inactive and is now restaking, reset their lastStakeHeldEpoch
            uint256 lastStakeHeldEpoch = delegatorsInfo.getLastStakeHeldEpoch(identityId, msg.sender);
            if (lastStakeHeldEpoch > 0) {
                delegatorsInfo.setLastStakeHeldEpoch(identityId, msg.sender, 0);
            }
        }

        if (keepPending == 0) {
            ss.deleteDelegatorWithdrawalRequest(identityId, delegatorKey); // request fully cancelled
        } else {
            ss.createDelegatorWithdrawalRequest(
                identityId,
                delegatorKey,
                keepPending,
                0, // indexed-out rewards no longer exist
                withdrawalReleaseTimestamp // keep the original release time
            );
        }

        _addNodeToShardingTable(identityId, ss.getNodeStake(identityId));
        askContract.recalculateActiveSet();
    }

    function restakeOperatorFee(uint72 identityId, uint96 addedStake) external onlyAdmin(identityId) {
        StakingStorage ss = stakingStorage;

        if (addedStake == 0) {
            revert TokenLib.ZeroTokenAmount();
        }

        uint96 oldOperatorFeeBalance = ss.getOperatorFeeBalance(identityId);
        if (addedStake > oldOperatorFeeBalance) {
            revert StakingLib.AmountExceedsOperatorFeeBalance(oldOperatorFeeBalance, addedStake);
        }

        _validateDelegatorEpochClaims(identityId, msg.sender);
        bytes32 delegatorKey = keccak256(abi.encodePacked(msg.sender));
        _prepareForStakeChange(chronos.getCurrentEpoch(), identityId, delegatorKey);

        ss.setOperatorFeeBalance(identityId, oldOperatorFeeBalance - addedStake);

        uint96 delegatorStakeBase = ss.getDelegatorStakeBase(identityId, delegatorKey);
        uint96 totalNodeStakeBefore = ss.getNodeStake(identityId);
        uint96 totalNodeStakeAfter = totalNodeStakeBefore + addedStake;

        if (totalNodeStakeAfter > parametersStorage.maximumStake()) {
            revert StakingLib.MaximumStakeExceeded(parametersStorage.maximumStake());
        }

        ss.setDelegatorStakeBase(identityId, delegatorKey, delegatorStakeBase + addedStake);
        ss.setNodeStake(identityId, totalNodeStakeAfter);
        ss.addOperatorFeeCumulativePaidOutRewards(identityId, addedStake);
        ss.increaseTotalStake(addedStake);

        _updateDelegatorState(identityId, msg.sender);

        _addNodeToShardingTable(identityId, totalNodeStakeAfter);
        askContract.recalculateActiveSet();
    }

    function requestOperatorFeeWithdrawal(uint72 identityId, uint96 withdrawalAmount) external onlyAdmin(identityId) {
        StakingStorage ss = stakingStorage;

        if (withdrawalAmount == 0) {
            revert TokenLib.ZeroTokenAmount();
        }

        uint96 oldOperatorFeeBalance = ss.getOperatorFeeBalance(identityId);
        if (withdrawalAmount > oldOperatorFeeBalance) {
            revert StakingLib.AmountExceedsOperatorFeeBalance(oldOperatorFeeBalance, withdrawalAmount);
        }

        uint256 withdrawalReleaseTimestamp = block.timestamp + parametersStorage.stakeWithdrawalDelay();
        ss.setOperatorFeeBalance(identityId, oldOperatorFeeBalance - withdrawalAmount); // bookkeeping
        ss.createOperatorFeeWithdrawalRequest(identityId, withdrawalAmount, /*indexed*/ 0, withdrawalReleaseTimestamp);
    }

    function finalizeOperatorFeeWithdrawal(uint72 identityId) external onlyAdmin(identityId) {
        StakingStorage ss = stakingStorage;

        (uint96 operatorFeeWithdrawalAmount /*unused*/, , uint256 withdrawalReleaseTimestamp) = ss
            .getOperatorFeeWithdrawalRequest(identityId);
        if (operatorFeeWithdrawalAmount == 0) revert StakingLib.WithdrawalWasntInitiated();
        if (block.timestamp < withdrawalReleaseTimestamp)
            revert StakingLib.WithdrawalPeriodPending(block.timestamp, withdrawalReleaseTimestamp);

        ss.addOperatorFeeCumulativePaidOutRewards(identityId, operatorFeeWithdrawalAmount);
        ss.transferStake(msg.sender, operatorFeeWithdrawalAmount);
    }

    function cancelOperatorFeeWithdrawal(uint72 identityId) external onlyAdmin(identityId) {
        StakingStorage ss = stakingStorage;

        uint96 operatorFeeWithdrawalAmount = ss.getOperatorFeeWithdrawalRequestAmount(identityId);
        if (operatorFeeWithdrawalAmount == 0) {
            revert StakingLib.WithdrawalWasntInitiated();
        }

        ss.deleteOperatorFeeWithdrawalRequest(identityId);
        ss.increaseOperatorFeeBalance(identityId, operatorFeeWithdrawalAmount);
    }

    function claimDelegatorRewards(
        uint72 identityId,
        uint256 epoch,
        address delegator
    ) public profileExists(identityId) {
        uint256 currentEpoch = chronos.getCurrentEpoch();
        require(epoch < currentEpoch, "Epoch not finalised");

        require(delegatorsInfo.isNodeDelegator(identityId, delegator), "Delegator not found");

        uint256 lastClaimed = delegatorsInfo.getLastClaimedEpoch(identityId, delegator);
        if (lastClaimed == currentEpoch - 1) {
            revert("Already claimed all finalised epochs");
        }

        if (epoch <= lastClaimed) {
            revert("Epoch already claimed");
        }

        if (epoch > lastClaimed + 1) {
            revert("Must claim older epochs first");
        }

        bytes32 delegatorKey = keccak256(abi.encodePacked(delegator));
        require(
            !delegatorsInfo.getEpochNodeDelegatorRewardsClaimed(epoch, identityId, delegatorKey),
            "Already claimed rewards for this epoch"
        );

        uint256 delegatorScore = _prepareForStakeChange(epoch, identityId, delegatorKey);
        uint256 nodeScore = randomSamplingStorage.getNodeEpochScore(epoch, identityId);
        uint256 totalLeftoverEpochlRewardsForDelegators = 0;
        uint256 nodeDelegatorsRewardsForEpoch = 0;

        if (!delegatorsInfo.getIsOperatorFeeClaimedForEpoch(identityId, epoch)) {
            uint256 feePercentageForEpoch = profileStorage.getLatestOperatorFeePercentage(identityId);
            uint256 allNodesScore = randomSamplingStorage.getAllNodesEpochScore(epoch);
            if (allNodesScore != 0) {
                uint256 epocRewardsPool = epochStorage.getEpochPool(1, epoch);
                nodeDelegatorsRewardsForEpoch = (epocRewardsPool * nodeScore) / allNodesScore;
            }

            uint96 operatorFeeAmount = uint96((nodeDelegatorsRewardsForEpoch * feePercentageForEpoch) / 10000);
            totalLeftoverEpochlRewardsForDelegators = nodeDelegatorsRewardsForEpoch - operatorFeeAmount;
            stakingStorage.increaseOperatorFeeBalance(identityId, operatorFeeAmount);
            delegatorsInfo.setIsOperatorFeeClaimedForEpoch(identityId, epoch, true);
            delegatorsInfo.setLastClaimedDelegatorsRewardsEpoch(identityId, epoch);
            // Set the calculated total rewards for delegators for this epoch
            delegatorsInfo.setEpochLeftoverDelegatorsRewards(
                identityId,
                epoch,
                totalLeftoverEpochlRewardsForDelegators
            );
        } else {
            totalLeftoverEpochlRewardsForDelegators = delegatorsInfo.getEpochLeftoverDelegatorsRewards(
                identityId,
                epoch
            );
        }

        //TODO check scaling factor
        uint256 reward = (delegatorScore == 0 || nodeScore == 0 || totalLeftoverEpochlRewardsForDelegators == 0)
            ? 0
            : (delegatorScore * totalLeftoverEpochlRewardsForDelegators) / nodeScore;

        // update state even when reward is zero
        delegatorsInfo.setEpochNodeDelegatorRewardsClaimed(epoch, identityId, delegatorKey, true);
        uint256 lastClaimedEpoch = delegatorsInfo.getLastClaimedEpoch(identityId, delegator);
        delegatorsInfo.setLastClaimedEpoch(identityId, delegator, epoch);

        // Check if this completes all required claims and reset lastStakeHeldEpoch
        uint256 lastStakeHeldEpoch = delegatorsInfo.getLastStakeHeldEpoch(identityId, delegator);
        if (lastStakeHeldEpoch > 0 && epoch >= lastStakeHeldEpoch) {
            // They've now claimed all rewards they're entitled to, reset the tracker
            delegatorsInfo.setLastStakeHeldEpoch(identityId, delegator, 0);
        }

        if (reward == 0) return;

        uint256 rolling = delegatorsInfo.getDelegatorRollingRewards(identityId, delegator);

        // if there are still older epochs pending, accumulate; otherwise restake immediately
        if ((currentEpoch - 1) - lastClaimedEpoch > 1) {
            delegatorsInfo.setDelegatorRollingRewards(identityId, delegator, rolling + reward);
        } else {
            uint256 total = reward + rolling;
            delegatorsInfo.setDelegatorRollingRewards(identityId, delegator, 0);

            stakingStorage.increaseDelegatorStakeBase(identityId, delegatorKey, uint96(total));
            stakingStorage.increaseNodeStake(identityId, uint96(total));
            stakingStorage.increaseTotalStake(uint96(total));
        }
        //Should it increase on roling rewards or on stakeBaseIncrease only?
        stakingStorage.addDelegatorCumulativeEarnedRewards(identityId, delegatorKey, uint96(reward));
    }

    function batchClaimDelegatorRewards(
        uint72 identityId,
        uint256[] memory epochs,
        address[] memory delegators
    ) external profileExists(identityId) {
        for (uint256 i = 0; i < epochs.length; i++) {
            for (uint256 j = 0; j < delegators.length; j++) {
                claimDelegatorRewards(identityId, epochs[i], delegators[j]);
            }
        }
    }

    /**
     * @dev Calculate the estimated rewards for a delegator in an epoch
     * @param identityId Node's identity ID
     * @param epoch Epoch number
     * @param delegator Delegator's address
     * @return Estimated rewards for the delegator in the epoch
     */
    function getEstimatedRewards(uint72 identityId, uint256 epoch, address delegator) external view returns (uint256) {
        require(delegatorsInfo.isNodeDelegator(identityId, delegator), "Delegator not found");

        bytes32 delegatorKey = keccak256(abi.encodePacked(delegator));

        uint256 delegatorScore = _simulatePrepareForStakeChange(epoch, identityId, delegatorKey);
        if (delegatorScore == 0) return 0;

        uint256 nodeScore = randomSamplingStorage.getNodeEpochScore(epoch, identityId);
        if (nodeScore == 0) return 0;

        // Calculate the final delegators rewards pool
        uint256 netDelegatorsRewards = getNetDelegatorsRewards(identityId, epoch);

        if (netDelegatorsRewards == 0) return 0;

        return (delegatorScore * netDelegatorsRewards) / nodeScore;
    }

    /**
     * @dev Fetch the net rewards for delegators in an epoch (rewards of node's delegators - operator fee)
     * @param identityId Node's identity ID
     * @param epoch Epoch number
     * @return Net rewards for delegators in the epoch
     */
    function getNetDelegatorsRewards(
        uint72 identityId,
        uint256 epoch
    ) public view profileExists(identityId) returns (uint256) {
        // If the operator fee has been claimed, return the net delegators rewards
        if (delegatorsInfo.getIsOperatorFeeClaimedForEpoch(identityId, epoch)) {
            return delegatorsInfo.getEpochLeftoverDelegatorsRewards(identityId, epoch);
        }

        uint256 nodeScore = randomSamplingStorage.getNodeEpochScore(epoch, identityId);
        if (nodeScore == 0) return 0;

        uint256 allNodesScore = randomSamplingStorage.getAllNodesEpochScore(epoch);
        if (allNodesScore == 0) return 0;

        uint256 epocRewardsPool = epochStorage.getEpochPool(1, epoch);
        if (epocRewardsPool == 0) return 0;

        uint256 totalNodeDelegatorsRewards = (epocRewardsPool * nodeScore) / allNodesScore;

        uint256 feePercentageForEpoch = profileStorage.getLatestOperatorFeePercentage(identityId);
        uint96 operatorFeeAmount = uint96((totalNodeDelegatorsRewards * feePercentageForEpoch) / 10000);

        return totalNodeDelegatorsRewards - operatorFeeAmount;
    }

    function _validateDelegatorEpochClaims(uint72 identityId, address delegator) internal {
        bytes32 delegatorKey = keccak256(abi.encodePacked(delegator));
        uint256 lastClaimedEpoch = delegatorsInfo.getLastClaimedEpoch(identityId, delegator);
        uint256 currentEpoch = chronos.getCurrentEpoch();
        uint256 previousEpoch = currentEpoch - 1;

        if (delegatorsInfo.hasEverDelegatedToNode(identityId, delegator)) {
            // If delegator has delegated to the node before, and has removed all their stake from the node at some point
            if (stakingStorage.getDelegatorStakeBase(identityId, delegatorKey) == 0) {
                uint256 lastStakeHeldEpoch = delegatorsInfo.getLastStakeHeldEpoch(identityId, delegator);
                // If lastStakeHeldEpoch > 0 and < currentEpoch, delegator has unclaimed rewards for a past epoch
                if (lastStakeHeldEpoch > 0 && lastStakeHeldEpoch < currentEpoch) {
                    revert("Must claim rewards up to the lastStakeHeldEpoch before changing stake");
                }
                // If lastStakeHeldEpoch == currentEpoch, rewards aren't claimable yet - allow operation
                // If lastStakeHeldEpoch == 0, delegator claimed all rewards they are entitled to
                delegatorsInfo.setLastClaimedEpoch(identityId, delegator, previousEpoch);
            }
        } else {
            // delegator is delegating to a node for the first time ever, set the last claimed epoch to the previous epoch
            delegatorsInfo.setLastClaimedEpoch(identityId, delegator, previousEpoch);
        }

        // If delegator is up to date with claims, no validation needed
        if (lastClaimedEpoch == previousEpoch) {
            return;
        }

        // Check if delegator has multiple unclaimed epochs
        if (lastClaimedEpoch < previousEpoch - 1) {
            revert("Must claim all previous epoch rewards before changing stake");
        }

        // Delegator has exactly one unclaimed epoch (previousEpoch)
        // Check if there are actually rewards to claim for that epoch
        uint256 delegatorScore = randomSamplingStorage.getEpochNodeDelegatorScore(
            previousEpoch,
            identityId,
            delegatorKey
        );

        uint256 nodeScorePerStake = randomSamplingStorage.getNodeEpochScorePerStake(previousEpoch, identityId);

        uint256 delegatorLastSettledScorePerStake = randomSamplingStorage.getDelegatorLastSettledNodeEpochScorePerStake(
            previousEpoch,
            identityId,
            delegatorKey
        );

        // If no rewards exist for this delegator in the previous epoch, auto-advance their claim state
        if (delegatorScore == 0 && nodeScorePerStake == delegatorLastSettledScorePerStake) {
            delegatorsInfo.setLastClaimedEpoch(identityId, delegator, previousEpoch);
            return;
        }

        // Delegator has unclaimed rewards that must be claimed first
        revert("Must claim the previous epoch rewards before changing stake");
    }

    function _updateDelegatorState(uint72 identityId, address delegator) internal {
        if (!delegatorsInfo.isNodeDelegator(identityId, delegator)) {
            delegatorsInfo.addDelegator(identityId, delegator);
        }

        if (!delegatorsInfo.hasEverDelegatedToNode(identityId, delegator)) {
            delegatorsInfo.setHasEverDelegatedToNode(identityId, delegator, true);
        }

        // If delegator was inactive and is now staking again, reset their lastStakeHeldEpoch
        uint256 lastStakeHeldEpoch = delegatorsInfo.getLastStakeHeldEpoch(identityId, delegator);
        if (lastStakeHeldEpoch > 0) {
            delegatorsInfo.setLastStakeHeldEpoch(identityId, delegator, 0);
        }
    }

    function _calculateScoreEarned(
        uint256 nodeScorePerStake,
        uint256 delegatorLastSettledNodeEpochScorePerStake,
        uint96 stakeBase
    ) internal pure returns (uint256) {
        if (nodeScorePerStake == delegatorLastSettledNodeEpochScorePerStake) {
            return 0;
        }
        uint256 diff = nodeScorePerStake - delegatorLastSettledNodeEpochScorePerStake; // scaled 1e18
        return (uint256(stakeBase) * diff) / 1e18;
    }

    function _prepareForStakeChange(
        uint256 epoch,
        uint72 identityId,
        bytes32 delegatorKey
    ) internal returns (uint256 delegatorEpochScore) {
        uint256 nodeScorePerStake = randomSamplingStorage.getNodeEpochScorePerStake(epoch, identityId);
        uint256 currentDelegatorScore = randomSamplingStorage.getEpochNodeDelegatorScore(
            epoch,
            identityId,
            delegatorKey
        );
        uint256 delegatorLastSettledNodeEpochScorePerStake = randomSamplingStorage
            .getDelegatorLastSettledNodeEpochScorePerStake(epoch, identityId, delegatorKey);

        if (nodeScorePerStake == delegatorLastSettledNodeEpochScorePerStake) {
            return currentDelegatorScore;
        }

        uint96 stakeBase = stakingStorage.getDelegatorStakeBase(identityId, delegatorKey);

        if (stakeBase == 0) {
            randomSamplingStorage.setDelegatorLastSettledNodeEpochScorePerStake(
                epoch,
                identityId,
                delegatorKey,
                nodeScorePerStake
            );
            return currentDelegatorScore;
        }

        uint256 scoreEarned = _calculateScoreEarned(
            nodeScorePerStake,
            delegatorLastSettledNodeEpochScorePerStake,
            stakeBase
        );

        if (scoreEarned > 0) {
            randomSamplingStorage.addToEpochNodeDelegatorScore(epoch, identityId, delegatorKey, scoreEarned);
        }

        randomSamplingStorage.setDelegatorLastSettledNodeEpochScorePerStake(
            epoch,
            identityId,
            delegatorKey,
            nodeScorePerStake
        );

        return currentDelegatorScore + scoreEarned;
    }

    function _simulatePrepareForStakeChange(
        uint256 epoch,
        uint72 identityId,
        bytes32 delegatorKey
    ) internal view returns (uint256 delegatorScore) {
        uint256 nodeScorePerStake = randomSamplingStorage.getNodeEpochScorePerStake(epoch, identityId);
        uint256 currentDelegatorScore = randomSamplingStorage.getEpochNodeDelegatorScore(
            epoch,
            identityId,
            delegatorKey
        );
        uint256 delegatorLastSettledNodeEpochScorePerStake = randomSamplingStorage
            .getDelegatorLastSettledNodeEpochScorePerStake(epoch, identityId, delegatorKey);

        if (nodeScorePerStake == delegatorLastSettledNodeEpochScorePerStake) {
            return currentDelegatorScore;
        }

        uint96 stakeBase = stakingStorage.getDelegatorStakeBase(identityId, delegatorKey);

        if (stakeBase == 0) {
            return currentDelegatorScore;
        }

        uint256 scoreEarned = _calculateScoreEarned(
            nodeScorePerStake,
            delegatorLastSettledNodeEpochScorePerStake,
            stakeBase
        );
        return currentDelegatorScore + scoreEarned;
    }

    function _addNodeToShardingTable(uint72 identityId, uint96 newStake) internal {
        ShardingTableStorage sts = shardingTableStorage;
        ParametersStorage params = parametersStorage;

        if (!sts.nodeExists(identityId) && newStake >= params.minimumStake()) {
            if (sts.nodesCount() >= params.shardingTableSizeLimit()) {
                revert ShardingTableLib.ShardingTableIsFull();
            }
            shardingTableContract.insertNode(identityId);
        }
    }

    function _removeNodeFromShardingTable(uint72 identityId, uint96 newStake) internal {
        if (shardingTableStorage.nodeExists(identityId) && newStake < parametersStorage.minimumStake()) {
            shardingTableContract.removeNode(identityId);
        }
    }

    function _checkAdmin(uint72 identityId) internal view virtual {
        if (
            !identityStorage.keyHasPurpose(identityId, keccak256(abi.encodePacked(msg.sender)), IdentityLib.ADMIN_KEY)
        ) {
            revert Permissions.OnlyProfileAdminFunction(msg.sender);
        }
    }

    function _checkProfileExists(uint72 identityId) internal view virtual {
        if (!profileStorage.profileExists(identityId)) {
            revert ProfileLib.ProfileDoesntExist(identityId);
        }
    }
}
