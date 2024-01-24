// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

library ServiceAgreementStructsV2 {
    struct CommitSubmission {
        uint72 identityId;
        uint72 prevIdentityId;
        uint72 nextIdentityId;
        uint40 score;
    }

    struct ServiceAgreementInputArgs {
        address assetCreator;
        address assetContract;
        uint256 tokenId;
        bytes keyword;
        uint8 hashFunctionId;
        uint16 epochsNumber;
        uint96 tokenAmount;
        uint8 scoreFunctionId;
    }

    struct ServiceAgreement {
        uint256 startTime;
        uint16 epochsNumber;
        uint128 epochLength;
        uint96 tokenAmount;
        uint8 scoreFunctionId;
        uint8 proofWindowOffsetPerc;
        // epoch => headCommitId
        mapping(uint16 => bytes32) epochSubmissionHeads;
        // epoch => number of nodes received rewards
        mapping(uint16 => uint32) rewardedNodesNumber;
    }

    struct ExtendedServiceAgreement {
        uint256 startTime;
        uint16 epochsNumber;
        uint128 epochLength;
        uint96 tokenAmount;
        uint96 updateTokenAmount;
        uint8 scoreFunctionId;
        uint8 proofWindowOffsetPerc;
        // keccak256(epoch + stateIndex) => headCommitId
        mapping(bytes32 => bytes32) epochSubmissionHeads;
        // epoch => number of nodes received rewards
        mapping(uint16 => uint32) rewardedNodesNumber;
    }

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

    struct ProofInputArgs {
        address assetContract;
        uint256 tokenId;
        bytes keyword;
        uint8 hashFunctionId;
        uint16 epoch;
        bytes32[] proof;
        bytes32 chunkHash;
    }
}
