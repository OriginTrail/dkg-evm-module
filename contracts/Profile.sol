// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { HashingProxy } from "./HashingProxy.sol";
import { Hub } from "./Hub.sol";
import { Identity } from "./Identity.sol";
import { ShardingTable } from "./ShardingTable.sol";
import { Shares } from "./Shares.sol";
import { Staking } from "./Staking.sol";
import { IdentityStorage } from "./storage/IdentityStorage.sol";
import { ParametersStorage } from "./storage/ParametersStorage.sol";
import { ProfileStorage } from "./storage/ProfileStorage.sol";
import { ShardingTableStorage } from "./storage/ShardingTableStorage.sol";
import { StakingStorage } from "./storage/StakingStorage.sol";
import { UnorderedIndexableContractDynamicSetLib } from "./utils/UnorderedIndexableContractDynamicSet.sol";
import { ADMIN_KEY, OPERATIONAL_KEY } from "./constants/IdentityConstants.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";

contract Profile {

    Hub public hub;
    HashingProxy public hashingProxy;
    Identity public identityContract;
    ShardingTable public shardingTable;
    Staking public stakingContract;
    IdentityStorage public identityStorage;
    ParametersStorage public parametersStorage;
    ProfileStorage public profileStorage;
    ShardingTableStorage public shardingTableStorage;
    StakingStorage public stakingStorage;

    constructor(address hubAddress) {
        require(hubAddress != address(0));

        hub = Hub(hubAddress);
        hashingProxy = HashingProxy(hub.getContractAddress("HashingProxy"));
        identityContract = Identity(hub.getContractAddress("Identity"));
        shardingTable = ShardingTable(hub.getContractAddress("ShardingTable"));
        stakingContract = Staking(hub.getContractAddress("Staking"));
        identityStorage = IdentityStorage(hub.getContractAddress("IdentityStorage"));
        parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));
        profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        shardingTableStorage = ShardingTableStorage(hub.getContractAddress("ShardingTableStorage"));
        stakingStorage = StakingStorage(hub.getContractAddress("StakingStorage"));
    }

    modifier onlyAdmin(uint72 identityId) {
        _checkAdmin(identityId);
        _;
    }

    modifier onlyOperational(uint72 identityId) {
        _checkOperational(identityId);
        _;
    }

    function createProfile(
        address adminWallet,
        bytes calldata nodeId,
        uint96 initialAsk,
        uint96 initialStake,
        uint8 operatorFee
    )
        external
    {
        IdentityStorage ids = identityStorage;
        ProfileStorage ps = profileStorage;

        require(ids.getIdentityId(msg.sender) == 0, "Identity already exists");
        require(nodeId.length != 0, "Node ID can't be empty");
        require(!ps.nodeIdRegistered(nodeId), "Node ID is already registered");
        require(initialAsk != 0, "Ask cannot be 0");

        uint72 identityId = identityContract.createIdentity(msg.sender, adminWallet);

        string memory identityIdString = Strings.toString(identityId);
        Shares sharesContract = new Shares(
            address(hub),
            string.concat("Share token ", identityIdString),
            string.concat("DKGSTAKE_", identityIdString)
        );

        ps.createProfile(identityId, nodeId, initialAsk, address(sharesContract));
        _setAvailableNodeAddresses(identityId);

        Staking sc = stakingContract;
        sc.addStake(identityId, initialStake);
        sc.setOperatorFee(identityId, operatorFee);
    }

    // function deleteProfile(uint72 identityId) external onlyAdmin(identityId) {
    //     // TODO: add checks
    //     profileStorage.deleteProfile(identityId);
    //     identityContract.deleteIdentity(identityId);
    // }

    // function changeNodeId(uint72 identityId, bytes calldata nodeId) external onlyOperational(identityId) {
    //     require(nodeId.length != 0, "Node ID can't be empty");

    //     profileStorage.setNodeId(identityId, nodeId);
    // }

    // function addNewNodeIdHash(uint72 identityId, uint8 hashFunctionId) external onlyOperational(identityId) {
    //     require(hashingProxy.isHashFunction(hashFunctionId), "Hash function doesn't exist");

    //     profileStorage.setNodeAddress(identityId, hashFunctionId);
    // }

    // TODO: Define where it can be called, change internal modifier
    function _setAvailableNodeAddresses(uint72 identityId) internal {
        ProfileStorage ps = profileStorage;
        HashingProxy hp = hashingProxy;

        UnorderedIndexableContractDynamicSetLib.Contract[] memory hashFunctions = hp.getAllHashFunctions();
        uint256 hashFunctionsNumber = hashFunctions.length;
        for (uint8 i; i < hashFunctionsNumber; ) {
            ps.setNodeAddress(identityId, hashFunctions[i].id);
            unchecked { i++; }
        }
    }

    function stakeReward(uint72 identityId) external onlyAdmin(identityId) {
        ProfileStorage ps = profileStorage;

        uint96 rewardAmount = ps.getReward(identityId);
        require(rewardAmount != 0, "You have no reward");

        uint96 oldStake = stakingStorage.totalStakes(identityId);
        uint96 newStake = oldStake + rewardAmount;

        ps.setReward(identityId, 0);
        stakingContract.addStake(identityId, rewardAmount);

        if (!shardingTableStorage.nodeExists(identityId) && newStake >= parametersStorage.minimumStake()) {
            shardingTable.pushBack(identityId);
        }
    }

    function withdrawReward(uint72 identityId) external onlyAdmin(identityId) {
        ProfileStorage ps = profileStorage;

        uint96 rewardAmount = ps.getReward(identityId);
        require(rewardAmount != 0, "You have no reward");

        ps.setReward(identityId, 0);
        ps.transferTokens(msg.sender, rewardAmount);
    }

    function _checkAdmin(uint72 identityId) internal view virtual {
        require(
            identityStorage.keyHasPurpose(identityId, keccak256(abi.encodePacked(msg.sender)), ADMIN_KEY),
            "Admin function"
        );
    }

    function _checkOperational(uint72 identityId) internal view virtual {
        require(
            identityStorage.keyHasPurpose(identityId, keccak256(abi.encodePacked(msg.sender)), OPERATIONAL_KEY),
            "Fn can be called only by oper."
        );
    }

}
