// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

library ServiceAgreementStructs {

    struct CommitSubmission {
        uint72 identityId;
        uint72 prevIdentityId;
        uint72 nextIdentityId;
        uint40 score;
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
        mapping(uint16 => uint32) rewardedNodes;
    }

}
