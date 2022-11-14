// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { AbstractAsset } from "../assets/AbstractAsset.sol";
import { AssertionRegistry } from "../AssertionRegistry.sol";
import { HashingProxy } from "../HashingProxy.sol";
import { Hub } from "../Hub.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { MerkleProof } from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import { ParametersStorage } from "./ParametersStorage.sol";
import { ProfileStorage } from "./ProfileStorage.sol";
import { ScoringProxy } from "../ScoringProxy.sol";
import { ShardingTable } from "../ShardingTable.sol";

contract ServiceAgreementStorage {
    struct CommitSubmission {
        uint96 identityId;
        uint96 nextIdentity;
        uint32 score;
    }

    struct ServiceAgreement {
        uint256 startTime;
        uint16 epochsNum;
        uint128 epochLength;
        uint96 tokenAmount;
        uint8 scoringFunctionId;
        uint8 proofWindowOffsetPerc;  // Perc == In % of the epoch
        mapping(uint8 => bytes32) epochSubmissionHeads;  // epoch => headCommitId
    }

    Hub public hub;

    // CommitId [keccak256(agreementId + epoch + identityId)] => CommitSubmission
    mapping(bytes32 => CommitSubmission) commitSubmissions;

    // hash(asset type contract + tokenId + key) -> ServiceAgreement
    mapping(bytes32 => ServiceAgreement) public serviceAgreements;

    constructor (address hubAddress) {
        require(hubAddress != address(0));
        hub = Hub(hubAddress);
    }

    modifier onlyAssetTypeContracts() {
        require (
            // TODO: Add function to the hub
            hub.isAssetTypeContract(msg.sender),
            "Function can only be called by Asset Type Contracts!"
        );
        _;
    }

    function createServiceAgreement(
        address operationalWallet,
        address assetTypeContract,
        uint256 tokenId,
        bytes keyword,
        uint8 hashingAlgorithm,
        uint16 epochsNum,
        uint96 tokenAmount,
        uint8 scoringFunctionId
    )
        public
        onlyAssetTypeContracts
    {
        IERC20 tokenContract = IERC20(hub.getContractAddress("Token"));
        require(
            tokenContract.allowance(operationalWallet, address(this)) >= tokenAmount,
            "Sender allowance must be equal to or higher than chosen amount!"
        );
        require(
            tokenContract.balanceOf(operationalWallet) >= tokenAmount,
            "Sender balance must be equal to or higher than chosen amount!"
        );

        tokenContract.transferFrom(operationalWallet, address(this), tokenAmount);

        ParametersStorage parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));
        uint8 minProofWindowOfssetPerc = parametersStorage.minProofWindowOfssetPerc();
        uint8 maxProofWindowOffsetPerc = parametersStorage.maxProofWindowOffsetPerc();

        ServiceAgreement memory agreement = ServiceAgreement({
            startTime: block.timestamp,
            epochsNum: epochsNum,
            epochLength: parametersStorage.epochLength(),
            proofWindowOffsetPerc: minProofWindowOfssetPerc + _generatePseudorandomUint8(
                operationalWallet,
                maxProofWindowOfssetPerc - minProofWindowOfssetPerc + 1
            ),
            tokenAmount: tokenAmount,
            scoringFunctionId: scoringFunctionId
        });

        bytes32 agreementId = _generateAgreementId(assetTypeContract, tokenId, keyword, hashingAlgorithm);

        serviceAgreements[agreementId] = agreement;
    }

    function updateServiceAgreement(
        address operationalWallet,
        address assetTypeContract,
        uint256 tokenId,
        bytes keyword,
        uint8 hashingAlgorithm,
        uint16 epochsNum,
        uint96 tokenAmount
    )
        public
        onlyAssetTypeContracts
    {
        IERC20 tokenContract = IERC20(hub.getContractAddress("Token"));
        require(
            tokenContract.allowance(operationalWallet, address(this)) >= tokenAmount,
            "Sender allowance must be equal to or higher than chosen amount!"
        );
        require(
            tokenContract.balanceOf(operationalWallet) >= tokenAmount,
            "Sender balance must be equal to or higher than chosen amount!"
        );

        tokenContract.transferFrom(operationalWallet, address(this), tokenAmount);

        bytes32 agreementId = _generateAgreementId(assetTypeContract, tokenId, keyword, hashingAlgorithm);

        serviceAgreements[agreementId].epochsNum += epochsNum;
        serviceAgreements[agreementId].tokenAmount += tokenAmount;
    }

    function isCommitWindowOpen(bytes32 agreementId, uint16 epoch)
        public
        returns (bool)
    {
        uint256 timeNow = block.timestamp;
        ServiceAgreement memory agreement = serviceAgreements[agreementId];

        ParametersStorage parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));

        return (
            timeNow > (agreement.startTime + epoch * agreement.epochLength) &&
            timeNow < (agreement.startTime + epoch * agreement.epochLength + parametersStorage.commitWindowDuration())
        );
    }

    function getCommitSubmissions(bytes32 agreementId, uint16 epoch)
        public
        returns (CommitSubmission[] memory)
    {
        ParametersStorage parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));
        CommitSubmission[] epochCommits = new CommitSubmission[](parametersStorage.R2());

        bytes32 epochSubmissionsHead = serviceAgreements[agreementId].epochSubmissionHeads[epoch];

        uint8 submissionsIdx = 0;

        epochCommits[submissionsIdx] = commitSubmissions[epochSubmissionsHead];

        uint96 nextIdentityId = commitSubmissions[epochSubmissionsHead].nextIdentity;
        while(nextIdentityId != 0) {
            // VERIFY: Is keccak256(agreementId + epoch + identityId) a good key?
            bytes32 commitId = keccak256(abi.encodePacked(agreementId, epoch, nextIdentityId));

            CommitSubmission memory commit = commitSubmissions[commitId];
            submissionsIdx++;
            epochCommits[submissionsIdx] = commit;

            nextIdentityId = commit.nextIdentity;
        }

        return epochCommits;
    }

    function submitCommit(
        address assetTypeContract,
        uint256 tokenId,
        bytes keyword,
        uint8 hashingAlgorithm,
        uint16 epoch,
        uint96 prevIdentityId
    )
        public
        returns (uint256)
    {
        bytes32 agreementId = _generateAgreementId(assetTypeContract, tokenId, keyword, hashingAlgorithm);

        require(isCommitWindowOpen(agreementId, epoch), "Commit window is closed!");

        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        uint96 identityId = profileStorage.getIdentityId(msg.sender);
        bytes nodeId = profileStorage.getNodeId(identityId);
        uint32 stake = profileStorage.getStake(identityId);

        ScoringProxy scoringProxy = ScoringProxy(hub.getContractAddress("ScoringProxy"));
        uint32 score = scoringProxy.calculateScore(
            serviceAgreements[agreementId].scoringFunctionId,
            hashingAlgorithm,
            nodeId,
            keyword,
            stake
        );

        _insertCommitAfter(
            agreementId,
            epoch,
            prevIdentityId,
            CommitSubmission({
                identityId: identityId,
                nextIdentity: 0,
                score: score
            })
        );

        ParametersStorage parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));
        uint256 epochLength = parametersStorage.epochLength();
        // Returns start time of the proof phase
        return (
            serviceAgreements[agreementId].startTime +
            epochLength * (epoch - 1) +
            epochLength * serviceAgreements[agreementId].proofWindowOffsetPerc / 100
        );
    }

    function isProofWindowOpen(bytes32 agreementId, uint16 epoch)
        public
        returns (bool)
    {
        uint256 timeNow = block.timestamp;
        ServiceAgreement memory agreement = serviceAgreements[agreementId];

        ParametersStorage parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));

        uint256 proofWindowOffset = agreement.epochLength * agreement.epochsNum * agreement.proofWindowOffsetPerc / 100;
        uint256 proofWindowDuration = agreement.epochLength * agreement.epochsNum * parametersStorage.proofWindowDurationPerc() / 100;

        return (
            timeNow > (agreement.startTime + proofWindowOffset) &&
            timeNow < (agreement.startTime + proofWindowOffset + proofWindowDuration)
        );
    }

    function getChallenge(address assetTypeContract, uint256 tokenId, bytes keyword, uint8 hashingAlgorithm)
        public
        returns (bytes32, uint256)
    {
        bytes32 agreementId = _generateAgreementId(assetTypeContract, tokenId, keyword, hashingAlgorithm);

        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        uint96 identityId = profileStorage.getIdentityId(msg.sender);

        AbstractAsset generalAssetInterface = AbstractAsset(assetTypeContract);
        bytes32 assertionId = generalAssetInterface.getLatestAssertionId(tokenId);

        AssertionRegistry assertionRegistry = AssertionRegistry(hub.getContractAddress("AssertionRegistry"));
        uint256 assertionSize = assertionRegistry.getSize(assertionId);

        // blockchash() function only works for last 256 blocks (25.6 min window in case of 6s block time)
        // TODO: figure out how to achieve randomness
        return (
            assertionId,
            uint256(sha256(abi.encodePacked(serviceAgreements[agreementId].proofWindowOffsetPerc, identityId))) % assertionSize
        );
    }

    function sendProof(
        address assetTypeContract,
        uint256 tokenId,
        bytes keyword,
        uint8 hashingAlgorithm,
        uint16 epoch,
        bytes32[] memory proof,
        bytes32 chunkHash
    )
        public
    {
        bytes32 agreementId = _generateAgreementId(assetTypeContract, tokenId, keyword, hashingAlgorithm);
        require(!isProofWindowOpen(agreementId, epoch), "Proof window is open!");

        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        uint96 identityId = profileStorage.getIdentityId(msg.sender);
        bytes32 commitId = keccak256(abi.encodePacked(agreementId, epoch, identityId));

        require(commitSubmissions[commitId].score != 0, "You have been already rewarded in this epoch!");

        bytes32 epochSubmissionsHead = serviceAgreements[agreementId].epochSubmissionHeads[epoch];
        bytes32 nextCommitId = epochSubmissionsHead;

        ParametersStorage parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));

        bool isRewarded = false;
        uint256 notRewardedNodes = parametersStorage.R0();
        for (uint256 i = 0; i < parametersStorage.R0(); i++) {
            CommitSubmission memory commit = commitSubmissions[nextCommitId];

            if (commit.score == 0) notRewardedNodes--;
            if (identityId == commit.identityId) isRewarded = true;

            nextCommitId = keccak256(abi.encodePacked(agreementId, epoch, commit.nextIdentity));
        }

        require(!isRewarded, "You hasn't been chosen for reward in this epoch!");

        bytes32 merkleRoot;
        uint256 challenge;
        (merkleRoot, challenge) = getChallenge(assetTypeContract, tokenId, keyword, hashingAlgorithm);

        require(
            MerkleProof.verify(
                proof,
                merkleRoot,
                keccak256(abi.encodePacked(chunkHash, challenge))
            ),
            "Root hash doesn't match"
        );

        uint16 notFinishedEpochs = serviceAgreements[agreementId].epochsNum - epoch + 1;
        uint96 reward = serviceAgreements[agreementId].tokenAmount / notFinishedEpochs / notRewardedNodes;

        IERC20 tokenContract = IERC20(hub.getContractAddress("Token"));
        tokenContract.transfer(address(profileStorage), reward);
        
        uint96 oldReward = profileStorage.getReward(identityId);
        uint96 newReward = oldReward + reward;
        profileStorage.setReward(identityId, newReward);

        serviceAgreements[agreementId].tokenAmount -= reward;

        // To make sure that node already received reward
        commitSubmissions[commitId].score = 0;
    }

    function setScoringFunction(bytes32 agreementId, uint8 newScoringFunctionId)
        public
        onlyAssetTypeContracts
    {
        serviceAgreements[agreementId].scoringFunctionId = newScoringFunctionId;
    }

    function _insertCommitAfter(bytes32 agreementId, uint16 epoch, uint96 prevIdentityId, CommitSubmission memory commit)
        private
    {
        bytes32 commitId = keccak256(abi.encodePacked(agreementId, epoch, commit.identityId));

        // Replacing head
        if (prevIdentityId == 0) {
            bytes32 epochSubmissionsHead = serviceAgreements[agreementId].epochSubmissionHeads[epoch];

            uint96 prevHeadIdentityId = 0;
            if(epochSubmissionsHead != "") {
                CommitSubmission commitHead = commitSubmissions[epochSubmissionsHead];
                prevHeadIdentityId = commitHead.identityId;

                require(
                    commit.score > commitHead.score,
                    "Score of the commit must be higher that the score of the head in order to replace it!"
                );
            }
            else if (epoch > 1) {
                ParametersStorage parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));
                uint8 minProofWindowOfssetPerc = parametersStorage.minProofWindowOfssetPerc();
                uint8 maxProofWindowOffsetPerc = parametersStorage.maxProofWindowOffsetPerc();

                serviceAgreements[agreementId].proofWindowOffsetPerc = minProofWindowOfssetPerc + _generatePseudorandomUint8(
                    msg.sender,
                    maxProofWindowOfssetPerc - minProofWindowOfssetPerc + 1
                );
            }

            serviceAgreements[agreementId].epochSubmissionHeads[epoch] = commitId;
            commitSubmissions[commitId] = commit;
            _link_commits(agreementId, epoch, commit.identityId, prevHeadIdentityId);
        }
        else {
            bytes32 prevCommitId = keccak256(abi.encodePacked(agreementId, epoch, prevIdentityId));
            CommitSubmission memory prevCommit = commitSubmissions[prevCommitId];

            require(
                commit.score <= prevCommit.score,
                "Score of the commit must be less or equal to the one you want insert after!"
            );

            uint96 nextIdentityId = prevCommit.nextIdentity;
            if (nextIdentityId != 0) {
                bytes32 nextCommitId = keccak256(abi.encodePacked(agreementId, epoch, nextIdentityId));
                CommitSubmission memory nextCommit = commitSubmissions[nextCommitId];

                require(
                    commit.score >= nextCommit.score,
                    "Score of the commit must be greater or equal to the one you want insert before!"
                );
            }

            commitSubmissions[commitId] = commit;
            _link_commits(agreementId, epoch, prevIdentityId, commit.identityId);
            _link_commits(agreementId, epoch, commit.identityId, nextIdentityId);
        }
    }

    function _link_commits(bytes32 agreementId, uint16 epoch, uint96 leftIdentityId, uint96 rightIdentityId)
        private
    {
        bytes32 leftCommitId = keccak256(abi.encodePacked(agreementId, epoch, leftIdentityId));
        commitSubmissions[leftCommitId].nextIdentity = rightIdentityId;
    }

    function _generateAgreementId(address assetTypeContract, uint256 tokenId, bytes keyword, uint8 hashingAlgorithm)
        private
        returns (bytes32)
    {
        HashingProxy hashingProxy = HashingProxy(hub.getContractAddress("HashingProxy"));
        return hashingProxy.callHashFunction(hashingAlgorithm, abi.encodePacked(assetTypeContract, tokenId, keyword));
    }

    function _generatePseudorandomUint8(address operationalWallet, uint8 limit)
        private
        returns (uint8)
    {
        return uint8(keccak256(abi.encodePacked(block.timestamp, operationalWallet, block.number))) % limit;
    }
}
