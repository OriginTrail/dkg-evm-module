// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IERC734Extended {
    event IdentityCreated(uint96 indexed identityId, bytes32 indexed operationalKey, bytes32 indexed adminKey);
    event KeyAdded(uint96 indexed identityId, bytes32 indexed key, uint256 purpose, uint256 keyType);
    event KeyRemoved(uint96 indexed identityId, bytes32 indexed key, uint256 purpose, uint256 keyType);

    struct Key {
        uint256 purpose; //e.g., ADMIN_KEY = 1, OPERATIONAL_KEY = 2, etc.
        uint256 keyType; // e.g. 1 = ECDSA, 2 = RSA, etc.
        bytes32 key;
    }

    function getKey(uint96 identityId, bytes32 _key)
        external
        view
        returns(uint256 purpose, uint256 keyType, bytes32 key);
    function keyHasPurpose(uint96 identityId, bytes32 _key, uint256 _purpose) external view returns (bool exists);
    function getKeysByPurpose(uint96 identityId, uint256 _purpose) external view returns (bytes32[] memory keys);
    function addKey(uint96 identityId, bytes32 _key, uint256 _purpose, uint256 _keyType) external;
    function removeKey(uint96 identityId, bytes32 _key) external;
}
