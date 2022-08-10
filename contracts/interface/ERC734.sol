// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface ERC734 {
    event KeyAdded(bytes32 indexed key, uint256 indexed purpose, uint256 indexed keyType);
    event KeyRemoved(bytes32 indexed key, uint256 indexed purpose, uint256 indexed keyType);

    struct Key {
        uint256 purpose; //e.g., MANAGEMENT_KEY = 1, EXECUTION_KEY = 2, etc.
        uint256 keyType; // e.g. 1 = ECDSA, 2 = RSA, etc.
        bytes32 key;
    }

    function getKey(bytes32 _key) external view returns(uint256 purpose, uint256 keyType, bytes32 key);
    function keyHasPurpose(bytes32 _key, uint256 _purpose) external view returns (bool exists);
    function getKeysByPurpose(uint256 _purpose) external view returns (bytes32[] memory keys);
    function addKey(bytes32 _key, uint256 _purpose, uint256 _keyType) external returns (bool success);
    function removeKey(bytes32 _key) external returns (bool success);
}