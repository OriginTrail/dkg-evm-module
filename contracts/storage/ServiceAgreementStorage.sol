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
        bytes keyword,
        uint8 hashFunctionId,
        uint256 startTime,
        uint16 epochsNumber,
        uint128 epochLength,
        uint96 tokenAmount
    );
    event ServiceAgreementUpdated(
        address indexed assetContract,
        uint256 indexed tokenId,
        bytes keyword,
        uint8 hashFunctionId,
        uint16 epochsNumber,
        uint96 tokenAmount
    );
    event CommitSubmitted(
        address indexed assetContract,
        uint256 indexed tokenId,
        bytes keyword,
        uint8 hashFunctionId,
        uint96 indexed identityId,
        bytes nodeId,
        uint32 score
    );
    event ProofSubmitted(
        address indexed assetContract,
        uint256 indexed tokenId,
        bytes keyword,
        uint8 hashFunctionId,
        uint96 indexed identityId,
        bytes nodeId
    );


    struct CommitSubmission {
        uint96 identityId;
        uint96 nextIdentity;
        uint32 score;
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

    modifier onlyAssetContracts() {
        require (
            hub.isAssetContract(msg.sender),
            "Function can only be called by Asset Type Contracts"
        );
        _;
    }

    function getAgreementStartTime(bytes32 agreementId) public view returns (uint256) {
        return serviceAgreements[agreementId].startTime;
    }

    function getAgreementEpochsNumber(bytes32 agreementId) public view returns (uint16) {
        return serviceAgreements[agreementId].epochsNumber;
    }

    function getAgreementEpochLength(bytes32 agreementId) public view returns (uint128) {
        return serviceAgreements[agreementId].epochLength;
    }

    function getAgreementTokenAmount(bytes32 agreementId) public view returns (uint96) {
        return serviceAgreements[agreementId].tokenAmount;
    }

    function getAgreementScoreFunctionId(bytes32 agreementId) public view returns (uint8) {
        return serviceAgreements[agreementId].scoreFunctionId;
    }

    function getAgreementProofWindowOffsetPerc(bytes32 agreementId) public view returns (uint8) {
        return serviceAgreements[agreementId].proofWindowOffsetPerc;
    }

    function createServiceAgreement(
        address operationalWallet,
        address assetContract,
        uint256 tokenId,
        bytes memory keyword,
        uint8 hashFunctionId,
        uint16 epochsNumber,
        uint96 tokenAmount,
        uint8 scoreFunctionId
    )
        public
        onlyAssetContracts
    {
        bytes32 agreementId = _generateAgreementId(assetContract, tokenId, keyword, hashFunctionId);

        _createServiceAgreementObject(operationalWallet, agreementId, epochsNumber, tokenAmount, scoreFunctionId);

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

        emit ServiceAgreementCreated(
            assetContract,
            tokenId,
            keyword,
            hashFunctionId,
            serviceAgreements[agreementId].startTime,
            serviceAgreements[agreementId].epochsNumber,
            serviceAgreements[agreementId].epochLength,
            serviceAgreements[agreementId].tokenAmount
        );
    }

    // TODO: Split into smaller functions
    function updateServiceAgreement(
        address operationalWallet,
        address assetContract,
        uint256 tokenId,
        bytes memory keyword,
        uint8 hashFunctionId,
        uint16 epochsNumber,
        uint96 tokenAmount
    )
        public
        onlyAssetContracts
    {
        bytes32 agreementId = _generateAgreementId(assetContract, tokenId, keyword, hashFunctionId);

        // require(serviceAgreements[agreementId]);

        uint96 actualBalance = serviceAgreements[agreementId].tokenAmount;

        serviceAgreements[agreementId].epochsNumber = epochsNumber;
        serviceAgreements[agreementId].tokenAmount = tokenAmount;

        IERC20 tokenContract = IERC20(hub.getContractAddress("Token"));
        require(
            tokenContract.allowance(operationalWallet, address(this)) >= (actualBalance - tokenAmount),
            "Sender allowance must be equal to or higher than chosen amount!"
        );
        require(
            tokenContract.balanceOf(operationalWallet) >= (actualBalance - tokenAmount),
            "Sender balance must be equal to or higher than chosen amount!"
        );

        tokenContract.transferFrom(operationalWallet, address(this), actualBalance - tokenAmount);

        emit ServiceAgreementUpdated(
            assetContract,
            tokenId,
            keyword,
            hashFunctionId,
            serviceAgreements[agreementId].epochsNumber,
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
        uint8 hashFunctionId,
        uint16 epoch,
        uint96 prevIdentityId
    )
        public
        returns (uint256)
    {
        bytes32 agreementId = _generateAgreementId(assetContract, tokenId, keyword, hashFunctionId);

        require(isCommitWindowOpen(agreementId, epoch), "Commit window is closed!");

        IdentityStorage identityStorage = IdentityStorage(hub.getContractAddress("IdentityStorage"));
        uint96 identityId = identityStorage.getIdentityId(msg.sender);

        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        ScoringProxy scoringProxy = ScoringProxy(hub.getContractAddress("ScoringProxy"));
        uint32 score = scoringProxy.callScoreFunction(
            serviceAgreements[agreementId].scoreFunctionId,
            hashFunctionId,
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
        //     hashFunctionId,
        //     identityId,
        //     profileStorage.getNodeId(identityId),
        //     score
        // );

        ParametersStorage parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));

        // Returns start time of the proof phase
        return (
            serviceAgreements[agreementId].startTime +
            parametersStorage.epochLength() * epoch +
            parametersStorage.epochLength() * serviceAgreements[agreementId].proofWindowOffsetPerc / 100
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

        uint256 proofWindowOffset = agreement.epochLength * agreement.epochsNumber * agreement.proofWindowOffsetPerc / 100;
        uint256 proofWindowDuration = (
            agreement.epochLength * agreement.epochsNumber * parametersStorage.proofWindowDurationPerc() / 100
        );

        return (
            timeNow > (agreement.startTime + agreement.epochLength * epoch + proofWindowOffset) &&
            timeNow < (agreement.startTime + agreement.epochLength * epoch + proofWindowOffset + proofWindowDuration)
        );
    }

    function getChallenge(address assetContract, uint256 tokenId, uint16 epoch)
        public
        view
        returns (bytes32, uint256)
    {
        IdentityStorage identityStorage = IdentityStorage(hub.getContractAddress("IdentityStorage"));
        uint96 identityId = identityStorage.getIdentityId(msg.sender);

        AbstractAsset generalAssetInterface = AbstractAsset(assetContract);
        bytes32 assertionId = generalAssetInterface.getAssertionByIndex(
            tokenId,
            AbstractAsset(assetContract).getAssertionsLength(tokenId) - 1
        );

        AssertionRegistry assertionRegistry = AssertionRegistry(hub.getContractAddress("AssertionRegistry"));
        uint256 assertionChunksNumber = assertionRegistry.getChunksNumber(assertionId);

        // blockchash() function only works for last 256 blocks (25.6 min window in case of 6s block time)
        // TODO: figure out how to achieve randomness
        return (
            assertionId,
            uint256(
                sha256(abi.encodePacked(epoch, identityId))
            ) % assertionChunksNumber
        );
    }

    function sendProof(
        address assetContract,
        uint256 tokenId,
        bytes memory keyword,
        uint8 hashFunctionId,
        uint16 epoch,
        bytes32[] memory proof,
        bytes32 chunkHash
    )
        public
    {
        bytes32 agreementId = _generateAgreementId(assetContract, tokenId, keyword, hashFunctionId);
        require(!isProofWindowOpen(agreementId, epoch), "Proof window is open");

        uint96 identityId = IdentityStorage(hub.getContractAddress("IdentityStorage")).getIdentityId(msg.sender);

        require(
            commitSubmissions[keccak256(abi.encodePacked(agreementId, epoch, identityId))].score != 0,
            "You've been already rewarded in this epoch"
        );

        bytes32 nextCommitId = serviceAgreements[agreementId].epochSubmissionHeads[epoch];

        ParametersStorage parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));

        uint32 i = 0;
        while ((identityId != commitSubmissions[nextCommitId].identityId) || (i != parametersStorage.R0())) {
            nextCommitId = keccak256(
                abi.encodePacked(agreementId, epoch, commitSubmissions[nextCommitId].nextIdentity)
            );
            i++;
        }

        require(i < parametersStorage.R0(), "Your node hasn't been awarded for this asset in this epoch");

        bytes32 merkleRoot;
        uint256 challenge;
        (merkleRoot, challenge) = getChallenge(assetContract, tokenId, epoch);

        require(
            MerkleProof.verify(
                proof,
                merkleRoot,
                keccak256(abi.encodePacked(chunkHash, challenge))
            ),
            "Root hash doesn't match"
        );

        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        // emit ProofSubmitted(
        //     assetContract,
        //     tokenId,
        //     keyword,
        //     hashFunctionId,
        //     identityId,
        //     profileStorage.getNodeId(identityId)
        // );

        uint96 reward = (
            serviceAgreements[agreementId].tokenAmount /
            (serviceAgreements[agreementId].epochsNumber - epoch + 1) /
            (parametersStorage.R0() - serviceAgreements[agreementId].rewardedNodes[epoch])
        );

        IERC20(hub.getContractAddress("Token")).transfer(address(profileStorage), reward);

        profileStorage.setReward(identityId, profileStorage.getReward(identityId) + reward);

        serviceAgreements[agreementId].tokenAmount -= reward;
        serviceAgreements[agreementId].rewardedNodes[epoch] += 1;

        // To make sure that node already received reward
        commitSubmissions[keccak256(abi.encodePacked(agreementId, epoch, identityId))].score = 0;
    }

    function setScoringFunction(bytes32 agreementId, uint8 newScoreFunctionId)
        public
        onlyAssetContracts
    {
        serviceAgreements[agreementId].scoreFunctionId = newScoreFunctionId;
    }        

    function _createServiceAgreementObject(
        address operationalWallet,
        bytes32 agreementId,
        uint16 epochsNumber,
        uint96 tokenAmount,
        uint8 scoreFunctionId
    )
        private
    {
        ParametersStorage parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));

        ServiceAgreement storage agreement = serviceAgreements[agreementId];
        agreement.startTime = block.timestamp;
        agreement.epochsNumber = epochsNumber;
        agreement.epochLength = parametersStorage.epochLength();
        agreement.proofWindowOffsetPerc = parametersStorage.minProofWindowOffsetPerc() + _generatePseudorandomUint8(
            operationalWallet,
            parametersStorage.maxProofWindowOffsetPerc() - parametersStorage.minProofWindowOffsetPerc() + 1
        );
        agreement.tokenAmount = tokenAmount;
        agreement.scoreFunctionId = scoreFunctionId;
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

    function _generateAgreementId(address assetContract, uint256 tokenId, bytes memory keyword, uint8 hashFunctionId)
        private
        returns (bytes32)
    {
        HashingProxy hashingProxy = HashingProxy(hub.getContractAddress("HashingProxy"));
        return hashingProxy.callHashFunction(hashFunctionId, abi.encodePacked(assetContract, tokenId, keyword));
    }

    function _generatePseudorandomUint8(address sender, uint8 limit)
        private
        view
        returns (uint8)
    {
        // TODO: Test type conversion
        return uint8(uint256(keccak256(abi.encodePacked(block.timestamp, sender, block.number))) % limit);
    }
}
