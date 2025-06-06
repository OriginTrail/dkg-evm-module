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

        // Check if this is first time staking
        if (!delegatorsInfo.isNodeDelegator(identityId, msg.sender)) {
            delegatorsInfo.addDelegator(identityId, msg.sender);
        }

        if (!delegatorsInfo.hasEverDelegatedToNode(identityId, msg.sender)) {
            delegatorsInfo.setHasEverDelegatedToNode(identityId, msg.sender, true);
        }

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

        // Validate that all claims have been settled for the source node before changing stake
        _validateDelegatorEpochClaims(fromIdentityId, msg.sender);
        _prepareForStakeChange(chronos.getCurrentEpoch(), fromIdentityId, delegatorKey);

        // Validate that all claims have been settled for the destination node before changing stake
        uint256 previousEpoch = chronos.getCurrentEpoch() - 1;
        bool hasEverDelegatedToNode = delegatorsInfo.hasEverDelegatedToNode(toIdentityId, msg.sender);
        uint96 toDelegatorStakeBase = ss.getDelegatorStakeBase(toIdentityId, delegatorKey);

        // If delegator is not delegating to a node for the first time ever, continue with checks
        if (hasEverDelegatedToNode) {
            // If delegator has delegated to the node before, and has removed all their stake from the node (meaning they also claimed all epoch rewards they are entitled to), set the last claimed epoch to the previous epoch
            if (toDelegatorStakeBase == 0) {
                delegatorsInfo.setLastClaimedEpoch(toIdentityId, msg.sender, previousEpoch);
            }
        } else {
            // delegator is delegating to a node for the first time ever, set the last claimed epoch to the previous epoch
            delegatorsInfo.setLastClaimedEpoch(toIdentityId, msg.sender, previousEpoch);
        }

        // Validate that all claims have been settled for the destination node before changing stake
        _validateDelegatorEpochClaims(toIdentityId, msg.sender);
        _prepareForStakeChange(chronos.getCurrentEpoch(), toIdentityId, delegatorKey);

        uint96 fromDelegatorStakeBase = ss.getDelegatorStakeBase(fromIdentityId, delegatorKey);

        if (stakeAmount > fromDelegatorStakeBase) {
            revert StakingLib.WithdrawalExceedsStake(fromDelegatorStakeBase, stakeAmount);
        }

        uint96 maxStake = parametersStorage.maximumStake();
        if (ss.getNodeStake(toIdentityId) + stakeAmount > maxStake) {
            revert StakingLib.MaximumStakeExceeded(maxStake);
        }

        // calculate new delegator stake base on the source node
        uint96 newFromDelegatorStakeBase = fromDelegatorStakeBase - stakeAmount;

        // calculate new total node stake on the source node
        uint96 totalFromNodeStakeBefore = ss.getNodeStake(fromIdentityId);
        uint96 totalFromNodeStakeAfter = totalFromNodeStakeBefore - stakeAmount;

        // calculate new total node stake on the destination node
        uint96 totalToNodeStakeBefore = ss.getNodeStake(toIdentityId);
        uint96 totalToNodeStakeAfter = totalToNodeStakeBefore + stakeAmount;

        // update the delegator stake base and the total node stake on the source node
        ss.setDelegatorStakeBase(fromIdentityId, delegatorKey, newFromDelegatorStakeBase);
        ss.setNodeStake(fromIdentityId, totalFromNodeStakeAfter);

        _removeNodeFromShardingTable(fromIdentityId, totalFromNodeStakeAfter);

        ask.recalculateActiveSet();

        // update the delegator stake base and the total node stake on the destination node
        ss.increaseDelegatorStakeBase(toIdentityId, delegatorKey, stakeAmount);
        ss.setNodeStake(toIdentityId, totalToNodeStakeAfter);

        _addNodeToShardingTable(toIdentityId, totalToNodeStakeAfter);

        ask.recalculateActiveSet();

        // Check if all stake is being removed from the source node
        if (newFromDelegatorStakeBase == 0) {
            delegatorsInfo.removeDelegator(fromIdentityId, msg.sender);
        }
        // Check if delegator is recorded as a delegator on the destination node
        if (!delegatorsInfo.isNodeDelegator(toIdentityId, msg.sender)) {
            delegatorsInfo.addDelegator(toIdentityId, msg.sender);
        }
        // Check if delegator has ever delegated to the destination node
        if (!delegatorsInfo.hasEverDelegatedToNode(toIdentityId, msg.sender)) {
            delegatorsInfo.setHasEverDelegatedToNode(toIdentityId, msg.sender, true);
        }

        emit StakeRedelegated(fromIdentityId, toIdentityId, msg.sender, stakeAmount);
    }

    function requestWithdrawal(uint72 identityId, uint96 removedStake) external profileExists(identityId) {
        StakingStorage ss = stakingStorage;

        if (removedStake == 0) {
            revert TokenLib.ZeroTokenAmount();
        }

        _validateDelegatorEpochClaims(identityId, msg.sender);

        bytes32 delegatorKey = keccak256(abi.encodePacked(msg.sender));

        _prepareForStakeChange(chronos.getCurrentEpoch(), identityId, delegatorKey);

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

        _validateDelegatorEpochClaims(identityId, msg.sender); // -- last-claimed check
        bytes32 operatorKey = keccak256(abi.encodePacked(msg.sender));
        _prepareForStakeChange(chronos.getCurrentEpoch(), identityId, operatorKey); // -- settle epoch score

        ss.setOperatorFeeBalance(identityId, oldOperatorFeeBalance - addedStake);

        uint96 delegatorStakeBase = ss.getDelegatorStakeBase(identityId, operatorKey);
        uint96 totalNodeStakeBefore = ss.getNodeStake(identityId);
        uint96 totalNodeStakeAfter = totalNodeStakeBefore + addedStake;

        if (totalNodeStakeAfter > parametersStorage.maximumStake()) {
            revert StakingLib.MaximumStakeExceeded(parametersStorage.maximumStake());
        }

        ss.setDelegatorStakeBase(identityId, operatorKey, delegatorStakeBase + addedStake);
        ss.setNodeStake(identityId, totalNodeStakeAfter);
        ss.addOperatorFeeCumulativePaidOutRewards(identityId, addedStake); // bookkeeping
        ss.increaseTotalStake(addedStake);

        if (!delegatorsInfo.isNodeDelegator(identityId, msg.sender)) {
            // admin might be staking for the first time
            delegatorsInfo.addDelegator(identityId, msg.sender);
        }

        if (!delegatorsInfo.hasEverDelegatedToNode(identityId, msg.sender)) {
            delegatorsInfo.setHasEverDelegatedToNode(identityId, msg.sender, true);
        }

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

    // function getOperatorStats(uint72 identityId) external view returns (uint96, uint96, uint96) {
    //     StakingStorage ss = stakingStorage;

    //     bytes32[] memory adminKeys = identityStorage.getKeysByPurpose(identityId, IdentityLib.ADMIN_KEY);

    //     uint96 totalSimBase;
    //     uint96 totalSimIndexed;
    //     uint96 totalSimUnrealized;
    //     uint96 totalEarned;
    //     uint96 totalPaidOut;
    //     for (uint256 i; i < adminKeys.length; i++) {
    //         (uint96 simBase, uint96 simIndexed, uint96 simUnrealized) = simulateStakeInfoUpdate(
    //             identityId,
    //             adminKeys[i]
    //         );

    //         (uint96 operatorEarned, uint96 operatorPaidOut) = ss.getDelegatorRewardsInfo(identityId, adminKeys[i]);

    //         totalSimBase += simBase;
    //         totalSimIndexed += simIndexed;
    //         totalSimUnrealized += simUnrealized;
    //         totalEarned += operatorEarned;
    //         totalPaidOut += operatorPaidOut;
    //     }

    //     return (totalSimBase + totalSimIndexed, totalEarned + totalSimUnrealized - totalPaidOut, totalPaidOut);
    // }

    // function getNodeStats(uint72 identityId) external view returns (uint96, uint96, uint96) {
    //     return stakingStorage.getNodeRewardsInfo(identityId);
    // }

    // function getOperatorFeeStats(uint72 identityId) external view returns (uint96, uint96, uint96) {
    //     return stakingStorage.getNodeOperatorFeesInfo(identityId);
    // }

    // function getDelegatorStats(uint72 identityId, address delegator) external view returns (uint96, uint96, uint96) {
    //     bytes32 delegatorKey = keccak256(abi.encodePacked(delegator));
    //     (uint96 simBase, uint96 simIndexed, uint96 simUnrealized) = simulateStakeInfoUpdate(identityId, delegatorKey);

    //     (uint96 delegatorEarned, uint96 delegatorPaidOut) = stakingStorage.getDelegatorRewardsInfo(
    //         identityId,
    //         delegatorKey
    //     );

    //     return (simBase + simIndexed, delegatorEarned + simUnrealized - delegatorPaidOut, delegatorPaidOut);
    // }

    // function simulateStakeInfoUpdate(
    //     uint72 identityId,
    //     bytes32 delegatorKey
    // ) public view returns (uint96, uint96, uint96) {
    //     uint256 nodeRewardIndex = stakingStorage.getNodeRewardIndex(identityId);

    //     (uint96 delegatorStakeBase, uint96 delegatorStakeIndexed, uint256 delegatorLastRewardIndex) = stakingStorage
    //         .getDelegatorStakeInfo(identityId, delegatorKey);

    //     if (nodeRewardIndex <= delegatorLastRewardIndex) {
    //         return (delegatorStakeBase, delegatorStakeIndexed, 0);
    //     }

    //     uint256 diff = nodeRewardIndex - delegatorLastRewardIndex;
    //     uint256 currentStake = uint256(delegatorStakeBase) + uint256(delegatorStakeIndexed);
    //     uint96 additionalReward = uint96((currentStake * diff) / 1e18);

    //     return (delegatorStakeBase, delegatorStakeIndexed + additionalReward, additionalReward);
    // }

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

        uint256 delegatorsRewards = (epocRewardsPool * nodeScore) / allNodesScore;

        uint256 feePercentageForEpoch = profileStorage.getLatestOperatorFeePercentage(identityId);
        uint96 operatorFeeAmount = uint96((delegatorsRewards * feePercentageForEpoch) / 10000);

        return delegatorsRewards - operatorFeeAmount;
    }

    function getNodeRewardsForEpoch(
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

        uint256 nodeRewardsForEpoch = (epocRewardsPool * nodeScore) / allNodesScore;

        return nodeRewardsForEpoch;
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
        uint256 epocRewardsPool = getNodeRewardsForEpoch(identityId, epoch);
        uint256 totalLeftoverEpochlRewardsForDelegators = 0;

        if (!delegatorsInfo.getIsOperatorFeeClaimedForEpoch(identityId, epoch)) {
            uint256 feePercentageForEpoch = profileStorage.getLatestOperatorFeePercentage(identityId);
            uint96 operatorFeeAmount = uint96((epocRewardsPool * feePercentageForEpoch) / 10000);
            totalLeftoverEpochlRewardsForDelegators = epocRewardsPool - operatorFeeAmount;
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

    function _validateDelegatorEpochClaims(uint72 identityId, address delegator) internal {
        bytes32 delegatorKey = keccak256(abi.encodePacked(delegator));
        uint256 currentEpoch = chronos.getCurrentEpoch();
        uint256 lastClaimedEpoch = delegatorsInfo.getLastClaimedEpoch(identityId, delegator);
        uint256 previousEpoch = currentEpoch - 1;

        // If delegator is up to date with claims, no validation needed
        if (lastClaimedEpoch == previousEpoch) {
            return;
        }

        // Check if delegator has multiple unclaimed epochs
        if (lastClaimedEpoch < currentEpoch - 2) {
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

    function _prepareForStakeChange(
        uint256 epoch,
        uint72 identityId,
        bytes32 delegatorKey
    ) internal returns (uint256 delegatorEpochScore) {
        // 1. Current "score-per-stake"
        uint256 nodeScorePerStake = randomSamplingStorage.getNodeEpochScorePerStake(epoch, identityId);

        uint256 currentDelegatorScore = randomSamplingStorage.getEpochNodeDelegatorScore(
            epoch,
            identityId,
            delegatorKey
        );

        // 2. Last index at which this delegator was settled
        uint256 delegatorLastSettledNodeEpochScorePerStake = randomSamplingStorage
            .getDelegatorLastSettledNodeEpochScorePerStake(epoch, identityId, delegatorKey);

        // Nothing new to settle
        if (nodeScorePerStake == delegatorLastSettledNodeEpochScorePerStake) {
            return currentDelegatorScore;
        }

        uint96 stakeBase = stakingStorage.getDelegatorStakeBase(identityId, delegatorKey);

        // If the delegator has no stake, just bump the index and exit
        if (stakeBase == 0) {
            randomSamplingStorage.setDelegatorLastSettledNodeEpochScorePerStake(
                epoch,
                identityId,
                delegatorKey,
                nodeScorePerStake
            );
            return currentDelegatorScore;
        }
        // 4. Newly earned score for this delegator in the epoch
        uint256 diff = nodeScorePerStake - delegatorLastSettledNodeEpochScorePerStake; // scaled 1e18
        uint256 scoreEarned = (uint256(stakeBase) * diff) / 1e18;

        // 5. Persist results
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
