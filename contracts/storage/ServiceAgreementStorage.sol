// SPDX-License-Identifier: MIT

pragma solidity^0.8.0;

import { Hub } from '../Hub.sol';
import { ProfileStorage } from './ProfileStorage.sol';


contract ServiceAgreementStorage {
    struct CommitSubmission {
        uint96 identityId;
        uint96 nextIdentity;
        uint32 score;  // We can reset it to 0 if reward is already collected? (Instead of having isAlreadyRewarded boolean)
        bool isAlreadyRewarded;
    }

    struct ServiceAgreement {
        uint256 startTime;
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

    function createServiceAgreement(uint256 UAI, bytes32 key, uint8 hashingAlgorithm, uint32 tokenAmount)
        public
    {
        ServiceAgreement memory agreement = ServiceAgreement({
            startTime: block.timestamp,
            proofWindowOffset: 90 + _generatePseudorandomUint8(9),
            tokenAmount: tokenAmount
        });

        bytes32 agreementId = _generateAgreementId(UAI, key, hashingAlgorithm);

        serviceAgreements[agreementId] = agreement;
    }

    function isCommitWindowOpen(uint256 UAI, uint256 epoch)
        public
        returns (bool)
    {
        uint256 timeNow = block.timestamp;
        ServiceAgreement memory agreement = serviceAgreements[UAI];

        return (timeNow > agreement.startTime && timeNow < (agreement.startTime + commitWindowDuration));
    }

    function getCommits(uint256 UAI, bytes32 key, uint8 hashingAlgorithm, uint256 epoch)
        public
        returns (CommitSubmission[] memory)
    {
        CommitSubmission[] epochCommits = new CommitSubmission[](R2);

        bytes32 agreementId = _generateAgreementId(UAI, key, hashingAlgorithm);
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

    // function submitCommit(uint256 UAI, bytes32 key, uint256 epoch, uint96 insertAfter)
    //     public
    // {
    //     require(isCommitWindowOpen(UAI, epoch), "Commit window is closed!");

    //     ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));

    //     bytes32 nodeId = profileStorage.getNodeId(insertAfter);
    // }

    function _generateAgreementId(uint256 UAI, bytes32 key, uint8 hashingAlgorithm)
        internal
        returns (bytes32)
    {
        HashingRegistry hashingRegistry = HashingRegistry(hub.getContractAddress("HashingRegistry"));
        return hashingRegistry.callHashFunction(hashingAlgorithm, abi.encodePacked(UAI, key));
    }

    function _calculateScore(bytes32 nodeIdHash, uint32 stake)
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
