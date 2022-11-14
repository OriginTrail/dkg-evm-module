// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { ByteArr } from "./utils/ByteArr.sol";
import { ERC734 } from "./interface/ERC734.sol";

contract Identity is ERC734 {
    using ByteArr for bytes;
    using ByteArr for bytes32[];
    using ByteArr for uint256[];

    uint256 MANAGEMENT_KEY = 1;
    uint256 EXECUTION_KEY = 2;

    mapping (bytes32 => Key) keys;
    mapping (uint256 => bytes32[]) keysByPurpose;

    constructor(address operational, address management) {
        require(operational != address(0) && management != address(0));

        bytes32 _management_key = keccak256(abi.encodePacked(management));

        keys[_management_key].key = _management_key;
        keys[_management_key].keyType = 1;
        keys[_management_key].purpose = 1;
        keysByPurpose[1].push(_management_key);

        emit KeyAdded(_management_key, keys[_management_key].purpose, 1);

        if(operational != management) {
            bytes32 _operational_key = keccak256(abi.encodePacked(operational));

            keys[_operational_key].key = _operational_key;
            keys[_operational_key].keyType = 1;
            keys[_operational_key].purpose = 2;
            keysByPurpose[2].push(_operational_key);

            emit KeyAdded(_operational_key, keys[_operational_key].purpose, 1);
        }
    }

    function getKey(bytes32 _key) public view override returns (uint256 purpose, uint256 keyType, bytes32 key){
        return (keys[_key].purpose, keys[_key].keyType, keys[_key].key);
    }

    function keyHasPurpose(bytes32 _key, uint256 _purpose) public view override returns (bool result) {
        return keys[_key].purpose == _purpose;
    }

    function getKeysByPurpose(uint256 _purpose) public view override returns (bytes32[] memory _keys) {
        return keysByPurpose[_purpose];
    }

    function addKey(bytes32 _key, uint256 _purpose, uint256 _type) public override returns (bool) {
        require(keyHasPurpose(keccak256(abi.encodePacked(msg.sender)), 1));
        require(_key != bytes32(0));
        require(keys[_key].key != _key);

        keys[_key].key = _key;
        keys[_key].purpose = _purpose;
        keys[_key].keyType = _type;

        keysByPurpose[_purpose].push(_key);

        emit KeyAdded(_key, _purpose, _type);
        return true;
    }

    function removeKey(bytes32 _key) public override returns (bool) {
        require(keyHasPurpose(keccak256(abi.encodePacked(msg.sender)), 1));
        require(_key != bytes32(0));

        require(keys[_key].key == _key);

        // TODO: for all key purposes
        require(!(keysByPurpose[1].length == 1 && keyHasPurpose(_key, 1)), "Cannot delete only management key!");

        emit KeyRemoved(keys[_key].key, keys[_key].purpose, keys[_key].keyType);

        uint index;
        bool success;
        (index, success) = keysByPurpose[keys[_key].purpose].indexOf(_key);
        keysByPurpose[keys[_key].purpose].removeByIndex(index);

        delete keys[_key];

        return true;
    }
}