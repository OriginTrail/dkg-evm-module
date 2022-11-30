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
        public
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

    function setAgreementStartTime(bytes32 agreementId, uint256 startTime) external onlyContracts {
        serviceAgreements[agreementId].startTime = startTime;
    }

    function setAgreementEpochsNumber(bytes32 agreementId, uint16 epochsNumber) external onlyContracts {
        serviceAgreements[agreementId].epochsNumber = epochsNumber;
    }

    function setAgreementEpochLength(bytes32 agreementId, uint128 epochLength) external onlyContracts {
        serviceAgreements[agreementId].epochLength = epochLength;
    }

    function setAgreementTokenAmount(bytes32 agreementId, uint96 tokenAmount) external onlyContracts {
        serviceAgreements[agreementId].tokenAmount = tokenAmount;
    }

    function setAgreementScoreFunctionId(bytes32 agreementId, uint8 newScoreFunctionId) external onlyContracts {
        serviceAgreements[agreementId].scoreFunctionId = newScoreFunctionId;
    }

    function setAgreementProofWindowOffsetPerc(bytes32 agreementId, uint8 proofWindowOffsetPerc)
        external
        onlyContracts
    {
        serviceAgreements[agreementId].proofWindowOffsetPerc = proofWindowOffsetPerc;
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

    function getCommitSubmission(bytes32 commitId) external view returns (uint72[3] memory, uint40) {
        return (
            [
                commitSubmissions[commitId].identityId,
                commitSubmissions[commitId].prevIdentityId,
                commitSubmissions[commitId].nextIdentityId
            ],
            commitSubmissions[commitId].score
        );
    }

    function setCommitSubmissionsIdentityId(bytes32 commitId, uint72 identityId) external onlyContracts {
        commitSubmissions[commitId].identityId = identityId;
    }

    function setCommitSubmissionsPrevIdentityId(bytes32 commitId, uint72 prevIdentityId) external onlyContracts {
        commitSubmissions[commitId].prevIdentityId = prevIdentityId;
    }

    function setCommitSubmissionsNextIdentityId(bytes32 commitId, uint72 nextIdentityId) external onlyContracts {
        commitSubmissions[commitId].nextIdentityId = nextIdentityId;
    }

    function setCommitSubmissionsScore(bytes32 commitId, uint40 score) external onlyContracts {
        commitSubmissions[commitId].score = score;
    }

    function setAgreementEpochSubmissionHead(bytes32 agreementId, uint16 epoch, bytes32 headCommitId)
        external
        onlyContracts
    {
        serviceAgreements[agreementId].epochSubmissionHeads[epoch] = headCommitId;
    }

    function setAgreementRewardedNodes(bytes32 agreementId, uint16 epoch, uint32 rewardedNodes)
        external
        onlyContracts
    {
        serviceAgreements[agreementId].rewardedNodes[epoch] = rewardedNodes;
    }

    function _checkHub() internal view virtual {
        require(hub.isContract(msg.sender), "Fn can only be called by the hub");
    }

}
