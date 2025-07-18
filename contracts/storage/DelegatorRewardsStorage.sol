// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import {INamed} from "../interfaces/INamed.sol";
import {IVersioned} from "../interfaces/IVersioned.sol";
import {IInitializable} from "../interfaces/IInitializable.sol";
import {ContractStatus} from "../abstract/ContractStatus.sol";

/**
 * @title DelegatorRewardsStorage
 * @notice Auxiliary storage contract used during migration to hold rewards that
 *         need to be staked for existing delegators. The contract keeps the
 *         reward amount per delegator per node together with a flag indicating
 *         whether the reward has already been claimed (staked).
 */
contract DelegatorRewardsStorage is INamed, IVersioned, ContractStatus, IInitializable {
    string private constant _NAME = "DelegatorRewardsStorage";
    string private constant _VERSION = "1.0.0";

    struct RewardInfo {
        uint96 amount; // reward that has to be staked for the delegator
        bool claimed; // whether the reward has already been processed
    }

    // identityId => delegator => RewardInfo
    mapping(uint72 => mapping(address => RewardInfo)) private _rewards;

    // No helper arrays — rewards are accessed directly via mapping.

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) ContractStatus(hubAddress) {}

    // --------------------------- Initializer ------------------------------------
    function initialize() external onlyHub {}

    // --------------------------- GETTERS ---------------------------------------

    function name() external pure override returns (string memory) {
        return _NAME;
    }

    function version() external pure override returns (string memory) {
        return _VERSION;
    }

    function getReward(uint72 identityId, address delegator) external view returns (uint96 amount, bool claimed) {
        RewardInfo memory info = _rewards[identityId][delegator];
        return (info.amount, info.claimed);
    }

    function hasReward(uint72 identityId, address delegator) external view returns (bool) {
        return _rewards[identityId][delegator].amount > 0;
    }

    // (iteration helpers were removed – no getters)

    // --------------------------- SETTERS ---------------------------------------

    /**
     * @dev Adds or updates rewards for a batch of delegators on a single node.
     *      Can be called multiple times to populate the storage before migration.
     *      If reward for a delegator already exists it will be overwritten.
     *
     * Requirements:
     * - Caller must be Hub or Hub owner (onlyHub).
     * - `delegators` and `amounts` array lengths must match.
     */
    function setDelegatorsRewards(
        uint72 identityId,
        address[] calldata delegators,
        uint96[] calldata amounts
    ) external onlyHub {
        require(delegators.length == amounts.length, "Length mismatch");

        for (uint256 i = 0; i < delegators.length; i++) {
            address delegator = delegators[i];
            uint96 amount = amounts[i];
            require(amount > 0, "Zero amount");

            RewardInfo storage info = _rewards[identityId][delegator];
            info.amount = amount;
            info.claimed = false;
        }
    }

    /**
     * @dev Marks reward for delegator as claimed. Only callable by contracts in Hub.
     */
    function markClaimed(uint72 identityId, address delegator) external onlyContracts {
        RewardInfo storage info = _rewards[identityId][delegator];
        require(info.amount > 0, "Reward not found");
        require(!info.claimed, "Already claimed");
        info.claimed = true;
    }

    // --------------------------- INTERNAL HELPERS ------------------------------

    // (none at the moment)
}
