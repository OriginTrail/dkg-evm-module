// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {Guardian} from "../Guardian.sol";
import {Named} from "../interface/Named.sol";
import {Versioned} from "../interface/Versioned.sol";
import {ServiceAgreementStructsV1} from "../structs/ServiceAgreementStructsV1.sol";

contract ServiceAgreementStorageV1U1 is Named, Versioned, Guardian {
    string private constant _NAME = "ServiceAgreementStorageV1U1";
    string private constant _VERSION = "1.0.0";

    // AgreementId [hash(assetStorage + tokenId + key)] => ExtendedServiceAgreement
    mapping(bytes32 => ServiceAgreementStructsV1.ExtendedServiceAgreement) internal serviceAgreements;

    // CommitId [keccak256(agreementId + epoch + stateIndex + identityId)] => stateCommitSubmission
    mapping(bytes32 => ServiceAgreementStructsV1.CommitSubmission) internal epochStateCommitSubmissions;

    // EpochStateId [keccak256(agreementId + epoch + stateIndex)] => epochStateCommitsCount
    mapping(bytes32 => uint8) internal epochStateCommitsCount;

    // StateId [keccak256(agreementId + stateIndex)] => updateCommitsDeadline
    mapping(bytes32 => uint256) internal updateCommitsDeadlines;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) Guardian(hubAddress) {}

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function createServiceAgreementObject(
        bytes32 agreementId,
        uint256 startTime,
        uint16 epochsNumber,
        uint128 epochLength,
        uint96 tokenAmount,
        uint8 scoreFunctionId,
        uint8 proofWindowOffsetPerc
    ) external onlyContracts {
        ServiceAgreementStructsV1.ExtendedServiceAgreement storage agreement = serviceAgreements[agreementId];
        agreement.startTime = startTime;
        agreement.epochsNumber = epochsNumber;
        agreement.epochLength = epochLength;
        agreement.tokenAmount = tokenAmount;
        agreement.scoreFunctionId = scoreFunctionId;
        agreement.proofWindowOffsetPerc = proofWindowOffsetPerc;
    }

    function deleteServiceAgreementObject(bytes32 agreementId) external onlyContracts {
        delete serviceAgreements[agreementId];
    }

    function getAgreementData(
        bytes32 agreementId
    )
        external
        view
        returns (
            uint256 startTime,
            uint16 epochsNumber,
            uint128 epochLength,
            uint96[2] memory tokens,
            uint8[2] memory scoreFunctionIdAndProofWindowOffsetPerc
        )
    {
        return (
            serviceAgreements[agreementId].startTime,
            serviceAgreements[agreementId].epochsNumber,
            serviceAgreements[agreementId].epochLength,
            [serviceAgreements[agreementId].tokenAmount, serviceAgreements[agreementId].updateTokenAmount],
            [serviceAgreements[agreementId].scoreFunctionId, serviceAgreements[agreementId].proofWindowOffsetPerc]
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

    function getAgreementUpdateTokenAmount(bytes32 agreementId) external view returns (uint96) {
        return serviceAgreements[agreementId].updateTokenAmount;
    }

    function setAgreementUpdateTokenAmount(bytes32 agreementId, uint96 updateTokenAmount) external onlyContracts {
        serviceAgreements[agreementId].updateTokenAmount = updateTokenAmount;
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

    function setAgreementProofWindowOffsetPerc(
        bytes32 agreementId,
        uint8 proofWindowOffsetPerc
    ) external onlyContracts {
        serviceAgreements[agreementId].proofWindowOffsetPerc = proofWindowOffsetPerc;
    }

    function getAgreementEpochSubmissionHead(
        bytes32 agreementId,
        uint16 epoch,
        uint256 stateIndex
    ) external view returns (bytes32) {
        return serviceAgreements[agreementId].epochSubmissionHeads[keccak256(abi.encodePacked(epoch, stateIndex))];
    }

    function setAgreementEpochSubmissionHead(
        bytes32 agreementId,
        uint16 epoch,
        uint256 stateIndex,
        bytes32 headCommitId
    ) external onlyContracts {
        serviceAgreements[agreementId].epochSubmissionHeads[
            keccak256(abi.encodePacked(epoch, stateIndex))
        ] = headCommitId;
    }

    function incrementAgreementRewardedNodesNumber(bytes32 agreementId, uint16 epoch) external onlyContracts {
        serviceAgreements[agreementId].rewardedNodesNumber[epoch]++;
    }

    function decrementAgreementRewardedNodesNumber(bytes32 agreementId, uint16 epoch) external onlyContracts {
        serviceAgreements[agreementId].rewardedNodesNumber[epoch]--;
    }

    function getAgreementRewardedNodesNumber(bytes32 agreementId, uint16 epoch) external view returns (uint32) {
        return serviceAgreements[agreementId].rewardedNodesNumber[epoch];
    }

    function setAgreementRewardedNodesNumber(
        bytes32 agreementId,
        uint16 epoch,
        uint32 rewardedNodesNumber
    ) external onlyContracts {
        serviceAgreements[agreementId].rewardedNodesNumber[epoch] = rewardedNodesNumber;
    }

    function deleteAgreementRewardedNodesNumber(bytes32 agreementId, uint16 epoch) external onlyContracts {
        delete serviceAgreements[agreementId].rewardedNodesNumber[epoch];
    }

    function serviceAgreementExists(bytes32 agreementId) external view returns (bool) {
        return serviceAgreements[agreementId].startTime != 0;
    }

    function createEpochStateCommitSubmissionObject(
        bytes32 commitId,
        uint72 identityId,
        uint72 prevIdentityId,
        uint72 nextIdentityId,
        uint40 score
    ) external onlyContracts {
        epochStateCommitSubmissions[commitId] = ServiceAgreementStructsV1.CommitSubmission({
            identityId: identityId,
            prevIdentityId: prevIdentityId,
            nextIdentityId: nextIdentityId,
            score: score
        });
    }

    function deleteEpochStateCommitSubmissionsObject(bytes32 commitId) external onlyContracts {
        delete epochStateCommitSubmissions[commitId];
    }

    function getEpochStateCommitSubmission(
        bytes32 commitId
    ) external view returns (ServiceAgreementStructsV1.CommitSubmission memory) {
        return epochStateCommitSubmissions[commitId];
    }

    function getEpochStateCommitSubmissionIdentityId(bytes32 commitId) external view returns (uint72) {
        return epochStateCommitSubmissions[commitId].identityId;
    }

    function setEpochStateCommitSubmissionIdentityId(bytes32 commitId, uint72 identityId) external onlyContracts {
        epochStateCommitSubmissions[commitId].identityId = identityId;
    }

    function getEpochStateCommitSubmissionPrevIdentityId(bytes32 commitId) external view returns (uint72) {
        return epochStateCommitSubmissions[commitId].prevIdentityId;
    }

    function setEpochStateCommitSubmissionPrevIdentityId(
        bytes32 commitId,
        uint72 prevIdentityId
    ) external onlyContracts {
        epochStateCommitSubmissions[commitId].prevIdentityId = prevIdentityId;
    }

    function getEpochStateCommitSubmissionNextIdentityId(bytes32 commitId) external view returns (uint72) {
        return epochStateCommitSubmissions[commitId].nextIdentityId;
    }

    function setEpochStateCommitSubmissionNextIdentityId(
        bytes32 commitId,
        uint72 nextIdentityId
    ) external onlyContracts {
        epochStateCommitSubmissions[commitId].nextIdentityId = nextIdentityId;
    }

    function getEpochStateCommitSubmissionScore(bytes32 commitId) external view returns (uint40) {
        return epochStateCommitSubmissions[commitId].score;
    }

    function setEpochStateCommitSubmissionScore(bytes32 commitId, uint40 score) external onlyContracts {
        epochStateCommitSubmissions[commitId].score = score;
    }

    function epochStateCommitSubmissionExists(bytes32 commitId) external view returns (bool) {
        return epochStateCommitSubmissions[commitId].identityId != 0;
    }

    function incrementEpochStateCommitsCount(bytes32 epochStateId) external onlyContracts {
        epochStateCommitsCount[epochStateId]++;
    }

    function decrementEpochStateCommitsCount(bytes32 epochStateId) external onlyContracts {
        epochStateCommitsCount[epochStateId]--;
    }

    function getEpochStateCommitsCount(bytes32 epochStateId) external view returns (uint8) {
        return epochStateCommitsCount[epochStateId];
    }

    function setEpochStateCommitsCount(bytes32 epochStateId, uint8 newEpochStateCommitsCount) external onlyContracts {
        epochStateCommitsCount[epochStateId] = newEpochStateCommitsCount;
    }

    function deleteEpochStateCommitsCount(bytes32 epochStateId) external onlyContracts {
        delete epochStateCommitsCount[epochStateId];
    }

    function getUpdateCommitsDeadline(bytes32 stateId) external view returns (uint256) {
        return updateCommitsDeadlines[stateId];
    }

    function setUpdateCommitsDeadline(bytes32 stateId, uint256 deadline) external onlyContracts {
        updateCommitsDeadlines[stateId] = deadline;
    }

    function deleteUpdateCommitsDeadline(bytes32 stateId) external onlyContracts {
        delete updateCommitsDeadlines[stateId];
    }

    function transferAgreementTokens(address receiver, uint96 tokenAmount) external onlyContracts {
        tokenContract.transfer(receiver, tokenAmount);
    }
}
