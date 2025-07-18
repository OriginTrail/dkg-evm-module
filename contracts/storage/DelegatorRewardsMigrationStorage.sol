// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import {INamed} from "../interfaces/INamed.sol";
import {IVersioned} from "../interfaces/IVersioned.sol";
import {IInitializable} from "../interfaces/IInitializable.sol";
import {ContractStatus} from "../abstract/ContractStatus.sol";

/**
 * @title DelegatorRewardsMigrationStorage
 * @notice Same functionality as original DelegatorRewardsStorage; file renamed to reflect migration purpose.
 */
contract DelegatorRewardsMigrationStorage is INamed, IVersioned, ContractStatus, IInitializable {
    string private constant _NAME = "DelegatorRewardsMigrationStorage";
    string private constant _VERSION = "1.0.0";

    struct RewardInfo {
        uint96 amount;
        bool claimed;
    }

    mapping(uint72 => mapping(address => RewardInfo)) private _rewards;

    constructor(address hubAddress) ContractStatus(hubAddress) {}

    function initialize() external onlyHub {}

    // ---------------- GETTERS ----------------
    function name() external pure override returns (string memory) {
        return _NAME;
    }
    function version() external pure override returns (string memory) {
        return _VERSION;
    }

    function getReward(uint72 identityId, address delegator) external view returns (uint96, bool) {
        RewardInfo memory info = _rewards[identityId][delegator];
        return (info.amount, info.claimed);
    }

    function hasReward(uint72 identityId, address delegator) external view returns (bool) {
        return _rewards[identityId][delegator].amount > 0;
    }

    // -------------- SETTER -------------------
    /**
     * @dev Sets or overwrites reward for a single delegator on a given node.
     *      Callable only by Hub / Hub owner.
     */
    function setDelegatorReward(uint72 identityId, address delegator, uint96 amount) external onlyHub {
        require(amount > 0, "Zero amount");
        _rewards[identityId][delegator] = RewardInfo(amount, false);
    }

    function setDelegatorsRewards(
        uint72 identityId,
        address[] calldata delegators,
        uint96[] calldata amounts
    ) external onlyHub {
        require(delegators.length == amounts.length, "Length mismatch");
        for (uint256 i; i < delegators.length; i++) {
            address d = delegators[i];
            uint96 a = amounts[i];
            require(a > 0, "Zero amount");
            _rewards[identityId][d] = RewardInfo(a, false);
        }
    }

    function markClaimed(uint72 identityId, address delegator) external onlyContracts {
        RewardInfo storage info = _rewards[identityId][delegator];
        require(info.amount > 0, "Reward not found");
        require(!info.claimed, "Already claimed");
        info.claimed = true;
    }
}
