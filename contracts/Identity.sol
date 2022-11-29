// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { Hub } from "./Hub.sol";
import { IERC734Extended } from "./interface/IERC734Extended.sol";
import { IdentityStorage } from "./storage/IdentityStorage.sol";

contract Identity is IERC734Extended {

    uint256 constant ADMIN_KEY = 1;
    uint256 constant OPERATIONAL_KEY = 2;
    uint256 constant ECDSA = 1;

    Hub public hub;

    constructor(address hubAddress) {
        require(hubAddress != address(0));
        hub = Hub(hubAddress);
    }

    modifier onlyContracts(){
        require(
            hub.isContract(msg.sender),
            "Function can only be called by contracts!"
        );
        _;
    }

    function createIdentity(address operational, address admin)
        public
        onlyContracts
        returns (uint72)
    {
        require(operational != address(0), "Operational wallet address can't be empty");
        require(admin != address(0), "Admin wallet address can't be empty");

        IdentityStorage identityStorage = IdentityStorage(hub.getContractAddress("IdentityStorage"));

        bytes32 _admin_key = keccak256(abi.encodePacked(admin));

        uint72 identityId = identityStorage.getNewIdentityId();
        identityStorage.addKey(identityId, _admin_key, ADMIN_KEY, ECDSA);

        emit KeyAdded(
            identityId,
            _admin_key,
            ADMIN_KEY,
            ECDSA
        );

        bytes32 _operational_key = keccak256(abi.encodePacked(operational));

        identityStorage.setIdentityId(_operational_key, identityId);

        identityStorage.addKey(identityId, _operational_key, OPERATIONAL_KEY, ECDSA);

        emit KeyAdded(
            identityId,
            _operational_key,
            OPERATIONAL_KEY,
            ECDSA
        );

        emit IdentityCreated(
            identityId,
            _operational_key,
            _admin_key
        );

        return identityId;
    }

    function getIdentityId(address operational)
        public
        view
        returns (uint72)
    {
        return IdentityStorage(hub.getContractAddress("IdentityStorage")).getIdentityId(operational);
    }

    function getKey(uint72 identityId, bytes32 _key)
        public
        view
        override
        returns (uint256, uint256, bytes32)
    {
        return IdentityStorage(hub.getContractAddress("IdentityStorage")).getKey(identityId, _key);
    }

    function keyHasPurpose(uint72 identityId, bytes32 _key, uint256 _purpose)
        public
        view
        override
        returns (bool)
    {
        return IdentityStorage(hub.getContractAddress("IdentityStorage")).keyHasPurpose(identityId, _key, _purpose);
    }

    function getKeysByPurpose(uint72 identityId, uint256 _purpose)
        public
        view
        override
        returns (bytes32[] memory)
    {
        return IdentityStorage(hub.getContractAddress("IdentityStorage")).getKeysByPurpose(identityId, _purpose);
    }

    function addKey(uint72 identityId, bytes32 _key, uint256 _purpose, uint256 _type)
        public
        override
    {
        IdentityStorage identityStorage = IdentityStorage(hub.getContractAddress("IdentityStorage"));

        require(identityStorage.keyHasPurpose(identityId, keccak256(abi.encodePacked(msg.sender)), ADMIN_KEY), "Admin function");
        require(_key != bytes32(0), "Key arg is empty");

        bytes32 attachedKey;
        ( , , attachedKey) = identityStorage.getKey(identityId, _key);
        require(attachedKey != _key, "Key is already attached to the identity");

        identityStorage.addKey(identityId, _key, _purpose, _type);

        emit KeyAdded(identityId, _key, _purpose, _type);
    }

    function removeKey(uint72 identityId, bytes32 _key)
        public
        override
    {
        IdentityStorage identityStorage = IdentityStorage(hub.getContractAddress("IdentityStorage"));

        require(identityStorage.keyHasPurpose(identityId, keccak256(abi.encodePacked(msg.sender)), ADMIN_KEY), "Admin function");
        require(_key != bytes32(0), "Key arg is empty");

        require(identityStorage.getIdentityKeys(identityId, _key).key == _key, "Key isn't attached to the identity");

        require(
            !(identityStorage.getKeysByPurpose(identityId, ADMIN_KEY).length == 1 && identityStorage.keyHasPurpose(identityId, _key, ADMIN_KEY)),
            "Cannot delete the only admin key"
        );
        require(
            !(identityStorage.getKeysByPurpose(identityId, OPERATIONAL_KEY).length == 1 && identityStorage.keyHasPurpose(identityId, _key, OPERATIONAL_KEY)),
            "Cannot delete the only operational key"
        );

        uint256 keyType;
        uint256 purpose;
        bytes32 key;
        (purpose, keyType, key) = identityStorage.getKey(identityId, _key);

        identityStorage.removeKey(identityId, _key);

        if (purpose == OPERATIONAL_KEY) {
            identityStorage.removeIdentityId(_key);
        }

        emit KeyRemoved(
            identityId,
            key,
            purpose,
            keyType
        );
    }
}
