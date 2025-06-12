// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {IdentityStorage} from "./storage/IdentityStorage.sol";
import {ProfileStorage} from "./storage/ProfileStorage.sol";
import {StakingStorage} from "./storage/StakingStorage.sol";
import {DelegatorsInfo} from "./storage/DelegatorsInfo.sol";
import {ContractStatus} from "./abstract/ContractStatus.sol";
import {IInitializable} from "./interfaces/IInitializable.sol";
import {INamed} from "./interfaces/INamed.sol";
import {IVersioned} from "./interfaces/IVersioned.sol";
import {ProfileLib} from "./libraries/ProfileLib.sol";
import {IdentityLib} from "./libraries/IdentityLib.sol";
import {EpochStorage} from "./storage/EpochStorage.sol";
import {RandomSamplingStorage} from "./storage/RandomSamplingStorage.sol";

contract StakingKPI is INamed, IVersioned, ContractStatus, IInitializable {
    string private constant _NAME = "StakingKPI";
    string private constant _VERSION = "1.0.0";
    uint256 public constant SCALE18 = 1e18;

    IdentityStorage public identityStorage;
    ProfileStorage public profileStorage;
    StakingStorage public stakingStorage;
    DelegatorsInfo public delegatorsInfo;
    RandomSamplingStorage public randomSamplingStorage;
    EpochStorage public epochStorage;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) ContractStatus(hubAddress) {}

    modifier profileExists(uint72 identityId) {
        _checkProfileExists(identityId);
        _;
    }

    function initialize() public onlyHub {
        identityStorage = IdentityStorage(hub.getContractAddress("IdentityStorage"));
        profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        stakingStorage = StakingStorage(hub.getContractAddress("StakingStorage"));
        delegatorsInfo = DelegatorsInfo(hub.getContractAddress("DelegatorsInfo"));
        randomSamplingStorage = RandomSamplingStorage(hub.getContractAddress("RandomSamplingStorage"));
        epochStorage = EpochStorage(hub.getContractAddress("EpochStorageV8"));
    }

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function getOperatorStats(uint72 identityId) external view returns (uint96, uint96, uint96) {
        StakingStorage ss = stakingStorage;

        bytes32[] memory adminKeys = identityStorage.getKeysByPurpose(identityId, IdentityLib.ADMIN_KEY);

        uint96 totalSimBase;
        uint96 totalSimIndexed;
        uint96 totalSimUnrealized;
        uint96 totalEarned;
        uint96 totalPaidOut;
        for (uint256 i; i < adminKeys.length; i++) {
            (uint96 simBase, uint96 simIndexed, uint96 simUnrealized) = simulateStakeInfoUpdate(
                identityId,
                adminKeys[i]
            );

            (uint96 operatorEarned, uint96 operatorPaidOut) = ss.getDelegatorRewardsInfo(identityId, adminKeys[i]);

            totalSimBase += simBase;
            totalSimIndexed += simIndexed;
            totalSimUnrealized += simUnrealized;
            totalEarned += operatorEarned;
            totalPaidOut += operatorPaidOut;
        }

        return (totalSimBase + totalSimIndexed, totalEarned + totalSimUnrealized - totalPaidOut, totalPaidOut);
    }

    function getNodeStats(uint72 identityId) external view returns (uint96, uint96, uint96) {
        return stakingStorage.getNodeRewardsInfo(identityId);
    }

    function getOperatorFeeStats(uint72 identityId) external view returns (uint96, uint96, uint96) {
        return stakingStorage.getNodeOperatorFeesInfo(identityId);
    }

    function getDelegatorStats(uint72 identityId, address delegator) external view returns (uint96, uint96, uint96) {
        bytes32 delegatorKey = keccak256(abi.encodePacked(delegator));
        (uint96 simBase, uint96 simIndexed, uint96 simUnrealized) = simulateStakeInfoUpdate(identityId, delegatorKey);

        (uint96 delegatorEarned, uint96 delegatorPaidOut) = stakingStorage.getDelegatorRewardsInfo(
            identityId,
            delegatorKey
        );

        return (simBase + simIndexed, delegatorEarned + simUnrealized - delegatorPaidOut, delegatorPaidOut);
    }

    function simulateStakeInfoUpdate(
        uint72 identityId,
        bytes32 delegatorKey
    ) public view returns (uint96, uint96, uint96) {
        uint256 nodeRewardIndex = stakingStorage.getNodeRewardIndex(identityId);

        (uint96 delegatorStakeBase, uint96 delegatorStakeIndexed, uint256 delegatorLastRewardIndex) = stakingStorage
            .getDelegatorStakeInfo(identityId, delegatorKey);

        if (nodeRewardIndex <= delegatorLastRewardIndex) {
            return (delegatorStakeBase, delegatorStakeIndexed, 0);
        }

        uint256 diff = nodeRewardIndex - delegatorLastRewardIndex;
        uint256 currentStake = uint256(delegatorStakeBase) + uint256(delegatorStakeIndexed);
        uint96 additionalReward = uint96((currentStake * diff) / 1e18);

        return (delegatorStakeBase, delegatorStakeIndexed + additionalReward, additionalReward);
    }

    /**
     * @dev Calculate the reward for a delegator in an epoch (correct only for the finalized epochs)
     * @param identityId Node's identity ID
     * @param epoch Epoch number
     * @param delegator Delegator's address
     * @return Reward for the delegator in the epoch
     */
    function getDelegatorReward(
        uint72 identityId,
        uint256 epoch,
        address delegator
    ) external view profileExists(identityId) returns (uint256) {
        require(delegatorsInfo.isNodeDelegator(identityId, delegator), "Delegator not found");

        bytes32 delegatorKey = keccak256(abi.encodePacked(delegator));

        uint256 delegatorScore18 = _simulatePrepareForStakeChange(epoch, identityId, delegatorKey);
        if (delegatorScore18 == 0) return 0;

        uint256 nodeScore18 = randomSamplingStorage.getNodeEpochScore(epoch, identityId);
        if (nodeScore18 == 0) return 0;

        // Calculate the final delegators rewards pool
        uint256 netNodeRewards = getNetNodeRewards(identityId, epoch);

        if (netNodeRewards == 0) return 0;

        return (delegatorScore18 * netNodeRewards) / nodeScore18;
    }

    /**
     * @dev Fetch the net rewards for all node's delegators in an epoch (rewards of node's delegators - operator fee)
     * @param identityId Node's identity ID
     * @param epoch Epoch number
     * @return Net rewards for node's delegators in the epoch
     */
    function getNetNodeRewards(
        uint72 identityId,
        uint256 epoch
    ) public view profileExists(identityId) returns (uint256) {
        // If the operator fee has been claimed, return the net delegators rewards
        if (delegatorsInfo.getIsOperatorFeeClaimedForEpoch(identityId, epoch)) {
            return delegatorsInfo.getEpochLeftoverDelegatorsRewards(identityId, epoch);
        }

        uint256 nodeScore18 = randomSamplingStorage.getNodeEpochScore(epoch, identityId);
        if (nodeScore18 == 0) return 0;

        uint256 allNodesScore18 = randomSamplingStorage.getAllNodesEpochScore(epoch);
        if (allNodesScore18 == 0) return 0;

        uint256 epocRewardsPool = epochStorage.getEpochPool(1, epoch);
        if (epocRewardsPool == 0) return 0;

        uint256 totalNodeRewards = (epocRewardsPool * nodeScore18) / allNodesScore18;

        uint256 feePercentageForEpoch = profileStorage.getLatestOperatorFeePercentage(identityId);
        uint96 operatorFeeAmount = uint96((totalNodeRewards * feePercentageForEpoch) / 10_000);

        return totalNodeRewards - operatorFeeAmount;
    }

    function _simulatePrepareForStakeChange(
        uint256 epoch,
        uint72 identityId,
        bytes32 delegatorKey
    ) internal view returns (uint256 delegatorScore18) {
        // 1. Current "score-per-stake"
        uint256 nodeScorePerStake36 = randomSamplingStorage.getNodeEpochScorePerStake(epoch, identityId);

        uint256 currentDelegatorScore18 = randomSamplingStorage.getEpochNodeDelegatorScore(
            epoch,
            identityId,
            delegatorKey
        );

        // 2. Last index at which this delegator was settled
        uint256 delegatorLastSettledNodeEpochScorePerStake36 = randomSamplingStorage
            .getDelegatorLastSettledNodeEpochScorePerStake(epoch, identityId, delegatorKey);

        // Nothing new to settle
        if (nodeScorePerStake36 == delegatorLastSettledNodeEpochScorePerStake36) {
            return currentDelegatorScore18;
        }

        uint96 stakeBase = stakingStorage.getDelegatorStakeBase(identityId, delegatorKey);

        // If the delegator has no stake, just bump the index and exit
        if (stakeBase == 0) {
            return currentDelegatorScore18;
        }
        // 4. Newly earned score for this delegator in the epoch
        uint256 diff36 = nodeScorePerStake36 - delegatorLastSettledNodeEpochScorePerStake36; // scaled 1e36
        uint256 scoreEarned18 = (uint256(stakeBase) * diff36) / SCALE18;

        return currentDelegatorScore18 + scoreEarned18;
    }

    function _checkProfileExists(uint72 identityId) internal view virtual {
        if (!profileStorage.profileExists(identityId)) {
            revert ProfileLib.ProfileDoesntExist(identityId);
        }
    }
}
