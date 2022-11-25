// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { ByteArr } from "../utils/ByteArr.sol";
import { IERC734Extended } from "../interface/IERC734Extended.sol";
import { IERC734Extended } from "../interface/IERC734Extended.sol";
import { Hub } from "../Hub.sol";

contract IdentityStorage is IERC734Extended {
    using ByteArr for bytes32[];

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

    modifier onlyContracts(){
        require(
            hub.isContract(msg.sender),
            "Function can only be called by contracts!"
        );
        _;
    }

    function setIdentityId(bytes32 operationalKey, uint96 identityId)
        public
        onlyContracts
    {
        identityIds[operationalKey] = identityId;
    }

    function addKey(uint96 identityId, bytes32 _key, uint256 _purpose, uint256 _type)
        public
        override
        onlyContracts
    {
        identities[identityId].keys[_key].purpose = _purpose;
        identities[identityId].keys[_key].keyType = _type;
        identities[identityId].keys[_key].key = _key;
        identities[identityId].keysByPurpose[_purpose].push(_key);
    }

    function getNewIdentityId()
        public
        onlyContracts
        returns (uint96)
    {
        uint96 indetityId = _identityId;
        _identityId++;
        return indetityId;
    }

    function removeKey(uint96 identityId, bytes32 _key)
        public
        override
        onlyContracts
    {
        delete identities[identityId].keys[_key];
    }

    function removeIdentityId(bytes32 key)
        public
        onlyContracts
    {
        delete identityIds[key];
    }

    function removeKeyFromKeysByPurpose(uint96 identityId, bytes32 key)
        public
        onlyContracts
    {
        Identity storage identity = identities[identityId];
        uint256 index;
        (index, ) = identity.keysByPurpose[identity.keys[key].purpose].indexOf(key);
        identity.keysByPurpose[identity.keys[key].purpose].removeByIndex(index);
    }


    function getIdentityKeys(uint96 identityId, bytes32 key)
        public
        view
        returns (Key memory)
    {
        return identities[identityId].keys[key];
    }

    function getIdentityId(address operational)
        public
        view
        returns (uint96)
    {
        return identityIds[keccak256(abi.encodePacked(operational))];
    }

    function getKeysByPurpose(uint96 identityId, uint256 _purpose)
        public
        view
        override
        returns (bytes32[] memory)
    {
        return identities[identityId].keysByPurpose[_purpose];
    }


    function getKey(uint96 identityId, bytes32 _key)
        public
        view
        override
        returns (uint256, uint256, bytes32)
    {
        return (
        identities[identityId].keys[_key].purpose,
        identities[identityId].keys[_key].keyType,
        identities[identityId].keys[_key].key
        );
    }

    function keyHasPurpose(uint96 identityId, bytes32 _key, uint256 _purpose)
        public
        view
        override
        returns (bool)
    {
        return identities[identityId].keys[_key].purpose == _purpose;
    }

}
