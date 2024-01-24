// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

library ShardingTableErrors {
    error InvalidPreviousIdentityId(
        uint72 identityId,
        uint256 hashRingPosition,
        uint72 prevIdentityId,
        uint256 prevHashRingPosition
    );
    error InvalidNextIdentityId(
        uint72 identityId,
        uint256 hashRingPosition,
        uint72 nextIdentityId,
        uint256 nextHashRingPosition
    );
    error InvalidPreviousOrNextIdentityId(
        uint72 identityId,
        uint72 sentPrevIdentityId,
        uint72 realPrevIdentityId,
        uint72 sentNextIdentityId,
        uint72 realNextIdentityId
    );
}
