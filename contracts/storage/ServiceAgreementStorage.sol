// SPDX-License-Identifier: MIT

pragma solidity^0.8.0;

import { Hub } from '../Hub.sol';
import { ProfileStorage } from './ProfileStorage.sol';


contract ServiceAgreementStorage {
    struct CommitSubmission {
        uint96 identityId;
        uint96 nextIdentity;
        uint32 score;  // Reset to 0 if reward is already collected
    }

    struct ServiceAgreement {
        uint256 startTime;
        uint16 epochsNum;
        uint200 epochLength;
        uint32 tokenAmount;
        uint8 proofWindowOffset;
        mapping(uint8 => bytes32) epochSubmissionHeads;
    }

    Hub public hub;

    uint8 public R2;
    uint16 public commitWindowDuration;  // In minutes or % of the epoch?
    uint8 public proofWindowDuration;  // In % of the epoch
    uint8 public replacementWindowDuration;  // In % of the epoch

    // "list-head" => CommitSubmission
    mapping(bytes32 => CommitSubmission) commitSubmissions;

    // hash(asset type contract + UAI + key) -> ServiceAgreement
    mapping(bytes32 => ServiceAgreement) serviceAgreements;

    constructor (address hubAddress) {
        require(hubAddress != address(0));
        hub = Hub(hubAddress);

        R2 = 20;
        commitWindowDuration = 15 minutes;
        proofWindowDuration = 1;
        replacementWindowDuration = 1;
    }

    function createServiceAgreement(uint256 UAI, bytes32 keyword, uint8 hashingAlgorithm, uint16 epochsNum, uint200 epochLength, uint32 tokenAmount)
        public
    {
        ServiceAgreement memory agreement = ServiceAgreement({
            startTime: block.timestamp,
            epochsNum: epochsNum,
            epochLength: epochLength,
            proofWindowOffset: 90 + _generatePseudorandomUint8(9),
            tokenAmount: tokenAmount
        });

        bytes32 agreementId = _generateAgreementId(UAI, keyword, hashingAlgorithm);

        serviceAgreements[agreementId] = agreement;
    }

    function isCommitWindowOpen(bytes32 agreementId, uint8 epoch)
        public
        returns (bool)
    {
        uint256 timeNow = block.timestamp;
        ServiceAgreement memory agreement = serviceAgreements[agreementId];

        return (
            timeNow > (agreement.startTime + epoch * agreement.epochLength) &&
            timeNow < (agreement.startTime + epoch * agreement.epochLength + commitWindowDuration)
        );
    }

    function getCommitSubmissions(bytes32 agreementId, uint8 epoch)
        public
        returns (CommitSubmission[] memory)
    {
        CommitSubmission[] epochCommits = new CommitSubmission[](R2);

        bytes32 epochSubmissionsHead = serviceAgreements[agreementId].epochSubmissionHeads[epoch];

        uint8 submissionsIdx = 0;

        epochCommits[submissionsIdx] = commitSubmissions[epochSubmissionsHead];

        uint96 nextIdentityId = commitSubmissions[epochSubmissionsHead].nextIdentity;
        while(nextIdentityId != 0) {
            bytes32 commitId = keccak256(abi.encodePacked(epoch, nextIdentityId));

            CommitSubmission memory commit = commitSubmissions[commitId];
            submissionsIdx++;
            epochCommits[submissionsIdx] = commit;

            nextIdentityId = commit.nextIdentity;
        }

        return epochCommits;
    }

    function submitCommit(bytes32 agreementId, uint8 epoch, uint96 prevIdentityId)
        public
    {
        require(isCommitWindowOpen(agreementId, epoch), "Commit window is closed!");

        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        uint96 identityId = profileStorage.getIdentityId(msg.sender);
        bytes32 nodeId = profileStorage.getNodeId(identityId);
        uint32 stake = profileStorage.getStake(identityId);

        uint32 score = _calculateScore(nodeId, stake);

        insertCommitAfter(
            agreementId,
            epoch,
            prevIdentityId,
            CommitSubmission({
                identityId: identityId,
                nextIdentity: 0,
                score: score
            })
        );
    }

    function insertCommitAfter(bytes32 agreementId, uint8 epoch, uint96 prevIdentityId, CommitSubmission memory commit)
        public
    {
        bytes32 commitId = keccak256(abi.encodePacked(epoch, commit.identityId));

        // Replacing head
        if (prevIdentityId == 0) {
            bytes32 epochSubmissionsHead = serviceAgreements[agreementId].epochSubmissionHeads[epoch];

            uint96 prevHeadIdentityId = 0;
            if(epochSubmissionsHead != "") {
                CommitSubmission commitHead = commitSubmissions[epochSubmissionsHead];
                prevHeadIdentityId = commitHead.identityId;

                require(
                    commit.score > commitHead,
                    "Score of the commit must be higher that the score of the head in order to replace it!"
                );
            }

            serviceAgreements[agreementId].epochSubmissionHeads[epoch] = commitId;
            commitSubmissions[commitId] = commit;
            _link_commits(commit.identityId, prevHeadIdentityId);
        }
        else {
            bytes32 prevCommitId = keccak256(abi.encodePacked(epoch, prevIdentityId));
            CommitSubmission memory prevCommit = commitSubmissions[prevCommitId];

            require(
                commit.score <= prevCommit.score,
                "Score of the commit must be less or equal to the one you want insert after!"
            );

            uint96 nextIdentityId = prevCommit.nextIdentity;
            if (nextIdentityId != 0) {
                bytes32 nextCommitId = keccak256(abi.encodePacked(epoch, nextIdentityId));
                CommitSubmission memory nextCommit = commitSubmissions[nextCommitId];

                require(
                    commit.score >= nextCommit.score,
                    "Score of the commit must be greater or equal to the one you want insert before!"
                );
            }

            commitSubmissions[commitId] = commit;
            _link_commits(prevIdentityId, commit.identityId);
            _link_commits(commit.identityId, nextIdentityId);
        }
    }

    function _link_commits(uint8 epoch, uint96 leftIdentityId, uint96 rightIdentityId)
        internal
    {
        bytes32 leftCommitId = keccak256(abi.encodePacked(epoch, leftIdentityId));
        commitSubmissions[leftCommitId].nextIdentity = rightIdentityId;
    }

    function _generateAgreementId(uint256 UAI, bytes32 keyword, uint8 hashingAlgorithm)
        internal
        returns (bytes32)
    {
        HashingRegistry hashingRegistry = HashingRegistry(hub.getContractAddress("HashingRegistry"));
        return hashingRegistry.callHashFunction(hashingAlgorithm, abi.encodePacked(UAI, keyword));
    }

    function _calculateScore(bytes32 nodeId, uint32 stake)
        internal
        returns (uint32)
    {

    }

    function _generatePseudorandomUint8(uint8 limit)
        internal
        returns (uint8)
    {
        return uint8(keccak256(abi.encodePacked(block.timestamp, msg.sender, block.number))) % limit;
    }
}
