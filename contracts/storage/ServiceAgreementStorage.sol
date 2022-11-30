// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { Hub } from "../Hub.sol";
import { ServiceAgreementStructs } from "../structs/ServiceAgreementStructs.sol";

contract ServiceAgreementStorage {

    Hub public hub;

    // CommitId [keccak256(agreementId + epoch + identityId)] => CommitSubmission
    mapping(bytes32 => ServiceAgreementStructs.CommitSubmission) commitSubmissions;

    // hash(asset type contract + tokenId + key) -> ServiceAgreement
    mapping(bytes32 => ServiceAgreementStructs.ServiceAgreement) serviceAgreements;

    constructor (address hubAddress) {
        require(hubAddress != address(0));

        hub = Hub(hubAddress);
    }

    modifier onlyContracts() {
        _checkHub();
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
        external
        onlyContracts
    {
        ServiceAgreementStructs.ServiceAgreement storage agreement = serviceAgreements[agreementId];
        agreement.startTime = startTime;
        agreement.epochsNumber = epochsNumber;
        agreement.epochLength = epochLength;
        agreement.tokenAmount = tokenAmount;
        agreement.scoreFunctionId = scoreFunctionId;
        agreement.proofWindowOffsetPerc = proofWindowOffsetPerc;
    }

    function getAgreementData(bytes32 agreementId)
        external
        view
        returns (uint256, uint16, uint128, uint96, uint8[2] memory)
    {
        return (
            serviceAgreements[agreementId].startTime,
            serviceAgreements[agreementId].epochsNumber,
            serviceAgreements[agreementId].epochLength,
            serviceAgreements[agreementId].tokenAmount,
            [
                serviceAgreements[agreementId].scoreFunctionId,
                serviceAgreements[agreementId].proofWindowOffsetPerc
            ]
        );
    }

    function getAgreementStartTime(bytes32 agreementId) external view returns (uint256) {
        return serviceAgreements[agreementId].startTime;
    }

    function setAgreementStartTime(bytes32 agreementId, uint256 startTime) external onlyContracts {
        serviceAgreements[agreementId].startTime = startTime;
    }

    function getAgreementEpochsNumber(bytes32 agreementId) external view returns (uint16) {
        return serviceAgreements[agreementId].epochsNumber;
    }

    function setAgreementEpochsNumber(bytes32 agreementId, uint16 epochsNumber) external onlyContracts {
        serviceAgreements[agreementId].epochsNumber = epochsNumber;
    }

    function getAgreementEpochLength(bytes32 agreementId) external view returns (uint128) {
        return serviceAgreements[agreementId].epochLength;
    }

    function setAgreementEpochLength(bytes32 agreementId, uint128 epochLength) external onlyContracts {
        serviceAgreements[agreementId].epochLength = epochLength;
    }

    function getAgreementTokenAmount(bytes32 agreementId) external view returns (uint96) {
        return serviceAgreements[agreementId].tokenAmount;
    }

    function setAgreementTokenAmount(bytes32 agreementId, uint96 tokenAmount) external onlyContracts {
        serviceAgreements[agreementId].tokenAmount = tokenAmount;
    }

    function getAgreementScoreFunctionId(bytes32 agreementId) external view returns (uint8) {
        return serviceAgreements[agreementId].scoreFunctionId;
    }

    function setAgreementScoreFunctionId(bytes32 agreementId, uint8 newScoreFunctionId) external onlyContracts {
        serviceAgreements[agreementId].scoreFunctionId = newScoreFunctionId;
    }

    function getAgreementProofWindowOffsetPerc(bytes32 agreementId) external view returns (uint8) {
        return serviceAgreements[agreementId].proofWindowOffsetPerc;
    }

    function setAgreementProofWindowOffsetPerc(bytes32 agreementId, uint8 proofWindowOffsetPerc)
        external
        onlyContracts
    {
        serviceAgreements[agreementId].proofWindowOffsetPerc = proofWindowOffsetPerc;
    }

    function getAgreementEpochSubmissionHead(bytes32 agreementId, uint16 epoch) external view returns (bytes32) {
        return serviceAgreements[agreementId].epochSubmissionHeads[epoch];
    }

    function setAgreementEpochSubmissionHead(bytes32 agreementId, uint16 epoch, bytes32 headCommitId)
        external
        onlyContracts
    {
        serviceAgreements[agreementId].epochSubmissionHeads[epoch] = headCommitId;
    }

    function getAgreementRewardedNodes(bytes32 agreementId, uint16 epoch) external view returns (uint32) {
        return serviceAgreements[agreementId].rewardedNodes[epoch];
    }

    function setAgreementRewardedNodes(bytes32 agreementId, uint16 epoch, uint32 rewardedNodes)
        external
        onlyContracts
    {
        serviceAgreements[agreementId].rewardedNodes[epoch] = rewardedNodes;
    }

    function createCommitSubmissionObject(
        bytes32 commitId,
        uint72 identityId,
        uint72 prevIdentityId,
        uint72 nextIdentityId,
        uint40 score
    )
        external
        onlyContracts
    {
        commitSubmissions[commitId] = ServiceAgreementStructs.CommitSubmission({
            identityId: identityId,
            prevIdentityId: prevIdentityId,
            nextIdentityId: nextIdentityId,
            score: score
        });
    }

    function getCommitSubmission(bytes32 commitId)
        external
        view
        returns (ServiceAgreementStructs.CommitSubmission memory)
    {
        return commitSubmissions[commitId];
    }

    function getCommitSubmissionsIdentityId(bytes32 commitId) external view returns (uint72) {
        return commitSubmissions[commitId].identityId;
    }

    function setCommitSubmissionIdentityId(bytes32 commitId, uint72 identityId) external onlyContracts {
        commitSubmissions[commitId].identityId = identityId;
    }

    function getCommitSubmissionPrevIdentityId(bytes32 commitId) external view returns (uint72) {
        return commitSubmissions[commitId].prevIdentityId;
    }

    function setCommitSubmissionPrevIdentityId(bytes32 commitId, uint72 prevIdentityId) external onlyContracts {
        commitSubmissions[commitId].prevIdentityId = prevIdentityId;
    }

    function getCommitSubmissionNextIdentityId(bytes32 commitId) external view returns (uint72) {
        return commitSubmissions[commitId].nextIdentityId;
    }

    function setCommitSubmissionNextIdentityId(bytes32 commitId, uint72 nextIdentityId) external onlyContracts {
        commitSubmissions[commitId].nextIdentityId = nextIdentityId;
    }

    function getCommitSubmissionScore(bytes32 commitId) external view returns (uint40) {
        return commitSubmissions[commitId].score;
    }

    function setCommitSubmissionScore(bytes32 commitId, uint40 score) external onlyContracts {
        commitSubmissions[commitId].score = score;
    }

    function _checkHub() internal view virtual {
        require(hub.isContract(msg.sender), "Fn can only be called by the hub");
    }

}
