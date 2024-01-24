// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

library ServiceAgreementStructsV2 {
    struct CommitInputArgs {
        address assetContract;
        uint256 tokenId;
        bytes keyword;
        uint8 hashFunctionId;
        uint16 epoch;
        uint72 closestNode;
        uint72 leftNeighborhoodEdge;
        uint72 rightNeighborhoodEdge;
    }
}
