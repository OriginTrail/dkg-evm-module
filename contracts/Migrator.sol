// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {IdentityStorage} from "./storage/IdentityStorage.sol";
import {ProfileStorage} from "./storage/ProfileStorage.sol";
import {StakingStorage} from "./storage/StakingStorage.sol";
import {ContractStatus} from "./abstract/ContractStatus.sol";
import {IdentityLib} from "./libraries/IdentityLib.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

interface IOldHub {
    function getContractAddress(string memory) external returns (address);
}

interface IOldStakingStorage {
    function transferStake(address, uint256) external;
    function totalStakes(uint72) external returns (uint96);
    function getWithdrawalRequestAmount(uint72, address) external returns (uint96);
    function getWithdrawalRequestTimestamp(uint72, address) external returns (uint256);
}

interface IOldProfileStorage {
    function transferAccumulatedOperatorFee(address, uint256) external;
    function getAccumulatedOperatorFee(uint72) external returns (uint96);
    function getSharesContractAddress(uint72) external returns (address);
    function getAccumulatedOperatorFeeWithdrawalAmount(uint72) external returns (uint96);
    function getAccumulatedOperatorFeeWithdrawalTimestamp(uint72) external returns (uint256);
    function getNodeId(uint72) external returns (bytes memory);
    function getAsk(uint72) external returns (uint96);
}

interface IOldNodeOperatorFeesStorage {
    function getLatestOperatorFeePercentage(uint72) external returns (uint8);
}

contract Migrator is ContractStatus {
    IOldHub public oldHub;
    IOldStakingStorage public oldStakingStorage;
    IOldProfileStorage public oldProfileStorage;
    IOldNodeOperatorFeesStorage public oldNodeOperatorFeesStorage;

    IdentityStorage public identityStorage;
    ProfileStorage public profileStorage;
    StakingStorage public newStakingStorage;

    uint256 public oldNodesCount;
    uint256 public migratedNodes;

    uint256 public oldTotalStake;
    uint256 public migratedStake;

    bool public delegatorsMigrationInitiated;

    mapping(uint72 => uint96) public oldNodeStakes;
    mapping(uint72 => uint96) public migratedStakes;

    mapping(uint72 => bool) public nodeMigrated;
    mapping(uint72 => mapping(address => bool)) public delegatorMigrated;
    mapping(uint72 => bool) public operatorMigrated;

    constructor(address hubAddress, address oldHubAddress) ContractStatus(hubAddress) {
        oldHub = IOldHub(oldHubAddress);
    }

    function initializeOldContracts() external onlyHubOwner {
        oldStakingStorage = IOldStakingStorage(oldHub.getContractAddress("StakingStorage"));
        oldProfileStorage = IOldProfileStorage(oldHub.getContractAddress("ProfileStorage"));
        oldNodeOperatorFeesStorage = IOldNodeOperatorFeesStorage(oldHub.getContractAddress("NodeOpeartorFeesStorage"));
    }

    function initializeNewContracts() external onlyHubOwner {
        identityStorage = IdentityStorage(hub.getContractAddress("IdentityStorage"));
        profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        newStakingStorage = StakingStorage(hub.getContractAddress("StakingStorage"));
    }

    function transferStake(uint96 amount) external onlyHubOwner {
        oldStakingStorage.transferStake(address(newStakingStorage), amount);
    }

    function transferOperatorFees(uint96 amount) external onlyHubOwner {
        oldProfileStorage.transferAccumulatedOperatorFee(address(newStakingStorage), amount);
    }

    function initiateDelegatorsMigration() external onlyHubOwner {
        delegatorsMigrationInitiated = true;
    }

    function migrateGlobalData(uint96 stake) external onlyHubOwner {
        newStakingStorage.setTotalStake(stake);
    }

    function migrateNodeData(uint72 identityId) external onlyHubOwner {
        uint96 nodeStake = oldStakingStorage.totalStakes(identityId);

        newStakingStorage.setNodeStake(identityId, nodeStake);
        newStakingStorage.increaseTotalStake(nodeStake);

        oldNodeStakes[identityId] = nodeStake;
        oldNodesCount += 1;
        oldTotalStake += nodeStake;

        IERC20Metadata shares = IERC20Metadata(oldProfileStorage.getSharesContractAddress(identityId));

        string memory nodeName = shares.name();
        bytes memory nodeId = oldProfileStorage.getNodeId(identityId);
        uint96 initialAsk = oldProfileStorage.getAsk(identityId);
        // We take the latest operator fee percentage even if the change is pending?
        uint8 initialOperatorFee = oldNodeOperatorFeesStorage.getLatestOperatorFeePercentage(identityId);

        profileStorage.createProfile(identityId, nodeName, nodeId, initialAsk, initialOperatorFee);
    }

    function migrateDelegatorData(uint72 identityId) external {
        require(delegatorsMigrationInitiated, "Delegators migration hasn't been initiated!");
        require(!delegatorMigrated[identityId][msg.sender], "Delegator has already been migrated.");

        // Stake migration
        IERC20Metadata shares = IERC20Metadata(oldProfileStorage.getSharesContractAddress(identityId));

        uint256 sharesTotalSupply = shares.totalSupply();
        uint256 delegatorSharesAmount = shares.balanceOf(msg.sender);

        shares.transferFrom(msg.sender, address(this), delegatorSharesAmount);

        uint96 delegatorStakeBase = uint96((oldNodeStakes[identityId] * delegatorSharesAmount) / sharesTotalSupply);
        newStakingStorage.setDelegatorStakeBase(
            identityId,
            keccak256(abi.encodePacked(msg.sender)),
            delegatorStakeBase
        );

        migratedStake += delegatorStakeBase;

        uint256 migratedNodeShares = shares.balanceOf(address(this));
        if (migratedNodeShares == sharesTotalSupply) {
            nodeMigrated[identityId] = true;
            migratedNodes += 1;
        }

        // Delegator withdrawal migration
        uint96 withdrawalAmount = oldStakingStorage.getWithdrawalRequestAmount(identityId, msg.sender);
        if (withdrawalAmount > 0) {
            uint256 withdrawalTimestamp = oldStakingStorage.getWithdrawalRequestTimestamp(identityId, msg.sender);

            newStakingStorage.createDelegatorWithdrawalRequest(
                identityId,
                keccak256(abi.encodePacked(msg.sender)),
                withdrawalAmount,
                0,
                withdrawalTimestamp
            );
        }

        delegatorMigrated[identityId][msg.sender] = true;

        // Node operator fees and withdrawal migration
        if (
            !operatorMigrated[identityId] &&
            identityStorage.keyHasPurpose(identityId, keccak256(abi.encodePacked(msg.sender)), IdentityLib.ADMIN_KEY)
        ) {
            uint96 operatorAccumulatedOperatorFee = oldProfileStorage.getAccumulatedOperatorFee(identityId);
            newStakingStorage.setOperatorFeeBalance(identityId, operatorAccumulatedOperatorFee);

            uint96 feeWithdrawalAmount = oldProfileStorage.getAccumulatedOperatorFeeWithdrawalAmount(identityId);
            if (feeWithdrawalAmount > 0) {
                uint256 feeWithdrawalTimestamp = oldProfileStorage.getAccumulatedOperatorFeeWithdrawalTimestamp(
                    identityId
                );

                // If request is cancelled, next withdrawal will trigger increase
                // of paid out rewards
                newStakingStorage.createOperatorFeeWithdrawalRequest(
                    identityId,
                    feeWithdrawalAmount,
                    0,
                    feeWithdrawalTimestamp
                );
            }

            operatorMigrated[identityId] = true;
        }
    }
}