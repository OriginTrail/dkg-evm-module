// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import {Hub} from "../Hub.sol";
import {ServiceAgreementStorageV1} from "./ServiceAgreementStorageV1.sol";
import {ServiceAgreementStorageV1_1} from "./ServiceAgreementStorageV1_1.sol";
import {ServiceAgreementStructsV1} from "../structs/ServiceAgreementStructsV1.sol";
import {Named} from "../interface/Named.sol";
import {Versioned} from "../interface/Versioned.sol";
import {GeneralErrors} from "../errors/GeneralErrors.sol";


contract ServiceAgreementStorageProxy is Named, Versioned {
    string private constant _NAME = "ServiceAgreementStorageProxy";
    string private constant _VERSION = "1.0.0";

    Hub public hub;
    ServiceAgreementStorageV1 public storageV1;
    ServiceAgreementStorageV1_1 public storageV1_1;

    constructor(address hubAddress) {
        require(hubAddress != address(0), "Hub Address cannot be 0x0");

        hub = Hub(hubAddress);
    }

    modifier onlyHubOwner() {
        _checkHubOwner();
        _;
    }

    modifier onlyContracts() {
        _checkHub();
        _;
    }

    function initialize() public onlyHubOwner {
        storageV1 = ServiceAgreementStorageV1(hub.getContractAddress("ServiceAgreementStorageV1"));
        storageV1_1 = ServiceAgreementStorageV1_1(hub.getContractAddress("ServiceAgreementStorageV1_1"));
    }

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function createServiceAgreementObject(
        bytes32 agreementId,
        uint16 epochsNumber,
        uint128 epochLength,
        uint96 tokenAmount,
        uint8 scoreFunctionId,
        uint8 proofWindowOffsetPerc
    ) external onlyContracts {
        storageV1_1.createServiceAgreementObject(
            agreementId,
            epochsNumber,
            epochLength,
            tokenAmount,
            scoreFunctionId,
            proofWindowOffsetPerc
        );
    }

    function deleteAgreement(bytes32 agreementId) external onlyContracts {
        if (this.isOldAgreement(agreementId)) {
            storageV1.deleteServiceAgreementObject(agreementId);
        } else {
            storageV1_1.deleteServiceAgreementObject(agreementId);
        }
    }

    function getAgreementData(
        bytes32 agreementId
    ) external view returns (uint256, uint16, uint128, uint96[2] memory, uint8[2] memory, bytes32) {
        if (this.isOldAgreement(agreementId)) {
            uint256 arg1;
            uint16 arg2;
            uint128 arg3;
            uint96 arg4;
            uint8[2] memory arg5;
            (arg1, arg2, arg3, arg4, arg5) = storageV1.getAgreementData(agreementId);
            return (arg1, arg2, arg3, [arg4, 0], arg5, bytes32(""));
        } else {
            return storageV1_1.getAgreementData(agreementId);
        }
    }

    function getAgreementStartTime(bytes32 agreementId) external view returns (uint256) {
        if (this.isOldAgreement(agreementId)) {
            return storageV1.getAgreementStartTime(agreementId);
        } else {
            return storageV1_1.getAgreementStartTime(agreementId);
        }
    }

    function setAgreementStartTime(bytes32 agreementId, uint256 startTime) external onlyContracts {
        if (this.isOldAgreement(agreementId)) {
            storageV1.setAgreementStartTime(agreementId, startTime);
        } else {
            storageV1_1.setAgreementStartTime(agreementId, startTime);
        }
    }

    function getAgreementEpochsNumber(bytes32 agreementId) external view returns (uint16) {
        if (this.isOldAgreement(agreementId)) {
            return storageV1.getAgreementEpochsNumber(agreementId);
        } else {
            return storageV1_1.getAgreementEpochsNumber(agreementId);
        }
    }

    function setAgreementEpochsNumber(bytes32 agreementId, uint16 epochsNumber) external onlyContracts {
        if (this.isOldAgreement(agreementId)) {
            storageV1.setAgreementEpochsNumber(agreementId, epochsNumber);
        } else {
            storageV1_1.setAgreementEpochsNumber(agreementId, epochsNumber);
        }
    }

    function getAgreementEpochLength(bytes32 agreementId) external view returns (uint128) {
        if (this.isOldAgreement(agreementId)) {
            return storageV1.getAgreementEpochLength(agreementId);
        } else {
            return storageV1_1.getAgreementEpochLength(agreementId);
        }
    }

    function setAgreementEpochLength(bytes32 agreementId, uint128 epochLength) external onlyContracts {
        if (this.isOldAgreement(agreementId)) {
            storageV1.setAgreementEpochLength(agreementId, epochLength);
        } else {
            storageV1_1.setAgreementEpochLength(agreementId, epochLength);
        }
    }

    function getAgreementTokenAmount(bytes32 agreementId) external view returns (uint96) {
        if (this.isOldAgreement(agreementId)) {
            return storageV1.getAgreementTokenAmount(agreementId);
        } else {
            return storageV1_1.getAgreementTokenAmount(agreementId);
        }
    }

    function setAgreementTokenAmount(bytes32 agreementId, uint96 tokenAmount) external onlyContracts {
        if (this.isOldAgreement(agreementId)) {
            storageV1.setAgreementTokenAmount(agreementId, tokenAmount);
        } else {
            storageV1_1.setAgreementTokenAmount(agreementId, tokenAmount);
        }
    }

    function getAddedTokenAmount(bytes32 agreementId) external view returns (uint96) {
        if (this.isOldAgreement(agreementId)) {
            return 0;
        } else {
            return storageV1_1.getAddedTokenAmount(agreementId);
        }
    }

    function setAddedTokenAmount(bytes32 agreementId, uint96 addedTokenAmount) external onlyContracts {
        storageV1_1.setAgreementTokenAmount(agreementId, addedTokenAmount);
    }

    function getAgreementScoreFunctionId(bytes32 agreementId) external view returns (uint8) {
        if (this.isOldAgreement(agreementId)) {
            return storageV1.getAgreementScoreFunctionId(agreementId);
        } else {
            return storageV1_1.getAgreementScoreFunctionId(agreementId);
        }
    }

    function setAgreementScoreFunctionId(bytes32 agreementId, uint8 newScoreFunctionId) external onlyContracts {
        if (this.isOldAgreement(agreementId)) {
            storageV1.setAgreementScoreFunctionId(agreementId, newScoreFunctionId);
        } else {
            storageV1_1.setAgreementScoreFunctionId(agreementId, newScoreFunctionId);
        }
    }

    function getAgreementProofWindowOffsetPerc(bytes32 agreementId) external view returns (uint8) {
        if (this.isOldAgreement(agreementId)) {
            return storageV1.getAgreementProofWindowOffsetPerc(agreementId);
        } else {
            return storageV1_1.getAgreementProofWindowOffsetPerc(agreementId);
        }
    }

    function setAgreementProofWindowOffsetPerc(
        bytes32 agreementId,
        uint8 proofWindowOffsetPerc
    ) external onlyContracts {
        if (this.isOldAgreement(agreementId)) {
            storageV1.setAgreementProofWindowOffsetPerc(agreementId, proofWindowOffsetPerc);
        } else {
            storageV1_1.setAgreementProofWindowOffsetPerc(agreementId, proofWindowOffsetPerc);
        }
    }

    function getAgreementLatestFinalizedState(bytes32 agreementId) external view returns (bytes32) {
        if (this.isOldAgreement(agreementId)) {
            return bytes32("");
        } else {
            return storageV1_1.getAgreementLatestFinalizedState(agreementId);
        }
    }

    function setAgreementLatestFinalizedState(
        bytes32 agreementId, bytes32 latestFinalizedState
    ) external onlyContracts {
        storageV1_1.setAgreementLatestFinalizedState(agreementId, latestFinalizedState);
    }

    function isStateFinalized(bytes32 agreementId, bytes32 state) external view returns (bool) {
        return storageV1_1.isStateFinalized(agreementId, state);
    }

    function getAgreementEpochSubmissionHead(
        bytes32 agreementId,
        uint16 epoch,
        bytes32 assertionId
    ) external view returns (bytes32) {
        if (this.isOldAgreement(agreementId)) {
            return storageV1.getAgreementEpochSubmissionHead(agreementId, epoch);
        } else {
            return storageV1_1.getAgreementEpochSubmissionHead(agreementId, epoch, assertionId);
        }
    }


    function setAgreementEpochSubmissionHead(
        bytes32 agreementId,
        uint16 epoch,
        bytes32 assertionId,
        bytes32 headCommitId
    ) external onlyContracts {
        if (this.isOldAgreement(agreementId)) {
            storageV1.setAgreementEpochSubmissionHead(agreementId, epoch, headCommitId);
        } else {
            storageV1_1.setAgreementEpochSubmissionHead(agreementId, epoch, assertionId, headCommitId);
        }
    }

    function incrementAgreementRewardedNodesNumber(bytes32 agreementId, uint16 epoch) external onlyContracts {
        if (this.isOldAgreement(agreementId)) {
            storageV1.incrementAgreementRewardedNodesNumber(agreementId, epoch);
        } else {
            storageV1_1.incrementAgreementRewardedNodesNumber(agreementId, epoch);
        }
    }

    function decrementAgreementRewardedNodesNumber(bytes32 agreementId, uint16 epoch) external onlyContracts {
        if (this.isOldAgreement(agreementId)) {
            storageV1.decrementAgreementRewardedNodesNumber(agreementId, epoch);
        } else {
            storageV1_1.decrementAgreementRewardedNodesNumber(agreementId, epoch);
        }
    }

    function getAgreementRewardedNodesNumber(bytes32 agreementId, uint16 epoch) external view returns (uint32) {
        if (this.isOldAgreement(agreementId)) {
            return storageV1.getAgreementRewardedNodesNumber(agreementId, epoch);
        } else {
            return storageV1_1.getAgreementRewardedNodesNumber(agreementId, epoch);
        }
    }

    function setAgreementRewardedNodesNumber(
        bytes32 agreementId,
        uint16 epoch,
        uint32 rewardedNodesNumber
    ) external onlyContracts {
        if (this.isOldAgreement(agreementId)) {
            storageV1.setAgreementRewardedNodesNumber(agreementId, epoch, rewardedNodesNumber);
        } else {
            storageV1_1.setAgreementRewardedNodesNumber(agreementId, epoch, rewardedNodesNumber);
        }
    }

    function serviceAgreementExists(bytes32 agreementId) external view returns (bool) {
        return (storageV1.serviceAgreementExists(agreementId)) || (storageV1_1.serviceAgreementExists(agreementId));
    }

    function createCommitSubmissionObject(
        bytes32 commitId,
        uint72 identityId,
        uint72 prevIdentityId,
        uint72 nextIdentityId,
        uint40 score
    ) external onlyContracts {
        storageV1_1.createCommitSubmissionObject(commitId, identityId, prevIdentityId, nextIdentityId, score);
    }

    function deleteCommitSubmissionsObject(bytes32 commitId) external onlyContracts {
        if (this.isOldCommit(commitId)) {
            storageV1.deleteCommitSubmissionsObject(commitId);
        } else {
            storageV1_1.deleteCommitSubmissionsObject(commitId);
        }
    }

    function getCommitSubmission(
        bytes32 commitId
    ) external view returns (ServiceAgreementStructsV1.CommitSubmission memory) {
        if (this.isOldCommit(commitId)) {
            return storageV1.getCommitSubmission(commitId);
        } else {
            return storageV1_1.getCommitSubmission(commitId);
        }
    }

    function getCommitSubmissionIdentityId(bytes32 commitId) external view returns (uint72) {
        if (this.isOldCommit(commitId)) {
            return storageV1.getCommitSubmissionIdentityId(commitId);
        } else {
            return storageV1_1.getCommitSubmissionIdentityId(commitId);
        }
    }

    function setCommitSubmissionIdentityId(bytes32 commitId, uint72 identityId) external onlyContracts {
        if (this.isOldCommit(commitId)) {
            storageV1.setCommitSubmissionIdentityId(commitId, identityId);
        } else {
            storageV1_1.setCommitSubmissionIdentityId(commitId, identityId);
        }
    }

    function getCommitSubmissionPrevIdentityId(bytes32 commitId) external view returns (uint72) {
        if (this.isOldCommit(commitId)) {
            return storageV1.getCommitSubmissionPrevIdentityId(commitId);
        } else {
            return storageV1_1.getCommitSubmissionPrevIdentityId(commitId);
        }
    }

    function setCommitSubmissionPrevIdentityId(bytes32 commitId, uint72 prevIdentityId) external onlyContracts {
        if (this.isOldCommit(commitId)) {
            storageV1.setCommitSubmissionPrevIdentityId(commitId, prevIdentityId);
        } else {
            storageV1_1.setCommitSubmissionPrevIdentityId(commitId, prevIdentityId);
        }
    }

    function getCommitSubmissionNextIdentityId(bytes32 commitId) external view returns (uint72) {
        if (this.isOldCommit(commitId)) {
            return storageV1.getCommitSubmissionNextIdentityId(commitId);
        } else {
            return storageV1_1.getCommitSubmissionNextIdentityId(commitId);
        }
    }

    function setCommitSubmissionNextIdentityId(bytes32 commitId, uint72 nextIdentityId) external onlyContracts {
        if (this.isOldCommit(commitId)) {
            storageV1.setCommitSubmissionNextIdentityId(commitId, nextIdentityId);
        } else {
            storageV1_1.setCommitSubmissionNextIdentityId(commitId, nextIdentityId);
        }
    }

    function getCommitSubmissionScore(bytes32 commitId) external view returns (uint40) {
        if (this.isOldCommit(commitId)) {
            return storageV1.getCommitSubmissionScore(commitId);
        } else {
            return storageV1_1.getCommitSubmissionScore(commitId);
        }
    }

    function setCommitSubmissionScore(bytes32 commitId, uint40 score) external onlyContracts {
        if (this.isOldCommit(commitId)) {
            storageV1.setCommitSubmissionScore(commitId, score);
        } else {
            storageV1_1.setCommitSubmissionScore(commitId, score);
        }
    }

    function commitSubmissionExists(bytes32 commitId) external view returns (bool) {
        if (this.isOldCommit(commitId)) {
            return storageV1.commitSubmissionExists(commitId);
        } else {
            return storageV1_1.commitSubmissionExists(commitId);
        }
    }

    function getCommitDeadline(bytes32 stateId) external view returns (uint256) {
        return storageV1_1.getCommitDeadline(stateId);
    }

    function setCommitDeadline(bytes32 stateId, uint256 deadline) external onlyContracts {
        storageV1_1.setCommitDeadline(stateId, deadline);
    }

    function transferAgreementTokens(address receiver, uint96 tokenAmount) external onlyContracts {
        storageV1_1.transferAgreementTokens(receiver, tokenAmount);
    }

    function isOldAgreement(bytes32 agreementId) external view returns (bool) {
        return storageV1.serviceAgreementExists(agreementId) && !storageV1_1.serviceAgreementExists(agreementId);
    }

    function isNewAgreement(bytes32 agreementId) external view returns (bool) {
        return !storageV1.serviceAgreementExists(agreementId) && storageV1_1.serviceAgreementExists(agreementId);
    }

    function isOldCommit(bytes32 commitId) external view returns (bool) {
        return storageV1.commitSubmissionExists(commitId) && !storageV1_1.commitSubmissionExists(commitId);
    }

    function isNewCommit(bytes32 commitId) external view returns (bool) {
        return !storageV1.commitSubmissionExists(commitId) && storageV1_1.commitSubmissionExists(commitId);
    }

    function lastestStorageAddress() external view returns (address) {
        return address(storageV1_1);
    }


    function _checkHubOwner() internal view virtual {
        if (msg.sender != hub.owner()) revert GeneralErrors.OnlyHubOwnerFunction(msg.sender);
    }

    function _checkHub() internal view virtual {
        require(hub.isContract(msg.sender), "Fn can only be called by the hub");
    }
}
