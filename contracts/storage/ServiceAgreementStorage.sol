// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { AbstractAsset } from "../assets/AbstractAsset.sol";
import { AssertionRegistry } from "../AssertionRegistry.sol";
import { HashingProxy } from "../HashingProxy.sol";
import { Hub } from "../Hub.sol";
import { IdentityStorage } from "./IdentityStorage.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { MerkleProof } from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import { ParametersStorage } from "./ParametersStorage.sol";
import { ProfileStorage } from "./ProfileStorage.sol";
import { ScoringProxy } from "../ScoringProxy.sol";
import { ShardingTable } from "../ShardingTable.sol";

contract ServiceAgreementStorage {
    event ServiceAgreementCreated(
        address indexed assetContract,
        uint256 indexed tokenId,
        bytes indexed keyword,
        uint8 hashingFunctionId,
        uint256 startTime,
        uint16 epochsNum,
        uint128 epochLength,
        uint96 tokenAmount
    );
    event ServiceAgreementUpdated(
        address indexed assetContract,
        uint256 indexed tokenId,
        bytes indexed keyword,
        uint8 hashingFunctionId,
        uint16 epochsNum,
        uint96 tokenAmount
    );
    event CommitSubmitted(
        address assetContract,
        uint256 tokenId,
        bytes indexed keyword,
        uint8 hashingFunctionId,
        uint96 indexed identityId,
        bytes indexed nodeId,
        uint32 score
    );
    event ProofSubmitted(
        address assetContract,
        uint256 tokenId,
        bytes indexed keyword,
        uint8 hashingFunctionId,
        uint96 indexed identityId,
        bytes indexed nodeId
    );


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
        mapping(uint16 => bytes32) epochSubmissionHeads;  // epoch => headCommitId
        mapping(uint16 => uint32) rewardedNodes;
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

    modifier onlyAssetContracts() {
        require (
            hub.isAssetContract(msg.sender),
            "Function can only be called by Asset Type Contracts"
        );
        _;
    }

    function createServiceAgreement(
        address operationalWallet,
        address assetContract,
        uint256 tokenId,
        bytes memory keyword,
        uint8 hashingFunctionId,
        uint16 epochsNum,
        uint96 tokenAmount,
        uint8 scoringFunctionId
    )
        public
        onlyAssetContracts
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
        uint8 minProofWindowOfssetPerc = parametersStorage.minProofWindowOffsetPerc();
        uint8 maxProofWindowOffsetPerc = parametersStorage.maxProofWindowOffsetPerc();

        bytes32 agreementId = _generateAgreementId(assetContract, tokenId, keyword, hashingFunctionId);

        ServiceAgreement storage agreement = serviceAgreements[agreementId];
        agreement.startTime = block.timestamp;
        agreement.epochsNum = epochsNum;
        agreement.epochLength = parametersStorage.epochLength();
        agreement.proofWindowOffsetPerc = minProofWindowOfssetPerc + _generatePseudorandomUint8(
            operationalWallet,
            maxProofWindowOffsetPerc - minProofWindowOfssetPerc + 1
        );
        agreement.tokenAmount = tokenAmount;
        agreement.scoringFunctionId = scoringFunctionId;

        emit ServiceAgreementCreated(
            assetContract,
            tokenId,
            keyword,
            hashingFunctionId,
            agreement.startTime,
            agreement.epochsNum,
            agreement.epochLength,
            agreement.tokenAmount
        );
    }

    function updateServiceAgreement(
        address operationalWallet,
        address assetContract,
        uint256 tokenId,
        bytes memory keyword,
        uint8 hashingFunctionId,
        uint16 epochsNum,
        uint96 tokenAmount
    )
        public
        onlyAssetContracts
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

        bytes32 agreementId = _generateAgreementId(assetContract, tokenId, keyword, hashingFunctionId);

        serviceAgreements[agreementId].epochsNum += epochsNum;
        serviceAgreements[agreementId].tokenAmount += tokenAmount;

        emit ServiceAgreementUpdated(
            assetContract,
            tokenId,
            keyword,
            hashingFunctionId,
            serviceAgreements[agreementId].epochsNum,
            serviceAgreements[agreementId].tokenAmount
        );
    }

    function isCommitWindowOpen(bytes32 agreementId, uint16 epoch)
        public
        view
        returns (bool)
    {
        uint256 timeNow = block.timestamp;
        ServiceAgreement storage agreement = serviceAgreements[agreementId];

        ParametersStorage parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));

        return (
            timeNow > (agreement.startTime + agreement.epochLength * epoch) &&
            timeNow < (agreement.startTime + agreement.epochLength * epoch + parametersStorage.commitWindowDuration())
        );
    }

    function getCommitSubmissions(bytes32 agreementId, uint16 epoch)
        public
        view
        returns (CommitSubmission[] memory)
    {
        ParametersStorage parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));
        CommitSubmission[] memory epochCommits = new CommitSubmission[](parametersStorage.R2());

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
        address assetContract,
        uint256 tokenId,
        bytes memory keyword,
        uint8 hashingFunctionId,
        uint16 epoch,
        uint96 prevIdentityId
    )
        public
        returns (uint256)
    {
        bytes32 agreementId = _generateAgreementId(assetContract, tokenId, keyword, hashingFunctionId);

        require(isCommitWindowOpen(agreementId, epoch), "Commit window is closed!");

        IdentityStorage identityStorage = IdentityStorage(hub.getContractAddress("IdentityStorage"));
        uint96 identityId = identityStorage.identityIds(keccak256(abi.encodePacked(msg.sender)));

        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        ScoringProxy scoringProxy = ScoringProxy(hub.getContractAddress("ScoringProxy"));
        uint32 score = scoringProxy.callScoringFunction(
            serviceAgreements[agreementId].scoringFunctionId,
            hashingFunctionId,
            profileStorage.getNodeId(identityId),
            keyword,
            profileStorage.getStake(identityId)
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

        // emit CommitSubmitted(
        //     assetContract,
        //     tokenId,
        //     keyword,
        //     hashingFunctionId,
        //     identityId,
        //     profileStorage.getNodeId(identityId),
        //     score
        // );

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
        view
        returns (bool)
    {
        uint256 timeNow = block.timestamp;
        ServiceAgreement storage agreement = serviceAgreements[agreementId];

        ParametersStorage parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));

        uint256 proofWindowOffset = agreement.epochLength * agreement.epochsNum * agreement.proofWindowOffsetPerc / 100;
        uint256 proofWindowDuration = agreement.epochLength * agreement.epochsNum * parametersStorage.proofWindowDurationPerc() / 100;

        return (
            timeNow > (agreement.startTime + agreement.epochLength * epoch + proofWindowOffset) &&
            timeNow < (agreement.startTime + agreement.epochLength * epoch + proofWindowOffset + proofWindowDuration)
        );
    }

    function getChallenge(address assetContract, uint256 tokenId, bytes memory keyword, uint8 hashingAlgorithm)
        public
        returns (bytes32, uint256)
    {
        bytes32 agreementId = _generateAgreementId(assetContract, tokenId, keyword, hashingAlgorithm);

        IdentityStorage identityStorage = IdentityStorage(hub.getContractAddress("IdentityStorage"));
        uint96 identityId = identityStorage.identityIds(keccak256(abi.encodePacked(msg.sender)));

        AbstractAsset generalAssetInterface = AbstractAsset(assetContract);
        bytes32 assertionId = generalAssetInterface.getAssertionByIndex(
            tokenId,
            AbstractAsset(assetContract).getAssertionsLength(tokenId) - 1
        );

        AssertionRegistry assertionRegistry = AssertionRegistry(hub.getContractAddress("AssertionRegistry"));
        uint256 assertionSize = assertionRegistry.getSize(assertionId);

        // blockchash() function only works for last 256 blocks (25.6 min window in case of 6s block time)
        // TODO: figure out how to achieve randomness
        return (
            assertionId,
            uint256(
                sha256(abi.encodePacked(serviceAgreements[agreementId].proofWindowOffsetPerc, identityId))
            ) % assertionSize
        );
    }

    function sendProof(
        address assetContract,
        uint256 tokenId,
        bytes memory keyword,
        uint8 hashingFunctionId,
        uint16 epoch,
        bytes32[] memory proof,
        bytes32 chunkHash
    )
        public
    {
        bytes32 agreementId = _generateAgreementId(assetContract, tokenId, keyword, hashingFunctionId);
        require(!isProofWindowOpen(agreementId, epoch), "Proof window is open");

        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        uint96 identityId = profileStorage.getIdentityId();

        require(
            commitSubmissions[keccak256(abi.encodePacked(agreementId, epoch, identityId))].score != 0,
            "You have been already rewarded in this epoch"
        );

        bytes32 nextCommitId = serviceAgreements[agreementId].epochSubmissionHeads[epoch];

        ParametersStorage parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));

        bool isRewarded = false;
        for (uint32 i = 0; i < parametersStorage.R0(); i++) {
            CommitSubmission memory commit = commitSubmissions[nextCommitId];

            if (identityId == commit.identityId) isRewarded = true;

            nextCommitId = keccak256(abi.encodePacked(agreementId, epoch, commit.nextIdentity));
        }

        require(!isRewarded, "You hasn't been chosen for reward in this epoch!");

        bytes32 merkleRoot;
        uint256 challenge;
        (merkleRoot, challenge) = getChallenge(assetContract, tokenId, keyword, hashingFunctionId);

        require(
            MerkleProof.verify(
                proof,
                merkleRoot,
                keccak256(abi.encodePacked(chunkHash, challenge))
            ),
            "Root hash doesn't match"
        );

        // emit ProofSubmitted(
        //     assetContract,
        //     tokenId,
        //     keyword,
        //     hashingFunctionId,
        //     identityId,
        //     profileStorage.getNodeId(identityId)
        // );

        uint96 reward = serviceAgreements[agreementId].tokenAmount / (serviceAgreements[agreementId].epochsNum - epoch + 1) / (parametersStorage.R0() - serviceAgreements[agreementId].rewardedNodes[epoch]);

        IERC20(hub.getContractAddress("Token")).transfer(address(profileStorage), reward);

        profileStorage.setReward(identityId, profileStorage.getReward(identityId) + reward);

        serviceAgreements[agreementId].tokenAmount -= reward;
        serviceAgreements[agreementId].rewardedNodes[epoch] += 1;

        // To make sure that node already received reward
        commitSubmissions[keccak256(abi.encodePacked(agreementId, epoch, identityId))].score = 0;
    }

    function setScoringFunction(bytes32 agreementId, uint8 newScoringFunctionId)
        public
        onlyAssetContracts
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
                CommitSubmission memory commitHead = commitSubmissions[epochSubmissionsHead];
                prevHeadIdentityId = commitHead.identityId;

                require(
                    commit.score > commitHead.score,
                    "Score of the commit must be higher that the score of the head in order to replace it!"
                );
            }
            else if (epoch > 1) {
                ParametersStorage parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));
                uint8 minProofWindowOfssetPerc = parametersStorage.minProofWindowOffsetPerc();
                uint8 maxProofWindowOffsetPerc = parametersStorage.maxProofWindowOffsetPerc();

                serviceAgreements[agreementId].proofWindowOffsetPerc = minProofWindowOfssetPerc + _generatePseudorandomUint8(
                    msg.sender,
                    maxProofWindowOffsetPerc - minProofWindowOfssetPerc + 1
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

    function _generateAgreementId(address assetContract, uint256 tokenId, bytes memory keyword, uint8 hashingFunctionId)
        private
        returns (bytes32)
    {
        HashingProxy hashingProxy = HashingProxy(hub.getContractAddress("HashingProxy"));
        return hashingProxy.callHashingFunction(hashingFunctionId, abi.encodePacked(assetContract, tokenId, keyword));
    }

    function _generatePseudorandomUint8(address operationalWallet, uint8 limit)
        private
        view
        returns (uint8)
    {
        // TODO: Test type conversion
        return uint8(uint256(keccak256(abi.encodePacked(block.timestamp, operationalWallet, block.number))) % limit);
    }
}
