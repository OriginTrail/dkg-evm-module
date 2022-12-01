// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { AbstractAsset } from "./assets/AbstractAsset.sol";
import { AssertionStorage } from "./storage/AssertionStorage.sol";
import { HashingProxy } from "./HashingProxy.sol";
import { Hub } from "./Hub.sol";
import { IdentityStorage } from "./storage/IdentityStorage.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { MerkleProof } from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import { ParametersStorage } from "./storage/ParametersStorage.sol";
import { ProfileStorage } from "./storage/ProfileStorage.sol";
import { ScoringProxy } from "./ScoringProxy.sol";
import { Staking } from "./Staking.sol";
import { StakingStorage } from "./storage/StakingStorage.sol";
import { ServiceAgreementStorage } from "./storage/ServiceAgreementStorage.sol";
import { ServiceAgreementStructs } from "./structs/ServiceAgreementStructs.sol";

contract ServiceAgreement {
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
    AssertionStorage public assertionStorage;
    ProfileStorage public profileStorage;
    IdentityStorage public identityStorage;
    ServiceAgreementStorage public serviceAgreementStorage;
    ParametersStorage public parametersStorage;
    HashingProxy public hashingProxy;
    ScoringProxy public scoringProxy;
    StakingStorage public stakingStorage;
    Staking public stakingContract;
    IERC20 public tokenContract;

    constructor (address hubAddress) {
        require(hubAddress != address(0));

        hub = Hub(hubAddress);
        assertionStorage = AssertionStorage(hub.getContractAddress("AssertionStorage"));
        profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        identityStorage = IdentityStorage(hub.getContractAddress("IdentityStorage"));
        serviceAgreementStorage = ServiceAgreementStorage(hub.getContractAddress("ServiceAgreementStorage"));
        parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));
        hashingProxy = HashingProxy(hub.getContractAddress("HashingProxy"));
        scoringProxy = ScoringProxy(hub.getContractAddress("ScoringProxy"));
        stakingStorage = StakingStorage(hub.getContractAddress("StakingStorage"));
        stakingContract = Staking(hub.getContractAddress("Staking"));
        tokenContract = IERC20(hub.getContractAddress("Token"));
    }

    modifier onlyAssetContracts() {
        _checkAssetContract();
        _;
    }

    function createServiceAgreement(ServiceAgreementStructs.ServiceAgreementInputArgs memory args)
        external
        onlyAssetContracts
    {
        require(args.operationalWallet != address(0), "Operational wallet doesn't exist");
        require(hub.isAssetContract(args.assetContract), "Asset Contract not in the hub");
        require(keccak256(args.keyword) != keccak256(""), "Keyword can't be empty");
        require(args.epochsNumber != 0, "Epochs number cannot be 0");
        require(args.tokenAmount != 0, "Token amount cannot be 0");
        require(scoringProxy.isScoreFunction(args.scoreFunctionId), "Score function doesn't exist");

        bytes32 agreementId = _generateAgreementId(args.assetContract, args.tokenId, args.keyword, args.hashFunctionId);

        ServiceAgreementStorage sas = serviceAgreementStorage;
        ParametersStorage params = parametersStorage;

        sas.createServiceAgreementObject(
            agreementId,
            args.epochsNumber,
            params.epochLength(),
            args.tokenAmount,
            args.scoreFunctionId,
            params.minProofWindowOffsetPerc() + _generatePseudorandomUint8(
                args.operationalWallet,
                params.maxProofWindowOffsetPerc() - params.minProofWindowOffsetPerc() + 1
            )
        );

        IERC20 tknc = tokenContract;
        require(
            tknc.allowance(args.operationalWallet, address(sas)) >= args.tokenAmount,
            "Sender allowance must >= amount"
        );
        require(tknc.balanceOf(args.operationalWallet) >= args.tokenAmount, "Sender balance must be >= amount");

        tknc.transferFrom(args.operationalWallet, address(sas), args.tokenAmount);

        emit ServiceAgreementCreated(
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
    function updateServiceAgreement(ServiceAgreementStructs.ServiceAgreementInputArgs memory args)
        external
        onlyAssetContracts
    {
        bytes32 agreementId = _generateAgreementId(args.assetContract, args.tokenId, args.keyword, args.hashFunctionId);
        ServiceAgreementStorage sas = serviceAgreementStorage;

        require(args.operationalWallet != address(0), "Operational wallet cannot be 0x0");
        require(sas.serviceAgreementExists(agreementId), "Service Agreement doesn't exist");
        require(args.epochsNumber != 0, "Epochs number cannot be 0");
        require(args.tokenAmount != 0, "Token amount cannot be 0");
        require(scoringProxy.isScoreFunction(args.scoreFunctionId), "Score function doesn't exist");

        uint96 actualRewardAmount = sas.getAgreementTokenAmount(agreementId);

        sas.setAgreementEpochsNumber(agreementId, args.epochsNumber);
        sas.setAgreementTokenAmount(agreementId, args.tokenAmount);
        sas.setAgreementScoreFunctionId(agreementId, args.scoreFunctionId);

        IERC20 tknc = tokenContract;

        require(
            tknc.allowance(args.operationalWallet, address(sas)) >= (args.tokenAmount - actualRewardAmount),
            "Sender allowance must be >= amount"
        );
        require(
            tknc.balanceOf(args.operationalWallet) >= (args.tokenAmount - actualRewardAmount),
            "Sender balance must be >= amount"
        );

        tknc.transferFrom(args.operationalWallet, address(sas), args.tokenAmount - actualRewardAmount);

        emit ServiceAgreementUpdated(
            args.assetContract,
            args.tokenId,
            args.keyword,
            args.hashFunctionId,
            args.epochsNumber,
            args.tokenAmount
        );
    }

    function isCommitWindowOpen(bytes32 agreementId, uint16 epoch)
        public
        view
        returns (bool)
    {
        ServiceAgreementStorage sas = serviceAgreementStorage;
        uint256 startTime = sas.getAgreementStartTime(agreementId);

        require(startTime != 0, "Service Agreement doesn't exist");
        require(epoch < sas.getAgreementEpochsNumber(agreementId), "Service Agreement has been expired");

        ParametersStorage params = parametersStorage;
        uint256 timeNow = block.timestamp;

        if (epoch == 0) {
            return timeNow < (startTime + params.commitWindowDuration());
        }

        return (
            timeNow > (
                startTime
                + sas.getAgreementEpochLength(agreementId) * epoch
            ) && timeNow < (
                startTime
                + sas.getAgreementEpochLength(agreementId) * epoch
                + params.commitWindowDuration()
            )
        );
    }

    function getTopCommitSubmissions(bytes32 agreementId, uint16 epoch)
        external
        view
        returns (ServiceAgreementStructs.CommitSubmission[] memory)
    {
        ServiceAgreementStorage sas = serviceAgreementStorage;

        require(sas.serviceAgreementExists(agreementId), "Service Agreement doesn't exist");
        require(epoch < sas.getAgreementEpochsNumber(agreementId), "Service Agreement expired");

        ServiceAgreementStructs.CommitSubmission[] memory epochCommits =
            new ServiceAgreementStructs.CommitSubmission[](parametersStorage.R0());

        bytes32 epochSubmissionsHead = sas.getAgreementEpochSubmissionHead(agreementId, epoch);

        epochCommits[0] = sas.getCommitSubmission(epochSubmissionsHead);

        bytes32 commitId;
        uint72 nextIdentityId = epochCommits[0].nextIdentityId;
        uint8 submissionsIdx = 1;
        while(nextIdentityId != 0) {
            commitId = keccak256(abi.encodePacked(agreementId, epoch, nextIdentityId));
            epochCommits[submissionsIdx] = sas.getCommitSubmission(commitId);

            nextIdentityId = epochCommits[submissionsIdx].nextIdentityId;

            unchecked { submissionsIdx++; }
        }

        return epochCommits;
    }

    function submitCommit(ServiceAgreementStructs.CommitInputArgs memory args) external {
        bytes32 agreementId = _generateAgreementId(args.assetContract, args.tokenId, args.keyword, args.hashFunctionId);

        require(isCommitWindowOpen(agreementId, args.epoch), "Commit window is closed!");

        uint72 identityId = identityStorage.getIdentityId(msg.sender);

        uint40 score = scoringProxy.callScoreFunction(
            serviceAgreementStorage.getAgreementScoreFunctionId(agreementId),
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

    function isProofWindowOpen(bytes32 agreementId, uint16 epoch)
        public
        view
        returns (bool)
    {
        ServiceAgreementStorage sas = serviceAgreementStorage;
        uint256 startTime = sas.getAgreementStartTime(agreementId);

        require(startTime != 0, "Service Agreement doesn't exist");
        require(epoch < sas.getAgreementEpochsNumber(agreementId), "Service Agreement expired");

        uint256 timeNow = block.timestamp;
        uint128 epochLength = sas.getAgreementEpochLength(agreementId);
        uint16 epochsNumber = sas.getAgreementEpochsNumber(agreementId);
        uint8 proofWindowOffsetPerc = sas.getAgreementProofWindowOffsetPerc(agreementId);

        uint256 proofWindowOffset = epochLength * epochsNumber * proofWindowOffsetPerc / 100;
        uint256 proofWindowDuration = (
            epochLength * epochsNumber * parametersStorage.proofWindowDurationPerc() / 100
        );

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

    function sendProof(ServiceAgreementStructs.ProofInputArgs memory args) external {
        bytes32 agreementId = _generateAgreementId(args.assetContract, args.tokenId, args.keyword, args.hashFunctionId);

        require(!isProofWindowOpen(agreementId, args.epoch), "Proof window is open");

        uint72 identityId = identityStorage.getIdentityId(msg.sender);

        ServiceAgreementStorage sas = serviceAgreementStorage;

        require(
            sas.getCommitSubmissionScore(keccak256(abi.encodePacked(agreementId, args.epoch, identityId))) != 0,
            "You've been already rewarded"
        );

        bytes32 nextCommitId = sas.getAgreementEpochSubmissionHead(agreementId, args.epoch);
        uint32 r0 = parametersStorage.R0();
        uint8 i;
        while ((identityId != sas.getCommitSubmissionsIdentityId(nextCommitId)) && i < r0) {
            nextCommitId = keccak256(
                abi.encodePacked(agreementId, args.epoch, sas.getCommitSubmissionNextIdentityId(nextCommitId))
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
            sas.getAgreementTokenAmount(agreementId) /
            (sas.getAgreementEpochsNumber(agreementId) - args.epoch + 1) /
            (r0 - sas.getAgreementRewardedNodesNumber(agreementId, args.epoch))
        );

        stakingContract.addReward(identityId, msg.sender, reward);
        sas.setAgreementTokenAmount(agreementId, sas.getAgreementTokenAmount(agreementId) - reward);
        sas.incrementAgreementRewardedNodesNumber(agreementId, args.epoch);

        // To make sure that node already received reward
        sas.setCommitSubmissionScore(keccak256(abi.encodePacked(agreementId, args.epoch, identityId)), 0);
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
        ServiceAgreementStorage sas = serviceAgreementStorage;

        bytes32 commitId = keccak256(abi.encodePacked(agreementId, epoch, identityId));
        bytes32 refCommitId = sas.getAgreementEpochSubmissionHead(agreementId, epoch);

        ParametersStorage params = parametersStorage;

        uint72 refCommitNextIdentityId = sas.getCommitSubmissionNextIdentityId(refCommitId);
        uint32 r0 = params.R0();
        uint8 i;
        while (
            (score <  sas.getCommitSubmissionScore(refCommitId)) &&
            (refCommitNextIdentityId != 0) &&
            (i < r0)
        ) {
            refCommitId = keccak256(
                abi.encodePacked(agreementId, epoch, refCommitNextIdentityId)
            );
            refCommitNextIdentityId = sas.getCommitSubmissionNextIdentityId(refCommitId);
            unchecked { i++; }
        }

        require(i < r0, "Node rank should be < R0");

        sas.createCommitSubmissionObject(commitId, identityId, prevIdentityId, nextIdentityId, score);

        ServiceAgreementStructs.CommitSubmission memory refCommit = sas.getCommitSubmission(refCommitId);

        // Replacing head
        if (i == 0) {
            sas.setAgreementEpochSubmissionHead(agreementId, epoch, commitId);

            // [] - empty pointer
            // [OH] - old head
            // [NH] - new head
            // [C] - commit
            // (NL) - new link
            // [] <-> [NH] <-(NL)-> [OH] <-> [C] ... [C] <-> []
            _link_commits(agreementId, epoch, identityId, refCommit.identityId);
        } else if (score > refCommit.score) {
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
        ServiceAgreementStorage sas = serviceAgreementStorage;

        sas.setCommitSubmissionNextIdentityId(
            keccak256(abi.encodePacked(agreementId, epoch, leftIdentityId)),  // leftCommitId
            rightIdentityId
        );

        sas.setCommitSubmissionPrevIdentityId(
            keccak256(abi.encodePacked(agreementId, epoch, rightIdentityId)),  // rightCommitId
            leftIdentityId
        );
    }

    function _generateAgreementId(address assetContract, uint256 tokenId, bytes memory keyword, uint8 hashFunctionId)
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
