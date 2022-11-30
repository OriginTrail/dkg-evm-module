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
import { StakingStorage } from "./storage/StakingStorage.sol";
import { ServiceAgreementStorage } from "./storage/ServiceAgreementStorage.sol";
import { ServiceAgreementStructs } from "./structs/ServiceAgreementStructs.sol";
import { Named } from "./interface/Named.sol";

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
        bytes nodeId,
        uint40 score
    );
    event ProofSubmitted(
        address indexed assetContract,
        uint256 indexed tokenId,
        bytes keyword,
        uint8 hashFunctionId,
        uint72 indexed identityId,
        bytes nodeId
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
        tokenContract = IERC20(hub.getContractAddress("Token"));
    }

    modifier onlyAssetContracts() {
        _checkAssetContract();
        _;
    }

    function createServiceAgreement(
        address operationalWallet,
        address assetContract,
        uint256 tokenId,
        bytes calldata keyword,
        uint8 hashFunctionId,
        uint16 epochsNumber,
        uint96 tokenAmount,
        uint8 scoreFunctionId
    )
        external
        onlyAssetContracts
    {
        require(operationalWallet != address(0), "Operational wallet doesn't exist");
        require(hub.isAssetContract(Named(assetContract).name()), "Asset Contract not in the hub");
        require(tokenId >= 0, "Invalid token ID");
        require(keccak256(keyword) != keccak256(""), "Keyword can't be empty");
        require(hashingProxy.isHashFunction(hashFunctionId), "Hash function doesn't exist");
        require(epochsNumber > 0, "Epochs number must be >0");
        require(tokenAmount > 0, "Token amount must be >0");
        require(scoringProxy.isScoreFunction(scoreFunctionId), "Score function doesn't exist");

        bytes32 agreementId = _generateAgreementId(assetContract, tokenId, keyword, hashFunctionId);

        ParametersStorage params = parametersStorage;

        uint256 startTime = block.timestamp;

        serviceAgreementStorage.createServiceAgreementObject(
            agreementId,
            startTime,
            epochsNumber,
            params.epochLength(),
            tokenAmount,
            scoreFunctionId,
            params.minProofWindowOffsetPerc() + _generatePseudorandomUint8(
                operationalWallet,
                params.maxProofWindowOffsetPerc() - params.minProofWindowOffsetPerc() + 1
            )
        );

        IERC20 tknc = tokenContract;
        require(
            tknc.allowance(operationalWallet, address(this)) >= tokenAmount,
            "Sender allowance must be equal to or higher than chosen amount!"
        );
        require(
            tknc.balanceOf(operationalWallet) >= tokenAmount,
            "Sender balance must be equal to or higher than chosen amount!"
        );

        // TODO: Move to ServiceAgreementStorage
        tknc.transferFrom(operationalWallet, address(this), tokenAmount);

        emit ServiceAgreementCreated(
            assetContract,
            tokenId,
            keyword,
            hashFunctionId,
            startTime,
            epochsNumber,
            params.epochLength(),
            tokenAmount
        );
    }

    // TODO: Split into smaller functions [update only epochsNumber / update only tokenAmount etc.]
    function updateServiceAgreement(
        address operationalWallet,
        address assetContract,
        uint256 tokenId,
        bytes memory keyword,
        uint8 hashFunctionId,
        uint16 epochsNumber,
        uint96 tokenAmount
    )
        external
        onlyAssetContracts
    {
        bytes32 agreementId = _generateAgreementId(assetContract, tokenId, keyword, hashFunctionId);

        require(serviceAgreementStorage.getAgreementStartTime(agreementId) > 0, "Service Agreement doesn't exist");
        require(operationalWallet != address(0), "Operational wallet doesn't exist");
        require(epochsNumber > 0, "Epochs number must be >0");
        require(tokenAmount > 0, "Token amount must be >0");

        uint96 actualBalance = serviceAgreementStorage.getAgreementTokenAmount(agreementId);

        serviceAgreementStorage.setAgreementEpochsNumber(agreementId, epochsNumber);
        serviceAgreementStorage.setAgreementTokenAmount(agreementId, tokenAmount);

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
            serviceAgreementStorage.getAgreementEpochsNumber(agreementId),
            serviceAgreementStorage.getAgreementTokenAmount(agreementId)
        );
    }

    function isCommitWindowOpen(bytes32 agreementId, uint16 epoch)
        public
        view
        returns (bool)
    {
        require(serviceAgreementStorage.getAgreementStartTime(agreementId) > 0, "Service Agreement doesn't exist");
        require(epoch < serviceAgreementStorage.getAgreementEpochsNumber(agreementId), "Service Agreement has been expired");

        uint256 timeNow = block.timestamp;

        if (epoch == 0) {
            return timeNow < (serviceAgreementStorage.getAgreementStartTime(agreementId) + parametersStorage.commitWindowDuration());
        }

        return (
            timeNow > (
                serviceAgreementStorage.getAgreementStartTime(agreementId)
                + serviceAgreementStorage.getAgreementEpochLength(agreementId) * epoch
            ) && timeNow < (
                serviceAgreementStorage.getAgreementStartTime(agreementId)
                + serviceAgreementStorage.getAgreementEpochLength(agreementId) * epoch
                + parametersStorage.commitWindowDuration()
            )
        );
    }

    function getTopCommitSubmissions(bytes32 agreementId, uint16 epoch)
        external
        view
        returns (ServiceAgreementStructs.CommitSubmission[] memory)
    {
        require(serviceAgreementStorage.getAgreementStartTime(agreementId) > 0, "Service Agreement doesn't exist");
        require(epoch < serviceAgreementStorage.getAgreementEpochsNumber(agreementId), "Service Agreement expired");

        ServiceAgreementStructs.CommitSubmission[] memory epochCommits = new ServiceAgreementStructs.CommitSubmission[](parametersStorage.R0());

        bytes32 epochSubmissionsHead = serviceAgreementStorage.getAgreementEpochSubmissionHead(agreementId, epoch);

        epochCommits[0] = serviceAgreementStorage.getCommitSubmission(epochSubmissionsHead);

        uint8 submissionsIdx = 1;
        uint72 nextIdentityId = epochCommits[0].nextIdentityId;
        while(nextIdentityId != 0) {
            bytes32 commitId = keccak256(abi.encodePacked(agreementId, epoch, nextIdentityId));
            epochCommits[submissionsIdx] = serviceAgreementStorage.getCommitSubmission(commitId);

            nextIdentityId = epochCommits[submissionsIdx].nextIdentityId;

            unchecked { submissionsIdx++; }
        }

        return epochCommits;
    }

    function submitCommit(
        address assetContract,
        uint256 tokenId,
        bytes calldata keyword,
        uint8 hashFunctionId,
        uint16 epoch
    )
        external
    {
        bytes32 agreementId = _generateAgreementId(assetContract, tokenId, keyword, hashFunctionId);

        require(isCommitWindowOpen(agreementId, epoch), "Commit window is closed!");

        uint72 identityId = identityStorage.getIdentityId(msg.sender);

        uint40 score = scoringProxy.callScoreFunction(
            serviceAgreementStorage.getAgreementScoreFunctionId(agreementId),
            hashFunctionId,
            profileStorage.getNodeId(identityId),
            keyword,
            stakingStorage.totalStakes(identityId)
        );

        _insertCommit(
            agreementId,
            epoch,
            identityId,
            0,
            0,
            score
        );

        emit CommitSubmitted(
            assetContract,
            tokenId,
            keyword,
            hashFunctionId,
            identityId,
            profileStorage.getNodeId(identityId),
            score
        );
    }

    function isProofWindowOpen(bytes32 agreementId, uint16 epoch)
        public
        view
        returns (bool)
    {
        uint256 startTime = serviceAgreementStorage.getAgreementStartTime(agreementId);

        require(startTime > 0, "Service Agreement doesn't exist");
        require(epoch < serviceAgreementStorage.getAgreementEpochsNumber(agreementId), "Service Agreement expired");

        uint256 timeNow = block.timestamp;
        uint128 epochLength = serviceAgreementStorage.getAgreementEpochLength(agreementId);
        uint16 epochsNumber = serviceAgreementStorage.getAgreementEpochsNumber(agreementId);
        uint8 proofWindowOffsetPerc = serviceAgreementStorage.getAgreementProofWindowOffsetPerc(agreementId);

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

    function sendProof(
        address assetContract,
        uint256 tokenId,
        bytes memory keyword,
        uint8 hashFunctionId,
        uint16 epoch,
        bytes32[] memory proof,
        bytes32 chunkHash
    )
        external
    {
        bytes32 agreementId = _generateAgreementId(assetContract, tokenId, keyword, hashFunctionId);

        require(!isProofWindowOpen(agreementId, epoch), "Proof window is open");

        uint72 identityId = IdentityStorage(hub.getContractAddress("IdentityStorage")).getIdentityId(msg.sender);

        require(
            serviceAgreementStorage.getCommitSubmissionScore(keccak256(abi.encodePacked(agreementId, epoch, identityId))) != 0,
            "You've been already rewarded in this epoch"
        );

        bytes32 nextCommitId = serviceAgreementStorage.getAgreementEpochSubmissionHead(agreementId, epoch);

        uint8 i = 0;
        while ((identityId != serviceAgreementStorage.getCommitSubmissionsIdentityId(nextCommitId)) && i < parametersStorage.R0()) {
            nextCommitId = keccak256(
                abi.encodePacked(agreementId, epoch, serviceAgreementStorage.getCommitSubmissionNextIdentityId(nextCommitId))
            );
            unchecked { i++; }
        }

        require(i < parametersStorage.R0(), "Your node hasn't been awarded for this asset in this epoch");

        bytes32 merkleRoot;
        uint256 challenge;
        (merkleRoot, challenge) = getChallenge(msg.sender, assetContract, tokenId, epoch);

        require(
            MerkleProof.verify(
                proof,
                merkleRoot,
                keccak256(abi.encodePacked(chunkHash, challenge))
            ),
            "Root hash doesn't match"
        );

        emit ProofSubmitted(
            assetContract,
            tokenId,
            keyword,
            hashFunctionId,
            identityId,
            profileStorage.getNodeId(identityId)
        );

        uint96 reward = (
            serviceAgreementStorage.getAgreementTokenAmount(agreementId) /
            (serviceAgreementStorage.getAgreementEpochsNumber(agreementId) - epoch + 1) /
            (parametersStorage.R0() - serviceAgreementStorage.getAgreementRewardedNodes(agreementId, epoch))
        );

        IERC20(hub.getContractAddress("Token")).transfer(address(profileStorage), reward);

        profileStorage.setReward(identityId, profileStorage.getReward(identityId) + reward);

        serviceAgreementStorage.setAgreementTokenAmount(agreementId, serviceAgreementStorage.getAgreementTokenAmount(agreementId) - reward);
        serviceAgreementStorage.setAgreementRewardedNodes(agreementId, epoch, serviceAgreementStorage.getAgreementRewardedNodes(agreementId, epoch) + 1);

        // To make sure that node already received reward
        serviceAgreementStorage.setCommitSubmissionsScore(keccak256(abi.encodePacked(agreementId, epoch, identityId)), 0);
    }

    function setScoringFunction(bytes32 agreementId, uint8 newScoreFunctionId) external onlyAssetContracts {
        serviceAgreementStorage.setAgreementScoreFunctionId(agreementId, newScoreFunctionId);
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
        bytes32 commitId = keccak256(abi.encodePacked(agreementId, epoch, identityId));
        bytes32 refCommitId = serviceAgreementStorage.getAgreementEpochSubmissionHead(agreementId, epoch);

        uint8 i = 0;
        while (
            (score <  serviceAgreementStorage.getCommitSubmissionsScore(refCommitId)) &&
            (serviceAgreementStorage.getCommitSubmissionsNextIdentityId(refCommitId) != 0) &&
            (i < parametersStorage.R0())
        ) {
            refCommitId = keccak256(
                abi.encodePacked(agreementId, epoch, serviceAgreementStorage.getCommitSubmissionsNextIdentityId(refCommitId))
            );
            unchecked { i++; }
        }

        require(i < parametersStorage.R0(), "Node rank should be < R0");

        serviceAgreementStorage.createCommitSubmissionObject(commitId, identityId, prevIdentityId, nextIdentityId, score);

        uint72 refCommitIdentityId = serviceAgreementStorage.getCommitSubmissionsIdentityId(refCommitId);
        uint72 refCommitPrevIdentityId = serviceAgreementStorage.getCommitSubmissionsPrevIdentityId(refCommitId);
        uint40 refCommitScore = serviceAgreementStorage.getCommitSubmissionsScore(refCommitId);

        // Replacing head
        if (i == 0) {
            serviceAgreementStorage.setAgreementEpochSubmissionHead(agreementId, epoch, commitId);

            // [] - empty pointer
            // [OH] - old head
            // [NH] - new head
            // [C] - commit
            // (NL) - new link
            // [] <-> [NH] <-(NL)-> [OH] <-> [C] ... [C] <-> []
            _link_commits(agreementId, epoch, identityId, refCommitIdentityId);
        } else if (score > refCommitScore) {
            // [H] - head
            // [RC] - reference commit
            // [RC-] - commit before reference commit
            // [RC+] - commit after reference commit
            // [NC] - new commit
            // [] <-> [H] <-> [X] ... [RC-] <-> [RC] <-> [RC+] ... [C] <-> []
            // [] <-> [H] <-> [X] ... [RC-] <-(NL)-> [NC] <-(NL)-> [RC] <-> [RC+] ... [C] <-> []
            _link_commits(agreementId, epoch, refCommitPrevIdentityId, identityId);
            _link_commits(agreementId, epoch, identityId, refCommitIdentityId);
        } else {
            // [] <-> [H] <-> [RC] <-> []
            // [] <-> [H] <-> [RC] <-(NL)-> [NC] <-> []
            _link_commits(agreementId, epoch, refCommitIdentityId, identityId);
        }
    }

    function _link_commits(bytes32 agreementId, uint16 epoch, uint72 leftIdentityId, uint72 rightIdentityId) private {
        bytes32 leftCommitId = keccak256(abi.encodePacked(agreementId, epoch, leftIdentityId));
        serviceAgreementStorage.setCommitSubmissionsNextIdentityId(leftCommitId, rightIdentityId);

        bytes32 rightCommitId = keccak256(abi.encodePacked(agreementId, epoch, rightIdentityId));
        serviceAgreementStorage.setCommitSubmissionsPrevIdentityId(rightCommitId, leftIdentityId);
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
