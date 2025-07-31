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
import {V6_DelegatorsInfo} from "./storage/V6_DelegatorsInfo.sol";
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
import {V6_RandomSamplingStorage} from "./storage/V6_RandomSamplingStorage.sol";
import {Chronos} from "./storage/Chronos.sol";
import {EpochStorage as EpochStorageV6} from "./storage/EpochStorage.sol";
import {Staking} from "./Staking.sol";
import {V8_1_1_Rewards_Period} from "./V8_1_1_Rewards_Period.sol";
import {V8_1_1_Rewards_Period_Storage} from "./storage/V8_1_1_Rewards_Period_Storage.sol";
import {ClaimV6Helper} from "./ClaimV6Helper.sol";

contract V6_Claim is INamed, IVersioned, ContractStatus, IInitializable {
    string private constant _NAME = "V6_Claim";
    string private constant _VERSION = "1.0.0";
    uint256 public constant SCALE18 = 1e18;
    uint256 private constant EPOCH_POOL_INDEX = 1;

    Ask public askContract;
    ShardingTableStorage public shardingTableStorage;
    ShardingTable public shardingTableContract;
    IdentityStorage public identityStorage;
    ParametersStorage public parametersStorage;
    ProfileStorage public profileStorage;
    StakingStorage public stakingStorage;
    DelegatorsInfo public delegatorsInfo;
    V6_DelegatorsInfo public v6_delegatorsInfo;
    IERC20 public tokenContract;
    V6_RandomSamplingStorage public v6_randomSamplingStorage;
    Staking public stakingMain;
    ClaimV6Helper public claimV6Helper;
    Chronos public chronos;
    EpochStorageV6 public epochStorageV6;
    V8_1_1_Rewards_Period public v8_1_1_rewards_period;
    V8_1_1_Rewards_Period_Storage public v8_1_1_rewards_storage;

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

    /**
     * @dev Initializes the contract by connecting to all required Hub dependencies
     * Called once during deployment to set up contract references
     * Only the Hub can call this function
     */
    function initialize() external onlyHub {
        askContract = Ask(hub.getContractAddress("Ask"));
        shardingTableStorage = ShardingTableStorage(hub.getContractAddress("ShardingTableStorage"));
        shardingTableContract = ShardingTable(hub.getContractAddress("ShardingTable"));
        identityStorage = IdentityStorage(hub.getContractAddress("IdentityStorage"));
        parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));
        profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        stakingStorage = StakingStorage(hub.getContractAddress("StakingStorage"));
        delegatorsInfo = DelegatorsInfo(hub.getContractAddress("DelegatorsInfo"));
        v6_delegatorsInfo = V6_DelegatorsInfo(hub.getContractAddress("V6_DelegatorsInfo"));
        tokenContract = IERC20(hub.getContractAddress("Token"));
        v6_randomSamplingStorage = V6_RandomSamplingStorage(hub.getContractAddress("V6_RandomSamplingStorage"));
        chronos = Chronos(hub.getContractAddress("Chronos"));
        epochStorageV6 = EpochStorageV6(hub.getContractAddress("EpochStorageV6"));
        stakingMain = Staking(hub.getContractAddress("Staking"));

        claimV6Helper = ClaimV6Helper(hub.getContractAddress("ClaimV6Helper"));

        address rewardsAddr;
        try hub.getContractAddress("V8_1_1_Rewards_Period") returns (address addr2) {
            rewardsAddr = addr2;
        } catch {
            rewardsAddr = address(0);
        }
        if (rewardsAddr != address(0)) {
            v8_1_1_rewards_period = V8_1_1_Rewards_Period(rewardsAddr);
        }

        address storageAddr;
        try hub.getContractAddress("V8_1_1_Rewards_Period_Storage") returns (address addr3) {
            storageAddr = addr3;
        } catch {
            storageAddr = address(0);
        }
        if (storageAddr != address(0)) {
            v8_1_1_rewards_storage = V8_1_1_Rewards_Period_Storage(storageAddr);
        }
    }

    /**
     * @dev Returns the name of this contract
     * Used for contract identification and versioning
     */
    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    /**
     * @dev Returns the version of this contract
     * Used for contract identification and versioning
     */
    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function claimDelegatorRewardsV6(
        uint72 identityId,
        uint256 epoch,
        address delegator
    ) public profileExists(identityId) {
        // Allow only nodes created before cutoff timestamp
        require(
            profileStorage.getOperatorFeeEffectiveDateByIndex(identityId, 0) < claimV6Helper.v6NodeCutoffTs(),
            "Node created after cutoff"
        );
        uint256 currentEpoch = chronos.getCurrentEpoch();
        require(epoch < currentEpoch, "Epoch not finalised");

        // Cannot claim rewards for a delegator that is not a node delegator
        require(delegatorsInfo.isNodeDelegator(identityId, delegator), "Delegator not found");

        uint256 lastClaimed = v6_delegatorsInfo.getLastClaimedEpoch(identityId, delegator);

        // Ensure V6 store is exactly one epoch behind the main DelegatorsInfo store
        uint256 lastClaimedMain = delegatorsInfo.getLastClaimedEpoch(identityId, delegator);
        if (lastClaimed == 0) {
            uint256 v812ReleaseEpoch = v6_delegatorsInfo.v812ReleaseEpoch();
            v6_delegatorsInfo.setLastClaimedEpoch(identityId, delegator, v812ReleaseEpoch - 1);
            lastClaimed = v812ReleaseEpoch - 1;
        }
        require(lastClaimedMain == lastClaimed + 1, "V6 store not one epoch behind main store");

        if (lastClaimed == currentEpoch - 1) {
            revert("Already claimed all finalised epochs");
        }

        if (epoch <= lastClaimed) {
            revert("Epoch already claimed");
        }

        if (epoch > lastClaimed + 1) {
            revert("Must claim older epochs first");
        }

        bytes32 delegatorKey = _getDelegatorKey(delegator);
        require(
            !v6_delegatorsInfo.hasDelegatorClaimedEpochRewards(epoch, identityId, delegatorKey),
            "Already claimed rewards for this epoch"
        );

        // settle all pending score changes for the node's delegator (V6 logic)
        uint256 delegatorScore18 = claimV6Helper.prepareForStakeChangeV6External(epoch, identityId, delegatorKey);
        stakingMain.prepareForStakeChangeExternal(epoch, identityId, delegatorKey);
        uint256 nodeScore18 = v6_randomSamplingStorage.getNodeEpochScore(epoch, identityId);

        uint256 reward;

        // If nodeScore18 = 0, rewards are 0 too
        if (nodeScore18 > 0) {
            // netNodeRewards (rewards for node's delegators) = grossNodeRewards - operator fee
            uint256 netNodeRewards;
            if (!v6_delegatorsInfo.isOperatorFeeClaimedForEpoch(identityId, epoch)) {
                // Operator fee has not been claimed for this epoch, calculate it (V6 sources)
                uint256 allNodesScore18 = v6_randomSamplingStorage.getAllNodesEpochScore(epoch);
                if (allNodesScore18 > 0) {
                    uint256 grossNodeRewards = (epochStorageV6.getEpochPool(EPOCH_POOL_INDEX, epoch) * nodeScore18) /
                        allNodesScore18;
                    uint96 operatorFeeAmount = uint96(
                        (grossNodeRewards * profileStorage.getLatestOperatorFeePercentage(identityId)) /
                            parametersStorage.maxOperatorFee()
                    );
                    netNodeRewards = grossNodeRewards - operatorFeeAmount;
                    // Mark the operator fee as claimed for this epoch
                    v6_delegatorsInfo.setIsOperatorFeeClaimedForEpoch(identityId, epoch, true);
                    // Set node's delegators net rewards for this epoch so we don't have to calculate it again
                    v6_delegatorsInfo.setNetNodeEpochRewards(identityId, epoch, netNodeRewards);
                    stakingStorage.increaseOperatorFeeBalance(identityId, operatorFeeAmount);
                }
            } else {
                // Operator fee has been claimed for this epoch already, use the previously calculated node's delegators net rewards for this epoch
                netNodeRewards = v6_delegatorsInfo.getNetNodeEpochRewards(identityId, epoch);
            }

            reward = (delegatorScore18 * netNodeRewards) / nodeScore18;
        }

        // If the operator fee flag has not been set for the epoch (because it had no score), set it now.
        // This ensures that Profile.updateOperatorFee is not blocked by rewardless epochs.
        if (!v6_delegatorsInfo.isOperatorFeeClaimedForEpoch(identityId, epoch)) {
            v6_delegatorsInfo.setIsOperatorFeeClaimedForEpoch(identityId, epoch, true);
        }

        // update state even when reward is zero
        // Mark the delegator's rewards as claimed for this epoch
        v6_delegatorsInfo.setHasDelegatorClaimedEpochRewards(epoch, identityId, delegatorKey, true);
        uint256 lastClaimedEpoch = v6_delegatorsInfo.getLastClaimedEpoch(identityId, delegator);
        v6_delegatorsInfo.setLastClaimedEpoch(identityId, delegator, epoch);

        // Check if this completes all required claims and reset lastStakeHeldEpoch
        uint256 lastStakeHeldEpoch = delegatorsInfo.getLastStakeHeldEpoch(identityId, delegator);
        if (lastStakeHeldEpoch > 0 && epoch >= lastStakeHeldEpoch) {
            // They've now claimed all rewards they're entitled to, reset the tracker
            delegatorsInfo.setLastStakeHeldEpoch(identityId, delegator, 0);

            // Check if they should be removed from delegators list
            if (reward == 0 && stakingStorage.getDelegatorStakeBase(identityId, delegatorKey) == 0) {
                delegatorsInfo.removeDelegator(identityId, delegator);
            }
        }

        uint256 rolling = v6_delegatorsInfo.getDelegatorRollingRewards(identityId, delegator);

        if (reward == 0 && rolling == 0) return;

        // if there are still older epochs pending, accumulate; otherwise restake immediately
        if ((currentEpoch - 1) - lastClaimedEpoch > 1) {
            v6_delegatorsInfo.setDelegatorRollingRewards(identityId, delegator, rolling + reward);
        } else {
            uint96 total = uint96(reward + rolling);
            v6_delegatorsInfo.setDelegatorRollingRewards(identityId, delegator, 0);
            stakingStorage.increaseDelegatorStakeBase(identityId, delegatorKey, total);
            stakingStorage.increaseNodeStake(identityId, total);
            stakingStorage.increaseTotalStake(total);
        }
        //Should it increase on roling rewards or on stakeBaseIncrease only?
        stakingStorage.addDelegatorCumulativeEarnedRewards(identityId, delegatorKey, uint96(reward));
    }

    // prepareForStakeChange logic moved to ClaimV6Helper

    /**
     * @dev Internal function to manage delegator registration and status tracking
     * Adds delegator to node's delegator list if not already registered
     * Marks delegator as having ever delegated to the node (for claim validation)
     * Resets lastStakeHeldEpoch when delegator becomes active again
     * @param identityId Node to manage delegator status for
     * @param delegator Address of the delegator
     */
    function _manageDelegatorStatus(uint72 identityId, address delegator) internal {
        if (!delegatorsInfo.isNodeDelegator(identityId, delegator)) {
            delegatorsInfo.addDelegator(identityId, delegator);
        }
        // If operator was inactive and is now restaking fees, reset their lastStakeHeldEpoch
        uint256 lastStakeHeldEpoch = delegatorsInfo.getLastStakeHeldEpoch(identityId, delegator);
        if (lastStakeHeldEpoch > 0) {
            delegatorsInfo.setLastStakeHeldEpoch(identityId, delegator, 0);
        }
    }

    /**
     * @dev Internal function to add node to sharding table when stake requirements are met
     * Only adds node if it doesn't exist and has minimum required stake
     * Validates that sharding table isn't full before adding
     * @param identityId Node to potentially add to sharding table
     * @param newStake Current stake amount for the node
     */
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

    /**
     * @dev Internal function to remove node from sharding table when stake falls below minimum
     * Only removes node if it exists and stake is below minimum threshold
     * @param identityId Node to potentially remove from sharding table
     * @param newStake Current stake amount for the node
     */
    function _removeNodeFromShardingTable(uint72 identityId, uint96 newStake) internal {
        if (shardingTableStorage.nodeExists(identityId) && newStake < parametersStorage.minimumStake()) {
            shardingTableContract.removeNode(identityId);
        }
    }

    /**
     * @dev Internal function to validate that caller is an admin of the specified node
     * Checks if caller's address has admin key purpose for the identity
     * Used by functions that require node admin permissions
     * @param identityId Node identity to check admin rights for
     */
    function _checkAdmin(uint72 identityId) internal view virtual {
        if (!identityStorage.keyHasPurpose(identityId, _getDelegatorKey(msg.sender), IdentityLib.ADMIN_KEY)) {
            revert Permissions.OnlyProfileAdminFunction(msg.sender);
        }
    }

    /**
     * @dev Internal function to validate that a node profile exists
     * Used by modifiers and functions to ensure operations target valid nodes
     * @param identityId Node identity to check existence for
     */
    function _checkProfileExists(uint72 identityId) internal view virtual {
        if (!profileStorage.profileExists(identityId)) {
            revert ProfileLib.ProfileDoesntExist(identityId);
        }
    }

    /**
     * @dev Internal function to handle delegator cleanup when stake reaches zero
     * If delegator earned score in current epoch: keeps them for future reward claims
     * If no score earned: removes delegator from node immediately
     * Prevents loss of rewards while optimizing storage usage
     * @param identityId Node to handle delegator removal for
     * @param delegator Address of delegator with zero stake
     * @param delegatorEpochScore18 Score earned by delegator in current epoch
     * @param currentEpoch Current epoch number
     */
    function _handleDelegatorRemovalOnZeroStake(
        uint72 identityId,
        address delegator,
        uint256 delegatorEpochScore18,
        uint256 currentEpoch
    ) internal {
        // Don't remove delegator immediately - they might still be eligible for rewards in current epoch
        if (delegatorEpochScore18 > 0) {
            // Delegator earned score in current epoch (can claim), keep them for future reward claims
            delegatorsInfo.setLastStakeHeldEpoch(identityId, delegator, currentEpoch);
        } else {
            // No score earned in current epoch, safe to remove immediately
            delegatorsInfo.removeDelegator(identityId, delegator);
        }
    }

    /**
     * @dev Helper function to get delegator key from address
     * @param delegator Address to convert to key
     * @return bytes32 hash of the delegator address
     */
    function _getDelegatorKey(address delegator) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(delegator));
    }

    // (lazy helper removed)

    function _ensureRewardsPeriod() internal {
        if (address(v8_1_1_rewards_period) == address(0)) {
            address addr = hub.getContractAddress("V8_1_1_Rewards_Period");
            v8_1_1_rewards_period = V8_1_1_Rewards_Period(addr);
        }
        if (address(v8_1_1_rewards_storage) == address(0)) {
            address addrS = hub.getContractAddress("V8_1_1_Rewards_Period_Storage");
            v8_1_1_rewards_storage = V8_1_1_Rewards_Period_Storage(addrS);
        }
    }
}
