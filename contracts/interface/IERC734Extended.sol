// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IERC734Extended {
    event IdentityCreated(uint72 indexed identityId, bytes32 indexed operationalKey, bytes32 indexed adminKey);
    event KeyAdded(uint72 indexed identityId, bytes32 indexed key, uint256 purpose, uint256 keyType);
    event KeyRemoved(uint72 indexed identityId, bytes32 indexed key, uint256 purpose, uint256 keyType);

    struct Key {
        uint256 purpose; //e.g., ADMIN_KEY = 1, OPERATIONAL_KEY = 2, etc.
        uint256 keyType; // e.g. 1 = ECDSA, 2 = RSA, etc.
        bytes32 key;
    }

    function getKey(uint72 identityId, bytes32 _key)
        external
        view
        returns(uint256 purpose, uint256 keyType, bytes32 key);
    function keyHasPurpose(uint72 identityId, bytes32 _key, uint256 _purpose) external view returns (bool exists);
    function getKeysByPurpose(uint72 identityId, uint256 _purpose) external view returns (bytes32[] memory keys);
    function addKey(uint72 identityId, bytes32 _key, uint256 _purpose, uint256 _keyType) external;
    function removeKey(uint72 identityId, bytes32 _key) external;
}
