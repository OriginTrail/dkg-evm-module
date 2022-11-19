// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { ByteArr } from "../utils/ByteArr.sol";
import { Hub } from "../Hub.sol";
import { IERC734Extended } from "../interface/IERC734Extended.sol";

contract IdentityStorage is IERC734Extended {
    using ByteArr for bytes;
    using ByteArr for bytes32[];
    using ByteArr for uint256[];

    uint256 constant ADMIN_KEY = 1;
    uint256 constant OPERATIONAL_KEY = 2;

    Hub public hub;

    uint96 private _identityId;

    struct Identity {
        uint96 identityId;
        mapping (bytes32 => Key) keys;
        mapping (uint256 => bytes32[]) keysByPurpose;
    }

    // operationalKey => identityId
    mapping(bytes32 => uint96) public identityIds;
    // identityId => Identity
    mapping(uint96 => Identity) identities;

    constructor(address hubAddress) {
        require(hubAddress != address(0));
        hub = Hub(hubAddress);

        _identityId = 1;
    }

    modifier onlyProfileStorage() {
        require(
            msg.sender == hub.getContractAddress("ProfileStorage"),
            "Function can only be called by ProfileStorage contract"
        );
        _;
    }

    function createIdentity(address operational, address admin) public onlyProfileStorage returns (uint96) {
        require(operational != address(0), "Operational wallet address can't be empty");
        require(admin != address(0), "Admin wallet address can't be empty");
        require(operational != admin, "Same address for ADMIN/OPERATIONAL purposes");

        bytes32 _admin_key = keccak256(abi.encodePacked(admin));

        uint96 identityId = _identityId;
        Identity storage identity = identities[identityId];
        _identityId++;
        
        identity.keys[_admin_key].purpose = ADMIN_KEY;
        identity.keys[_admin_key].keyType = 1;  // ECDSA
        identity.keys[_admin_key].key = _admin_key;
        identity.keysByPurpose[ADMIN_KEY].push(_admin_key);

        emit KeyAdded(identityId, _admin_key, identity.keys[_admin_key].purpose, identity.keys[_admin_key].keyType);

        bytes32 _operational_key = keccak256(abi.encodePacked(operational));

        identityIds[_operational_key] = identityId;

        identity.keys[_operational_key].purpose = OPERATIONAL_KEY;
        identity.keys[_operational_key].keyType = 1;  // ECDSA
        identity.keys[_operational_key].key = _operational_key;
        identity.keysByPurpose[OPERATIONAL_KEY].push(_operational_key);

        emit KeyAdded(
            identityId,
            _operational_key,
            identity.keys[_operational_key].purpose,
            identity.keys[_operational_key].keyType
        );

        emit IdentityCreated(identityId, _operational_key, _admin_key);

        return identityId;
    }

    function getIdentityId(address operational) public view returns (uint96) {
        return identityIds[keccak256(abi.encodePacked(operational))];
    }

    function getKey(uint96 identityId, bytes32 _key) public view override returns (uint256, uint256, bytes32) {
        return (
            identities[identityId].keys[_key].purpose,
            identities[identityId].keys[_key].keyType,
            identities[identityId].keys[_key].key
        );
    }

    function keyHasPurpose(uint96 identityId, bytes32 _key, uint256 _purpose) public view override returns (bool) {
        return identities[identityId].keys[_key].purpose == _purpose;
    }

    function getKeysByPurpose(uint96 identityId, uint256 _purpose) public view override returns (bytes32[] memory) {
        return identities[identityId].keysByPurpose[_purpose];
    }

    function addKey(uint96 identityId, bytes32 _key, uint256 _purpose, uint256 _type) public override returns (bool) {
        require(keyHasPurpose(identityId, keccak256(abi.encodePacked(msg.sender)), ADMIN_KEY), "Admin function");
        require(_key != bytes32(0), "Key arg is empty");
        require(identities[identityId].keys[_key].key != _key, "Key is already attached to the identity");

        identities[identityId].keys[_key].purpose = _purpose;
        identities[identityId].keys[_key].keyType = _type;
        identities[identityId].keys[_key].key = _key;
        identities[identityId].keysByPurpose[_purpose].push(_key);

        if (_purpose == OPERATIONAL_KEY) {
            identityIds[_key] = identityId;
        }

        emit KeyAdded(identityId, _key, _purpose, _type);

        return true;
    }

    function removeKey(uint96 identityId, bytes32 _key) public override returns (bool) {
        require(keyHasPurpose(identityId, keccak256(abi.encodePacked(msg.sender)), ADMIN_KEY), "Admin function");
        require(_key != bytes32(0), "Key arg is empty");

        Identity storage identity = identities[identityId];
        require(identity.keys[_key].key == _key, "Key isn't attached to the identity");

        require(
            !(identity.keysByPurpose[ADMIN_KEY].length == 1 && keyHasPurpose(identityId, _key, ADMIN_KEY)),
            "Cannot delete the only admin key"
        );
        require(
            !(identity.keysByPurpose[OPERATIONAL_KEY].length == 1 && keyHasPurpose(identityId, _key, OPERATIONAL_KEY)),
            "Cannot delete the only operational key"
        );

        emit KeyRemoved(identityId, identity.keys[_key].key, identity.keys[_key].purpose, identity.keys[_key].keyType);

        uint256 index;
        bool success;
        (index, success) = identity.keysByPurpose[identity.keys[_key].purpose].indexOf(_key);
        identity.keysByPurpose[identity.keys[_key].purpose].removeByIndex(index);

        delete identity.keys[_key];

        if (identity.keys[_key].purpose == OPERATIONAL_KEY) {
            delete identityIds[_key];
        }

        return true;
    }
}
