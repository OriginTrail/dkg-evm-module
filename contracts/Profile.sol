// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { HashingProxy } from "./HashingProxy.sol";
import { Hub } from "./Hub.sol";
import { Identity } from "./Identity.sol";
import { Shares } from "./Shares.sol";
import { Staking } from "./Staking.sol";
import { IdentityStorage } from "./storage/IdentityStorage.sol";
import { ProfileStorage } from "./storage/ProfileStorage.sol";
import { ADMIN_KEY, OPERATIONAL_KEY } from "./constants/IdentityConstants.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";

contract Profile {

    Hub public hub;
    HashingProxy public hashingProxy;
    Identity public identityContract;
    Staking public stakingContract;
    IdentityStorage public identityStorage;
    ProfileStorage public profileStorage;

    constructor(address hubAddress) {
        require(hubAddress != address(0));

        hub = Hub(hubAddress);
        hashingProxy = HashingProxy(hub.getContractAddress("HashingProxy"));
        identityContract = Identity(hub.getContractAddress("Identity"));
        stakingContract = Staking(hub.getContractAddress("Staking"));
        identityStorage = IdentityStorage(hub.getContractAddress("IdentityStorage"));
        profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
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
