// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { HashingProxy } from "./HashingProxy.sol";
import { Hub } from "./Hub.sol";
import { ScoringProxy } from "./ScoringProxy.sol";
import { Staking } from "./Staking.sol";
import { AbstractAsset } from "./assets/AbstractAsset.sol";
import { AssertionStorage } from "./storage/AssertionStorage.sol";
import { IdentityStorage } from "./storage/IdentityStorage.sol";
import { ParametersStorage } from "./storage/ParametersStorage.sol";
import { ProfileStorage } from "./storage/ProfileStorage.sol";
import { ServiceAgreementStorageV1 } from "./storage/ServiceAgreementStorageV1.sol";
import { StakingStorage } from "./storage/StakingStorage.sol";
import { ServiceAgreementStructsV1 } from "./structs/ServiceAgreementStructsV1.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { MerkleProof } from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract ServiceAgreementV1 {

    event ServiceAgreementV1Created(
        address indexed assetContract,
        uint256 indexed tokenId,
        bytes keyword,
        uint8 hashFunctionId,
        uint256 startTime,
        uint16 epochsNumber,
        uint128 epochLength,
        uint96 tokenAmount
    );
    event ServiceAgreementV1Updated(
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
        uint72 indexed identityId,
        uint40 score
    );
    event ProofSubmitted(
        address indexed assetContract,
        uint256 indexed tokenId,
        bytes keyword,
        uint8 hashFunctionId,
        uint72 indexed identityId
    );

    Hub public hub;
    HashingProxy public hashingProxy;
    ScoringProxy public scoringProxy;
    Staking public stakingContract;
    AssertionStorage public assertionStorage;
    IdentityStorage public identityStorage;
    ParametersStorage public parametersStorage;
    ProfileStorage public profileStorage;
    ServiceAgreementStorageV1 public serviceAgreementStorageV1;
    StakingStorage public stakingStorage;
    IERC20 public tokenContract;

    constructor (address hubAddress) {
        require(hubAddress != address(0));

        hub = Hub(hubAddress);
        hashingProxy = HashingProxy(hub.getContractAddress("HashingProxy"));
        scoringProxy = ScoringProxy(hub.getContractAddress("ScoringProxy"));
        stakingContract = Staking(hub.getContractAddress("Staking"));
        assertionStorage = AssertionStorage(hub.getContractAddress("AssertionStorage"));
        identityStorage = IdentityStorage(hub.getContractAddress("IdentityStorage"));
        parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));
        profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        serviceAgreementStorageV1 = ServiceAgreementStorageV1(hub.getContractAddress("ServiceAgreementStorageV1"));
        stakingStorage = StakingStorage(hub.getContractAddress("StakingStorage"));
        tokenContract = IERC20(hub.getContractAddress("Token"));
    }

    modifier onlyAssetContracts() {
        _checkAssetContract();
        _;
    }

    function createServiceAgreement(ServiceAgreementStructsV1.ServiceAgreementInputArgs calldata args)
        external
        onlyAssetContracts
    {
        require(args.assetCreator != address(0), "Asset creator cannot be 0x0");
        require(hub.isAssetContract(args.assetContract), "Asset Contract not in the hub");
        require(keccak256(args.keyword) != keccak256(""), "Keyword can't be empty");
        require(args.epochsNumber != 0, "Epochs number cannot be 0");
        require(args.tokenAmount != 0, "Token amount cannot be 0");
        require(scoringProxy.isScoreFunction(args.scoreFunctionId), "Score function doesn't exist");

        bytes32 agreementId = _generateAgreementId(args.assetContract, args.tokenId, args.keyword, args.hashFunctionId);

        ServiceAgreementStorageV1 sasV1 = serviceAgreementStorageV1;
        ParametersStorage params = parametersStorage;

        sasV1.createServiceAgreementObject(
            agreementId,
            args.epochsNumber,
            params.epochLength(),
            args.tokenAmount,
            args.scoreFunctionId,
            params.minProofWindowOffsetPerc() + _generatePseudorandomUint8(
                args.assetCreator,
                params.maxProofWindowOffsetPerc() - params.minProofWindowOffsetPerc() + 1
            )
        );

        IERC20 tknc = tokenContract;
        require(
            tknc.allowance(args.assetCreator, address(this)) >= args.tokenAmount,
            "Sender allowance must >= amount"
        );
        require(tknc.balanceOf(args.assetCreator) >= args.tokenAmount, "Sender balance must be >= amount");

        tknc.transferFrom(args.assetCreator, address(sasV1), args.tokenAmount);

        emit ServiceAgreementV1Created(
            args.assetContract,
            args.tokenId,
            args.keyword,
            args.hashFunctionId,
            block.timestamp,
            args.epochsNumber,
            params.epochLength(),
            args.tokenAmount
        );
    }

    // TODO: Split into smaller functions [update only epochsNumber / tokenAmount / scoreFunctionId etc.]
    function updateServiceAgreement(ServiceAgreementStructsV1.ServiceAgreementInputArgs calldata args)
        external
        onlyAssetContracts
    {
        bytes32 agreementId = _generateAgreementId(args.assetContract, args.tokenId, args.keyword, args.hashFunctionId);

        ServiceAgreementStorageV1 sasV1 = serviceAgreementStorageV1;

        require(args.assetCreator != address(0), "Asset creator cannot be 0x0");
        require(sasV1.serviceAgreementExists(agreementId), "Service Agreement doesn't exist");
        require(args.epochsNumber != 0, "Epochs number cannot be 0");
        require(args.tokenAmount != 0, "Token amount cannot be 0");
        require(scoringProxy.isScoreFunction(args.scoreFunctionId), "Score function doesn't exist");

        uint96 actualRewardAmount = sasV1.getAgreementTokenAmount(agreementId);

        sasV1.setAgreementEpochsNumber(agreementId, args.epochsNumber);
        sasV1.setAgreementTokenAmount(agreementId, args.tokenAmount);
        sasV1.setAgreementScoreFunctionId(agreementId, args.scoreFunctionId);

        IERC20 tknc = tokenContract;

        require(
            tknc.allowance(args.assetCreator, address(this)) >= (args.tokenAmount - actualRewardAmount),
            "Sender allowance must be >= amount"
        );
        require(
            tknc.balanceOf(args.assetCreator) >= (args.tokenAmount - actualRewardAmount),
            "Sender balance must be >= amount"
        );

        tknc.transferFrom(args.assetCreator, address(sasV1), args.tokenAmount - actualRewardAmount);

        emit ServiceAgreementV1Updated(
            args.assetContract,
            args.tokenId,
            args.keyword,
            args.hashFunctionId,
            args.epochsNumber,
            args.tokenAmount
        );
    }

    function isCommitWindowOpen(bytes32 agreementId, uint16 epoch) public view returns (bool) {
        ServiceAgreementStorageV1 sasV1 = serviceAgreementStorageV1;
        uint256 startTime = sasV1.getAgreementStartTime(agreementId);

        require(startTime != 0, "Service Agreement doesn't exist");
        require(epoch < sasV1.getAgreementEpochsNumber(agreementId), "Service Agreement has been expired");

        ParametersStorage params = parametersStorage;
        uint256 timeNow = block.timestamp;
        uint128 epochLength = sasV1.getAgreementEpochLength(agreementId);

        if (epoch == 0) {
            return timeNow < (startTime + params.commitWindowDuration());
        }

        return (
            timeNow > (startTime + epochLength * epoch) &&
            timeNow < (startTime + epochLength * epoch + params.commitWindowDuration())
        );
    }

    function getTopCommitSubmissions(bytes32 agreementId, uint16 epoch)
        external
        view
        returns (ServiceAgreementStructsV1.CommitSubmission[] memory)
    {
        ServiceAgreementStorageV1 sasV1 = serviceAgreementStorageV1;

        require(sasV1.serviceAgreementExists(agreementId), "Service Agreement doesn't exist");
        require(epoch < sasV1.getAgreementEpochsNumber(agreementId), "Service Agreement expired");

        uint32 r0 = parametersStorage.R0();

        ServiceAgreementStructsV1.CommitSubmission[] memory epochCommits =
            new ServiceAgreementStructsV1.CommitSubmission[](r0);

        bytes32 epochSubmissionsHead = sasV1.getAgreementEpochSubmissionHead(agreementId, epoch);

        epochCommits[0] = sasV1.getCommitSubmission(epochSubmissionsHead);

        bytes32 commitId;
        uint72 nextIdentityId = epochCommits[0].nextIdentityId;
        uint8 submissionsIdx = 1;
        while((submissionsIdx < r0) && (nextIdentityId != 0)) {
            commitId = keccak256(abi.encodePacked(agreementId, epoch, nextIdentityId));
            epochCommits[submissionsIdx] = sasV1.getCommitSubmission(commitId);

            nextIdentityId = epochCommits[submissionsIdx].nextIdentityId;

            unchecked { submissionsIdx++; }
        }

        return epochCommits;
    }

    function submitCommit(ServiceAgreementStructsV1.CommitInputArgs calldata args) external {
        bytes32 agreementId = _generateAgreementId(args.assetContract, args.tokenId, args.keyword, args.hashFunctionId);

        require(isCommitWindowOpen(agreementId, args.epoch), "Commit window is closed");

        uint72 identityId = identityStorage.getIdentityId(msg.sender);

        uint40 score = scoringProxy.callScoreFunction(
            serviceAgreementStorageV1.getAgreementScoreFunctionId(agreementId),
            args.hashFunctionId,
            profileStorage.getNodeId(identityId),
            args.keyword,
            stakingStorage.totalStakes(identityId)
        );

        _insertCommit(
            agreementId,
            args.epoch,
            identityId,
            0,
            0,
            score
        );

        emit CommitSubmitted(
            args.assetContract,
            args.tokenId,
            args.keyword,
            args.hashFunctionId,
            identityId,
            score
        );
    }

    function isProofWindowOpen(bytes32 agreementId, uint16 epoch) public view returns (bool) {
        ServiceAgreementStorageV1 sasV1 = serviceAgreementStorageV1;
        uint256 startTime = sasV1.getAgreementStartTime(agreementId);

        require(startTime != 0, "Service Agreement doesn't exist");
        require(epoch < sasV1.getAgreementEpochsNumber(agreementId), "Service Agreement expired");

        uint256 timeNow = block.timestamp;
        uint128 epochLength = sasV1.getAgreementEpochLength(agreementId);
        uint8 proofWindowOffsetPerc = sasV1.getAgreementProofWindowOffsetPerc(agreementId);

        uint256 proofWindowOffset = epochLength * proofWindowOffsetPerc / 100;
        uint256 proofWindowDuration = epochLength * parametersStorage.proofWindowDurationPerc() / 100;

        return (
            timeNow > (startTime + epochLength * epoch + proofWindowOffset) &&
            timeNow < (startTime + epochLength * epoch + proofWindowOffset + proofWindowDuration)
        );
    }

    function getChallenge(address sender, address assetContract, uint256 tokenId, uint16 epoch)
        public
        view
        returns (bytes32, uint256)
    {
        uint72 identityId = identityStorage.getIdentityId(sender);

        AbstractAsset generalAssetInterface = AbstractAsset(assetContract);
        bytes32 assertionId = generalAssetInterface.getLatestAssertionId(tokenId);

        uint256 assertionChunksNumber = assertionStorage.getAssertionChunksNumber(assertionId);

        // blockchash() function only works for last 256 blocks (25.6 min window in case of 6s block time)
        // TODO: figure out how to achieve randomness
        return (
            assertionId,
            uint256(
                sha256(abi.encodePacked(epoch, identityId))
            ) % assertionChunksNumber
        );
    }

    function sendProof(ServiceAgreementStructsV1.ProofInputArgs calldata args) external {
        bytes32 agreementId = _generateAgreementId(args.assetContract, args.tokenId, args.keyword, args.hashFunctionId);

        require(isProofWindowOpen(agreementId, args.epoch), "Proof window is closed");

        IdentityStorage ids = identityStorage;

        uint72 identityId = ids.getIdentityId(msg.sender);

        ServiceAgreementStorageV1 sasV1 = serviceAgreementStorageV1;

        require(
            sasV1.getCommitSubmissionScore(keccak256(abi.encodePacked(agreementId, args.epoch, identityId))) != 0,
            "You've been already rewarded"
        );

        bytes32 nextCommitId = sasV1.getAgreementEpochSubmissionHead(agreementId, args.epoch);
        uint32 r0 = parametersStorage.R0();
        uint8 i;
        while ((identityId != sasV1.getCommitSubmissionsIdentityId(nextCommitId)) && i < r0) {
            nextCommitId = keccak256(
                abi.encodePacked(agreementId, args.epoch, sasV1.getCommitSubmissionNextIdentityId(nextCommitId))
            );
            unchecked { i++; }
        }

        require(i < r0, "Your node hasn't been awarded for this asset in this epoch");

        bytes32 merkleRoot;
        uint256 challenge;
        (merkleRoot, challenge) = getChallenge(msg.sender, args.assetContract, args.tokenId, args.epoch);

        require(
            MerkleProof.verify(args.proof, merkleRoot, keccak256(abi.encodePacked(args.chunkHash, challenge))),
            "Root hash doesn't match"
        );

        emit ProofSubmitted(
            args.assetContract,
            args.tokenId,
            args.keyword,
            args.hashFunctionId,
            identityId
        );

        uint96 reward = (
            sasV1.getAgreementTokenAmount(agreementId) /
            (sasV1.getAgreementEpochsNumber(agreementId) - args.epoch + 1) /
            (r0 - sasV1.getAgreementRewardedNodesNumber(agreementId, args.epoch))
        );

        stakingContract.addReward(identityId, reward);
        sasV1.setAgreementTokenAmount(agreementId, sasV1.getAgreementTokenAmount(agreementId) - reward);
        sasV1.incrementAgreementRewardedNodesNumber(agreementId, args.epoch);

        // To make sure that node already received reward
        sasV1.setCommitSubmissionScore(keccak256(abi.encodePacked(agreementId, args.epoch, identityId)), 0);
    }

    function _insertCommit(
        bytes32 agreementId,
        uint16 epoch,
        uint72 identityId,
        uint72 prevIdentityId,
        uint72 nextIdentityId,
        uint40 score
    )
        private
    {
        ServiceAgreementStorageV1 sasV1 = serviceAgreementStorageV1;

        bytes32 commitId = keccak256(abi.encodePacked(agreementId, epoch, identityId));
        bytes32 refCommitId = sasV1.getAgreementEpochSubmissionHead(agreementId, epoch);

        require(commitId != refCommitId, "Node has already committed");

        ParametersStorage params = parametersStorage;

        uint72 refCommitNextIdentityId = sasV1.getCommitSubmissionNextIdentityId(refCommitId);
        uint32 r0 = params.R0();
        uint8 i;
        while (
            (score <  sasV1.getCommitSubmissionScore(refCommitId)) &&
            (refCommitNextIdentityId != 0) &&
            (i < r0)
        ) {
            refCommitId = keccak256(
                abi.encodePacked(agreementId, epoch, refCommitNextIdentityId)
            );

            require(commitId != refCommitId, "Node has already committed");

            refCommitNextIdentityId = sasV1.getCommitSubmissionNextIdentityId(refCommitId);
            unchecked { i++; }
        }

        require(i < r0, "Node rank should be < R0");

        sasV1.createCommitSubmissionObject(commitId, identityId, prevIdentityId, nextIdentityId, score);

        ServiceAgreementStructsV1.CommitSubmission memory refCommit = sasV1.getCommitSubmission(refCommitId);

        if ((i == 0) && (refCommit.identityId == 0)) {
            //  No head -> Setting new head
            sasV1.setAgreementEpochSubmissionHead(agreementId, epoch, commitId);
        } else if ((i == 0) && (score <= refCommit.score)) {
            // There is a head with higher or equal score, add new commit on the right
            _link_commits(agreementId, epoch, refCommit.identityId, identityId);
        } else if ((i == 0) && (score > refCommit.score)) {
            // There is a head with lower score, replace the head
            _link_commits(agreementId, epoch, identityId, refCommit.identityId);
        }  else if (score > refCommit.score) {
            // [H] - head
            // [RC] - reference commit
            // [RC-] - commit before reference commit
            // [RC+] - commit after reference commit
            // [NC] - new commit
            // [] <-> [H] <-> [X] ... [RC-] <-> [RC] <-> [RC+] ... [C] <-> []
            // [] <-> [H] <-> [X] ... [RC-] <-(NL)-> [NC] <-(NL)-> [RC] <-> [RC+] ... [C] <-> []
            _link_commits(agreementId, epoch, refCommit.prevIdentityId, identityId);
            _link_commits(agreementId, epoch, identityId, refCommit.identityId);
        } else {
            // [] <-> [H] <-> [RC] <-> []
            // [] <-> [H] <-> [RC] <-(NL)-> [NC] <-> []
            _link_commits(agreementId, epoch, refCommit.identityId, identityId);
        }
    }

    function _link_commits(bytes32 agreementId, uint16 epoch, uint72 leftIdentityId, uint72 rightIdentityId) private {
        ServiceAgreementStorageV1 sasV1 = serviceAgreementStorageV1;

        sasV1.setCommitSubmissionNextIdentityId(
            keccak256(abi.encodePacked(agreementId, epoch, leftIdentityId)),  // leftCommitId
            rightIdentityId
        );

        sasV1.setCommitSubmissionPrevIdentityId(
            keccak256(abi.encodePacked(agreementId, epoch, rightIdentityId)),  // rightCommitId
            leftIdentityId
        );
    }

    function _generateAgreementId(address assetContract, uint256 tokenId, bytes calldata keyword, uint8 hashFunctionId)
        private
        returns (bytes32)
    {
        return hashingProxy.callHashFunction(hashFunctionId, abi.encodePacked(assetContract, tokenId, keyword));
    }

    function _generatePseudorandomUint8(address sender, uint8 limit) private view returns (uint8) {
        return uint8(uint256(keccak256(abi.encodePacked(block.timestamp, sender, block.number))) % limit);
    }

    function _checkAssetContract() internal view virtual {
        require (hub.isAssetContract(msg.sender), "Fn can only be called by assets");
    }

}
