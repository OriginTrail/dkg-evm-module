// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { Hub } from "../Hub.sol";

contract ServiceAgreementStorage {

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
        uint8 proofWindowOffsetPerc;  // Perc == In % of the epoch
        mapping(uint16 => bytes32) epochSubmissionHeads;  // epoch => headCommitId
        mapping(uint16 => uint32) rewardedNodes;
    }

    Hub public hub;

    // CommitId [keccak256(agreementId + epoch + identityId)] => CommitSubmission
    mapping(bytes32 => CommitSubmission) commitSubmissions;

    // hash(asset type contract + tokenId + key) -> ServiceAgreement
    mapping(bytes32 => ServiceAgreement) serviceAgreements;

    constructor (address hubAddress) {
        require(hubAddress != address(0));
        hub = Hub(hubAddress);
    }

    modifier onlyContracts() {
        require(hub.isContract(msg.sender),
            "Function can only be called by contracts!");
        _;
    }

    function createServiceAgreementObject(
        bytes32 agreementId,
        uint256 startTime,
        uint16 epochsNumber,
        uint128 epochLength,
        uint96 tokenAmount,
        uint8 scoreFunctionId,
        uint8 proofWindowOffsetPerc
    )
        public
        onlyContracts
    {
        ServiceAgreement storage agreement = serviceAgreements[agreementId];
        agreement.startTime = startTime;
        agreement.epochsNumber = epochsNumber;
        agreement.epochLength = epochLength;
        agreement.tokenAmount = tokenAmount;
        agreement.scoreFunctionId = scoreFunctionId;
        agreement.proofWindowOffsetPerc = proofWindowOffsetPerc;
    }

    function setAgreementStartTime(bytes32 agreementId, uint256 startTime)
        public
        onlyContracts
    {
        require(serviceAgreements[agreementId].startTime > 0, "Service Agreement doesn't exist");
        serviceAgreements[agreementId].startTime = startTime;
    }

    function setAgreementEpochsNumber(bytes32 agreementId, uint16 epochsNumber)
        public
        onlyContracts
    {
        require(serviceAgreements[agreementId].startTime > 0, "Service Agreement doesn't exist");
        serviceAgreements[agreementId].epochsNumber = epochsNumber;
    }

    function setAgreementEpochLength(bytes32 agreementId, uint128 epochLength)
        public
        onlyContracts
    {
        require(serviceAgreements[agreementId].startTime > 0, "Service Agreement doesn't exist");
        serviceAgreements[agreementId].epochLength = epochLength;
    }

    function setAgreementTokenAmount(bytes32 agreementId, uint96 tokenAmount)
        public
        onlyContracts
    {
        require(serviceAgreements[agreementId].startTime > 0, "Service Agreement doesn't exist");
        serviceAgreements[agreementId].tokenAmount = tokenAmount;
    }

    function setAgreementScoreFunctionId(bytes32 agreementId, uint8 newScoreFunctionId)
        public
        onlyContracts
    {
        require(serviceAgreements[agreementId].startTime > 0, "Service Agreement doesn't exist");
        serviceAgreements[agreementId].scoreFunctionId = newScoreFunctionId;
    }


    function setAgreementProofWindowOffsetPerc(bytes32 agreementId, uint8 proofWindowOffsetPerc)
        public
        onlyContracts
    {
        require(serviceAgreements[agreementId].startTime > 0, "Service Agreement doesn't exist");
        serviceAgreements[agreementId].proofWindowOffsetPerc = proofWindowOffsetPerc;
    }

    function createCommitSubmissionObject(
        bytes32 commitId,
        uint72 identityId,
        uint72 prevIdentityId,
        uint72 nextIdentityId,
        uint40 score
    )
        public
        onlyContracts
    {
        CommitSubmission storage commit = commitSubmissions[commitId];
        commit.identityId = identityId;
        commit.prevIdentityId = prevIdentityId;
        commit.nextIdentityId = nextIdentityId;
        commit.score = score;
    }

    function setCommitSubmissionsIdentityId(bytes32 commitId, uint72 identityId)
        public
        onlyContracts
    {
        require(commitSubmissions[commitId].identityId != 0, "Commit submissions doesn't exist");
        commitSubmissions[commitId].identityId = identityId;
    }

    function setCommitSubmissionsPrevIdentityId(bytes32 commitId, uint72 prevIdentityId)
        public
        onlyContracts
    {
        require(commitSubmissions[commitId].identityId != 0, "Commit submissions doesn't exist");
        commitSubmissions[commitId].prevIdentityId = prevIdentityId;
    }

    function setCommitSubmissionsNextIdentityId(bytes32 commitId, uint72 nextIdentityId)
        public
        onlyContracts
    {
        require(commitSubmissions[commitId].identityId != 0, "Commit submissions doesn't exist");
        commitSubmissions[commitId].nextIdentityId = nextIdentityId;
    }

    function setCommitSubmissionsScore(bytes32 commitId, uint40 score)
        public
        onlyContracts
    {
        require(commitSubmissions[commitId].identityId != 0, "Commit submissions doesn't exist");
        commitSubmissions[commitId].score = score;
    }

    function setAgreementEpochSubmissionHead(bytes32 agreementId, uint16 epoch, bytes32 headCommitId)
        public
        onlyContracts
    {
        require(serviceAgreements[agreementId].startTime > 0, "Service Agreement doesn't exist");
        serviceAgreements[agreementId].epochSubmissionHeads[epoch] = headCommitId;
    }

    function setAgreementRewardedNodes(bytes32 agreementId, uint16 epoch, uint32 rewardedNodes)
        public
        onlyContracts
    {
        require(serviceAgreements[agreementId].startTime > 0, "Service Agreement doesn't exist");
        serviceAgreements[agreementId].rewardedNodes[epoch] = rewardedNodes;
    }

    function getAgreementData(bytes32 agreementId)
        public
        view
        returns (uint256, uint16, uint128, uint96, uint8, uint8)
    {
        require(serviceAgreements[agreementId].startTime > 0, "Service Agreement doesn't exist");

        return (
        serviceAgreements[agreementId].startTime,
        serviceAgreements[agreementId].epochsNumber,
        serviceAgreements[agreementId].epochLength,
        serviceAgreements[agreementId].tokenAmount,
        serviceAgreements[agreementId].scoreFunctionId,
        serviceAgreements[agreementId].proofWindowOffsetPerc
        );
    }

    function getAgreementStartTime(bytes32 agreementId)
        public
        view
        returns (uint256)
    {
        require(serviceAgreements[agreementId].startTime > 0, "Service Agreement doesn't exist");
        return serviceAgreements[agreementId].startTime;
    }

    function getAgreementEpochsNumber(bytes32 agreementId)
        public
        view
        returns (uint16)
    {
        require(serviceAgreements[agreementId].startTime > 0, "Service Agreement doesn't exist");
        return serviceAgreements[agreementId].epochsNumber;
    }

    function getAgreementEpochLength(bytes32 agreementId)
        public
        view
        returns (uint128)
    {
        require(serviceAgreements[agreementId].startTime > 0, "Service Agreement doesn't exist");
        return serviceAgreements[agreementId].epochLength;
    }

    function getAgreementTokenAmount(bytes32 agreementId)
        public
        view
        returns (uint96)
    {
        require(serviceAgreements[agreementId].startTime > 0, "Service Agreement doesn't exist");
        return serviceAgreements[agreementId].tokenAmount;
    }

    function getAgreementScoreFunctionId(bytes32 agreementId)
        public
        view
        returns (uint8)
    {
        require(serviceAgreements[agreementId].startTime > 0, "Service Agreement doesn't exist");
        return serviceAgreements[agreementId].scoreFunctionId;
    }

    function getAgreementProofWindowOffsetPerc(bytes32 agreementId)
        public
        view
        returns (uint8)
    {
        require(serviceAgreements[agreementId].startTime > 0, "Service Agreement doesn't exist");
        return serviceAgreements[agreementId].proofWindowOffsetPerc;
    }

    function getAgreementEpochSubmissionHead(bytes32 agreementId, uint16 epoch)
        public
        view
        returns (bytes32)
    {
        require(serviceAgreements[agreementId].startTime > 0, "Service Agreement doesn't exist");
        return serviceAgreements[agreementId].epochSubmissionHeads[epoch];
    }

    function getAgreementRewardedNodes(bytes32 agreementId, uint16 epoch)
        public
        view
        returns (uint32)
    {
        require(serviceAgreements[agreementId].startTime > 0, "Service Agreement doesn't exist");
        return serviceAgreements[agreementId].rewardedNodes[epoch];
    }

    function getCommitSubmission(
        bytes32 commitId
    )
        public
        view
        returns (uint72, uint72, uint72, uint40)
    {
        require(commitSubmissions[commitId].identityId != 0, "Commit submissions doesn't exist");
        return (
        commitSubmissions[commitId].identityId,
        commitSubmissions[commitId].prevIdentityId,
        commitSubmissions[commitId].nextIdentityId,
        commitSubmissions[commitId].score
        );
    }

    function getCommitSubmissionsIdentityId(bytes32 commitId)
        public
        view
        returns (uint72)
    {
        require(commitSubmissions[commitId].identityId != 0, "Commit submissions doesn't exist");
        return commitSubmissions[commitId].identityId;
    }

    function getCommitSubmissionsPrevIdentityId(bytes32 commitId)
        public
        view
        returns (uint72)
    {
        require(commitSubmissions[commitId].identityId != 0, "Commit submissions doesn't exist");
        return commitSubmissions[commitId].prevIdentityId;
    }

    function getCommitSubmissionsNextIdentityId(bytes32 commitId)
        public
        view
        returns (uint72)
    {
        require(commitSubmissions[commitId].identityId != 0, "Commit submissions doesn't exist");
        return commitSubmissions[commitId].nextIdentityId;
    }

    function getCommitSubmissionsScore(bytes32 commitId)
        public
        view
        returns (uint40)
    {
        require(commitSubmissions[commitId].identityId != 0, "Commit submissions doesn't exist");
        return commitSubmissions[commitId].score;
    }

}
