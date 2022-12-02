// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

library ServiceAgreementStructsV1 {

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

    struct CommitInputArgs {
        address assetContract;
        uint256 tokenId;
        bytes keyword;
        uint8 hashFunctionId;
        uint16 epoch;
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
