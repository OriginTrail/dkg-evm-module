// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {ServiceAgreementStorageV1} from "./ServiceAgreementStorageV1.sol";
import {ServiceAgreementStorageV1U1} from "./ServiceAgreementStorageV1U1.sol";
import {ServiceAgreementStructsV1} from "../structs/ServiceAgreementStructsV1.sol";
import {HubDependent} from "../abstract/HubDependent.sol";
import {Initializable} from "../interface/Initializable.sol";
import {Named} from "../interface/Named.sol";
import {Versioned} from "../interface/Versioned.sol";
import {GeneralErrors} from "../errors/GeneralErrors.sol";
import {ServiceAgreementErrors} from "../errors/ServiceAgreementErrors.sol";

contract ServiceAgreementStorageProxy is Named, Versioned, HubDependent, Initializable {
    string private constant _NAME = "ServiceAgreementStorageProxy";
    string private constant _VERSION = "1.0.0";

    ServiceAgreementStorageV1 public storageV1;
    ServiceAgreementStorageV1U1 public storageV1U1;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) HubDependent(hubAddress) {}

    function initialize() public onlyHubOwner {
        storageV1 = ServiceAgreementStorageV1(hub.getContractAddress("ServiceAgreementStorageV1"));
        storageV1U1 = ServiceAgreementStorageV1U1(hub.getContractAddress("ServiceAgreementStorageV1U1"));
    }

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function migrateV1ServiceAgreement(bytes32 agreementId) external onlyContracts {
        ServiceAgreementStorageV1 sasV1 = storageV1;
        ServiceAgreementStorageV1U1 sasV1U1 = storageV1U1;

        uint96 tokenAmount = sasV1.getAgreementTokenAmount(agreementId);

        sasV1.deleteServiceAgreementObject(agreementId);

        sasV1U1.setAgreementTokenAmount(agreementId, tokenAmount);
        sasV1.transferAgreementTokens(address(sasV1U1), tokenAmount);
    }

    function createV1U1ServiceAgreementObject(
        bytes32 agreementId,
        uint256 startTime,
        uint16 epochsNumber,
        uint128 epochLength,
        uint96 tokenAmount,
        uint8 scoreFunctionId,
        uint8 proofWindowOffsetPerc
    ) external onlyContracts {
        storageV1U1.createServiceAgreementObject(
            agreementId,
            startTime,
            epochsNumber,
            epochLength,
            tokenAmount,
            scoreFunctionId,
            proofWindowOffsetPerc
        );
    }

    function createV1ServiceAgreementObject(
        bytes32 agreementId,
        uint16 epochsNumber,
        uint128 epochLength,
        uint96 tokenAmount,
        uint8 scoreFunctionId,
        uint8 proofWindowOffsetPerc
    ) external onlyContracts {
        storageV1.createServiceAgreementObject(
            agreementId,
            epochsNumber,
            epochLength,
            tokenAmount,
            scoreFunctionId,
            proofWindowOffsetPerc
        );
    }

    function deleteServiceAgreementV1Object(bytes32 agreementId) external onlyContracts {
        storageV1.deleteServiceAgreementObject(agreementId);
    }

    function deleteServiceAgreementV1U1Object(bytes32 agreementId) external onlyContracts {
        storageV1U1.deleteServiceAgreementObject(agreementId);
    }

    function deleteServiceAgreementObject(bytes32 agreementId) external onlyContracts {
        if (this.agreementV1Exists(agreementId)) {
            storageV1.deleteServiceAgreementObject(agreementId);
        } else {
            storageV1U1.deleteServiceAgreementObject(agreementId);
        }
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
        if (this.agreementV1Exists(agreementId)) {
            uint96 tokenAmount;
            (startTime, epochsNumber, epochLength, tokenAmount, scoreFunctionIdAndProofWindowOffsetPerc) = storageV1
                .getAgreementData(agreementId);
            return (
                startTime,
                epochsNumber,
                epochLength,
                [tokenAmount, storageV1U1.getAgreementUpdateTokenAmount(agreementId)],
                scoreFunctionIdAndProofWindowOffsetPerc
            );
        } else if (this.agreementV1U1Exists(agreementId)) {
            return storageV1U1.getAgreementData(agreementId);
        } else {
            revert ServiceAgreementErrors.ServiceAgreementDoesntExist(agreementId);
        }
    }

    function getAgreementStartTime(bytes32 agreementId) external view returns (uint256) {
        if (this.agreementV1Exists(agreementId)) {
            return storageV1.getAgreementStartTime(agreementId);
        } else {
            return storageV1U1.getAgreementStartTime(agreementId);
        }
    }

    function setAgreementStartTime(bytes32 agreementId, uint256 startTime) external onlyContracts {
        if (this.agreementV1Exists(agreementId)) {
            storageV1.setAgreementStartTime(agreementId, startTime);
        } else {
            storageV1U1.setAgreementStartTime(agreementId, startTime);
        }
    }

    function getAgreementEpochsNumber(bytes32 agreementId) external view returns (uint16) {
        if (this.agreementV1Exists(agreementId)) {
            return storageV1.getAgreementEpochsNumber(agreementId);
        } else {
            return storageV1U1.getAgreementEpochsNumber(agreementId);
        }
    }

    function setAgreementEpochsNumber(bytes32 agreementId, uint16 epochsNumber) external onlyContracts {
        if (this.agreementV1Exists(agreementId)) {
            storageV1.setAgreementEpochsNumber(agreementId, epochsNumber);
        } else {
            storageV1U1.setAgreementEpochsNumber(agreementId, epochsNumber);
        }
    }

    function getAgreementEpochLength(bytes32 agreementId) external view returns (uint128) {
        if (this.agreementV1Exists(agreementId)) {
            return storageV1.getAgreementEpochLength(agreementId);
        } else {
            return storageV1U1.getAgreementEpochLength(agreementId);
        }
    }

    function setAgreementEpochLength(bytes32 agreementId, uint128 epochLength) external onlyContracts {
        if (this.agreementV1Exists(agreementId)) {
            storageV1.setAgreementEpochLength(agreementId, epochLength);
        } else {
            storageV1U1.setAgreementEpochLength(agreementId, epochLength);
        }
    }

    function getAgreementTokenAmount(bytes32 agreementId) external view returns (uint96) {
        if (this.agreementV1Exists(agreementId)) {
            return storageV1.getAgreementTokenAmount(agreementId);
        } else {
            return storageV1U1.getAgreementTokenAmount(agreementId);
        }
    }

    function setAgreementTokenAmount(bytes32 agreementId, uint96 tokenAmount) external onlyContracts {
        if (this.agreementV1Exists(agreementId)) {
            storageV1.setAgreementTokenAmount(agreementId, tokenAmount);
        } else {
            storageV1U1.setAgreementTokenAmount(agreementId, tokenAmount);
        }
    }

    function getAgreementUpdateTokenAmount(bytes32 agreementId) external view returns (uint96) {
        return storageV1U1.getAgreementUpdateTokenAmount(agreementId);
    }

    function setAgreementUpdateTokenAmount(bytes32 agreementId, uint96 updateTokenAmount) external onlyContracts {
        storageV1U1.setAgreementUpdateTokenAmount(agreementId, updateTokenAmount);
    }

    function getAgreementScoreFunctionId(bytes32 agreementId) external view returns (uint8) {
        if (this.agreementV1Exists(agreementId)) {
            return storageV1.getAgreementScoreFunctionId(agreementId);
        } else {
            return storageV1U1.getAgreementScoreFunctionId(agreementId);
        }
    }

    function setAgreementScoreFunctionId(bytes32 agreementId, uint8 newScoreFunctionId) external onlyContracts {
        if (this.agreementV1Exists(agreementId)) {
            storageV1.setAgreementScoreFunctionId(agreementId, newScoreFunctionId);
        } else {
            storageV1U1.setAgreementScoreFunctionId(agreementId, newScoreFunctionId);
        }
    }

    function getAgreementProofWindowOffsetPerc(bytes32 agreementId) external view returns (uint8) {
        if (this.agreementV1Exists(agreementId)) {
            return storageV1.getAgreementProofWindowOffsetPerc(agreementId);
        } else {
            return storageV1U1.getAgreementProofWindowOffsetPerc(agreementId);
        }
    }

    function setAgreementProofWindowOffsetPerc(
        bytes32 agreementId,
        uint8 proofWindowOffsetPerc
    ) external onlyContracts {
        if (this.agreementV1Exists(agreementId)) {
            storageV1.setAgreementProofWindowOffsetPerc(agreementId, proofWindowOffsetPerc);
        } else {
            storageV1U1.setAgreementProofWindowOffsetPerc(agreementId, proofWindowOffsetPerc);
        }
    }

    function getV1U1AgreementEpochSubmissionHead(
        bytes32 agreementId,
        uint16 epoch,
        uint256 stateIndex
    ) external view returns (bytes32) {
        return storageV1U1.getAgreementEpochSubmissionHead(agreementId, epoch, stateIndex);
    }

    function getV1AgreementEpochSubmissionHead(bytes32 agreementId, uint16 epoch) external view returns (bytes32) {
        return storageV1.getAgreementEpochSubmissionHead(agreementId, epoch);
    }

    function setV1U1AgreementEpochSubmissionHead(
        bytes32 agreementId,
        uint16 epoch,
        uint256 stateIndex,
        bytes32 headCommitId
    ) external onlyContracts {
        storageV1U1.setAgreementEpochSubmissionHead(agreementId, epoch, stateIndex, headCommitId);
    }

    function setV1AgreementEpochSubmissionHead(
        bytes32 agreementId,
        uint16 epoch,
        bytes32 headCommitId
    ) external onlyContracts {
        storageV1.setAgreementEpochSubmissionHead(agreementId, epoch, headCommitId);
    }

    function incrementAgreementRewardedNodesNumber(bytes32 agreementId, uint16 epoch) external onlyContracts {
        if (this.agreementV1Exists(agreementId)) {
            storageV1.incrementAgreementRewardedNodesNumber(agreementId, epoch);
        } else {
            storageV1U1.incrementAgreementRewardedNodesNumber(agreementId, epoch);
        }
    }

    function decrementAgreementRewardedNodesNumber(bytes32 agreementId, uint16 epoch) external onlyContracts {
        if (this.agreementV1Exists(agreementId)) {
            storageV1.decrementAgreementRewardedNodesNumber(agreementId, epoch);
        } else {
            storageV1U1.decrementAgreementRewardedNodesNumber(agreementId, epoch);
        }
    }

    function getAgreementRewardedNodesNumber(bytes32 agreementId, uint16 epoch) external view returns (uint32) {
        if (this.agreementV1Exists(agreementId)) {
            return storageV1.getAgreementRewardedNodesNumber(agreementId, epoch);
        } else {
            return storageV1U1.getAgreementRewardedNodesNumber(agreementId, epoch);
        }
    }

    function setAgreementRewardedNodesNumber(
        bytes32 agreementId,
        uint16 epoch,
        uint32 rewardedNodesNumber
    ) external onlyContracts {
        if (this.agreementV1Exists(agreementId)) {
            storageV1.setAgreementRewardedNodesNumber(agreementId, epoch, rewardedNodesNumber);
        } else {
            storageV1U1.setAgreementRewardedNodesNumber(agreementId, epoch, rewardedNodesNumber);
        }
    }

    function deleteAgreementRewardedNodesNumber(bytes32 agreementId, uint16 epoch) external onlyContracts {
        if (this.agreementV1Exists(agreementId)) {
            storageV1.setAgreementRewardedNodesNumber(agreementId, epoch, 0);
        } else {
            storageV1U1.deleteAgreementRewardedNodesNumber(agreementId, epoch);
        }
    }

    function createV1CommitSubmissionObject(
        bytes32 commitId,
        uint72 identityId,
        uint72 prevIdentityId,
        uint72 nextIdentityId,
        uint40 score
    ) external onlyContracts {
        storageV1.createCommitSubmissionObject(commitId, identityId, prevIdentityId, nextIdentityId, score);
    }

    function createV1U1CommitSubmissionObject(
        bytes32 commitId,
        uint72 identityId,
        uint72 prevIdentityId,
        uint72 nextIdentityId,
        uint40 score
    ) external onlyContracts {
        storageV1U1.createEpochStateCommitSubmissionObject(commitId, identityId, prevIdentityId, nextIdentityId, score);
    }

    function deleteCommitSubmissionsObject(bytes32 commitId) external onlyContracts {
        if (this.commitV1U1Exists(commitId)) {
            storageV1U1.deleteEpochStateCommitSubmissionsObject(commitId);
        } else {
            storageV1.deleteCommitSubmissionsObject(commitId);
        }
    }

    function getCommitSubmission(
        bytes32 commitId
    ) external view returns (ServiceAgreementStructsV1.CommitSubmission memory) {
        if (this.commitV1U1Exists(commitId)) {
            return storageV1U1.getEpochStateCommitSubmission(commitId);
        } else {
            return storageV1.getCommitSubmission(commitId);
        }
    }

    function getCommitSubmissionIdentityId(bytes32 commitId) external view returns (uint72) {
        if (this.commitV1U1Exists(commitId)) {
            return storageV1U1.getEpochStateCommitSubmissionIdentityId(commitId);
        } else {
            return storageV1.getCommitSubmissionIdentityId(commitId);
        }
    }

    function setCommitSubmissionIdentityId(bytes32 commitId, uint72 identityId) external onlyContracts {
        if (this.commitV1U1Exists(commitId)) {
            storageV1U1.setEpochStateCommitSubmissionIdentityId(commitId, identityId);
        } else {
            storageV1.setCommitSubmissionIdentityId(commitId, identityId);
        }
    }

    function getCommitSubmissionPrevIdentityId(bytes32 commitId) external view returns (uint72) {
        if (this.commitV1U1Exists(commitId)) {
            return storageV1U1.getEpochStateCommitSubmissionPrevIdentityId(commitId);
        } else {
            return storageV1.getCommitSubmissionPrevIdentityId(commitId);
        }
    }

    function setCommitSubmissionPrevIdentityId(bytes32 commitId, uint72 prevIdentityId) external onlyContracts {
        if (this.commitV1U1Exists(commitId)) {
            storageV1U1.setEpochStateCommitSubmissionPrevIdentityId(commitId, prevIdentityId);
        } else {
            storageV1.setCommitSubmissionPrevIdentityId(commitId, prevIdentityId);
        }
    }

    function getCommitSubmissionNextIdentityId(bytes32 commitId) external view returns (uint72) {
        if (this.commitV1U1Exists(commitId)) {
            return storageV1U1.getEpochStateCommitSubmissionNextIdentityId(commitId);
        } else {
            return storageV1.getCommitSubmissionNextIdentityId(commitId);
        }
    }

    function setCommitSubmissionNextIdentityId(bytes32 commitId, uint72 nextIdentityId) external onlyContracts {
        if (this.commitV1U1Exists(commitId)) {
            storageV1U1.setEpochStateCommitSubmissionNextIdentityId(commitId, nextIdentityId);
        } else {
            storageV1.setCommitSubmissionNextIdentityId(commitId, nextIdentityId);
        }
    }

    function getCommitSubmissionScore(bytes32 commitId) external view returns (uint40) {
        if (this.commitV1U1Exists(commitId)) {
            return storageV1U1.getEpochStateCommitSubmissionScore(commitId);
        } else {
            return storageV1.getCommitSubmissionScore(commitId);
        }
    }

    function setCommitSubmissionScore(bytes32 commitId, uint40 score) external onlyContracts {
        if (this.commitV1U1Exists(commitId)) {
            storageV1U1.setEpochStateCommitSubmissionScore(commitId, score);
        } else {
            storageV1.setCommitSubmissionScore(commitId, score);
        }
    }

    function commitSubmissionExists(bytes32 commitId) external view returns (bool) {
        if (this.commitV1U1Exists(commitId)) {
            return storageV1U1.epochStateCommitSubmissionExists(commitId);
        } else {
            return storageV1.commitSubmissionExists(commitId);
        }
    }

    function incrementCommitsCount(bytes32 epochStateId) external onlyContracts {
        storageV1U1.incrementEpochStateCommitsCount(epochStateId);
    }

    function decrementCommitsCount(bytes32 epochStateId) external onlyContracts {
        storageV1U1.decrementEpochStateCommitsCount(epochStateId);
    }

    function getCommitsCount(bytes32 epochStateId) external view returns (uint8) {
        return storageV1U1.getEpochStateCommitsCount(epochStateId);
    }

    function setCommitsCount(bytes32 epochStateId, uint8 epochStateCommitsCount) external onlyContracts {
        storageV1U1.setEpochStateCommitsCount(epochStateId, epochStateCommitsCount);
    }

    function deleteCommitsCount(bytes32 epochStateId) external onlyContracts {
        storageV1U1.deleteEpochStateCommitsCount(epochStateId);
    }

    function getUpdateCommitsDeadline(bytes32 stateId) external view returns (uint256) {
        return storageV1U1.getUpdateCommitsDeadline(stateId);
    }

    function setUpdateCommitsDeadline(bytes32 stateId, uint256 deadline) external onlyContracts {
        storageV1U1.setUpdateCommitsDeadline(stateId, deadline);
    }

    function deleteUpdateCommitsDeadline(bytes32 stateId) external onlyContracts {
        storageV1U1.deleteUpdateCommitsDeadline(stateId);
    }

    function transferAgreementTokens(bytes32 agreementId, address receiver, uint96 tokenAmount) external onlyContracts {
        if (this.agreementV1Exists(agreementId)) {
            storageV1.transferAgreementTokens(receiver, tokenAmount);
        } else {
            storageV1U1.transferAgreementTokens(receiver, tokenAmount);
        }
    }

    function transferV1AgreementTokens(address receiver, uint96 tokenAmount) external onlyContracts {
        storageV1.transferAgreementTokens(receiver, tokenAmount);
    }

    function transferV1U1AgreementTokens(address receiver, uint96 tokenAmount) external onlyContracts {
        storageV1U1.transferAgreementTokens(receiver, tokenAmount);
    }

    function agreementV1Exists(bytes32 agreementId) external view returns (bool) {
        return storageV1.serviceAgreementExists(agreementId);
    }

    function agreementV1U1Exists(bytes32 agreementId) external view returns (bool) {
        return storageV1U1.serviceAgreementExists(agreementId);
    }

    function serviceAgreementExists(bytes32 agreementId) external view returns (bool) {
        return storageV1.serviceAgreementExists(agreementId) || storageV1U1.serviceAgreementExists(agreementId);
    }

    function commitV1Exists(bytes32 commitId) external view returns (bool) {
        return storageV1.commitSubmissionExists(commitId);
    }

    function commitV1U1Exists(bytes32 commitId) external view returns (bool) {
        return storageV1U1.epochStateCommitSubmissionExists(commitId);
    }

    function agreementV1StorageAddress() external view returns (address) {
        return address(storageV1);
    }

    function agreementV1U1StorageAddress() external view returns (address) {
        return address(storageV1U1);
    }
}
