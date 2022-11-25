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


    struct CommitSubmission {
        uint72 identityId;
        uint72 prevIdentityId;
        uint72 nextIdentityId;
        uint40 score;
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

    function getAgreementData(bytes32 agreementId)
        public
        view
        returns (uint256, uint16, uint128, uint96, uint8, uint8)
    {
        return (
            serviceAgreements[agreementId].startTime,
            serviceAgreements[agreementId].epochsNumber,
            serviceAgreements[agreementId].epochLength,
            serviceAgreements[agreementId].tokenAmount,
            serviceAgreements[agreementId].scoreFunctionId,
            serviceAgreements[agreementId].proofWindowOffsetPerc
        );
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

        uint72 nextIdentityId = commitSubmissions[epochSubmissionsHead].nextIdentityId;
        while(nextIdentityId != 0) {
            bytes32 commitId = keccak256(abi.encodePacked(agreementId, epoch, nextIdentityId));

            CommitSubmission memory commit = commitSubmissions[commitId];
            submissionsIdx++;
            epochCommits[submissionsIdx] = commit;

            nextIdentityId = commit.nextIdentityId;
        }

        return epochCommits;
    }

    function submitCommit(
        address assetContract,
        uint256 tokenId,
        bytes memory keyword,
        uint8 hashFunctionId,
        uint16 epoch
    )
        public
    {
        bytes32 agreementId = _generateAgreementId(assetContract, tokenId, keyword, hashFunctionId);

        require(isCommitWindowOpen(agreementId, epoch), "Commit window is closed!");

        IdentityStorage identityStorage = IdentityStorage(hub.getContractAddress("IdentityStorage"));
        uint72 identityId = identityStorage.getIdentityId(msg.sender);

        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        ScoringProxy scoringProxy = ScoringProxy(hub.getContractAddress("ScoringProxy"));
        uint40 score = scoringProxy.callScoreFunction(
            serviceAgreements[agreementId].scoreFunctionId,
            hashFunctionId,
            profileStorage.getNodeId(identityId),
            keyword,
            profileStorage.getStake(identityId)
        );

        _insertCommit(
            agreementId,
            epoch,
            CommitSubmission({
                identityId: identityId,
                prevIdentityId: 0,
                nextIdentityId: 0,
                score: score
            })
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

    function getChallenge(address sender, address assetContract, uint256 tokenId, uint16 epoch)
        public
        view
        returns (bytes32, uint256)
    {
        IdentityStorage identityStorage = IdentityStorage(hub.getContractAddress("IdentityStorage"));
        uint72 identityId = identityStorage.getIdentityId(sender);

        AbstractAsset generalAssetInterface = AbstractAsset(assetContract);
        bytes32 assertionId = generalAssetInterface.getLatestAssertion(tokenId);

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

        uint72 identityId = IdentityStorage(hub.getContractAddress("IdentityStorage")).getIdentityId(msg.sender);

        require(
            commitSubmissions[keccak256(abi.encodePacked(agreementId, epoch, identityId))].score != 0,
            "You've been already rewarded in this epoch"
        );

        bytes32 nextCommitId = serviceAgreements[agreementId].epochSubmissionHeads[epoch];

        ParametersStorage parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));

        uint8 i = 0;
        while ((identityId != commitSubmissions[nextCommitId].identityId) && i < parametersStorage.R0()) {
            nextCommitId = keccak256(
                abi.encodePacked(agreementId, epoch, commitSubmissions[nextCommitId].nextIdentityId)
            );
            i++;
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

    function _insertCommit(bytes32 agreementId, uint16 epoch, CommitSubmission memory commit)
        private
    {
        bytes32 commitId = keccak256(abi.encodePacked(agreementId, epoch, commit.identityId));
        bytes32 refCommitId = serviceAgreements[agreementId].epochSubmissionHeads[epoch];

        ParametersStorage parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));

        uint8 i = 0;
        while (
            (commit.score < commitSubmissions[refCommitId].score) &&
            (commitSubmissions[refCommitId].nextIdentityId != 0) &&
            (i < parametersStorage.R0())
        ) {
            refCommitId = keccak256(
                abi.encodePacked(agreementId, epoch, commitSubmissions[refCommitId].nextIdentityId)
            );
            i++;
        }

        require(i < parametersStorage.R0(), "Node rank should be < R0");

        commitSubmissions[commitId] = commit;
        CommitSubmission memory refCommit = commitSubmissions[refCommitId];

        // Replacing head
        if (i == 0) {
            serviceAgreements[agreementId].epochSubmissionHeads[epoch] = commitId;

            // [] - empty pointer
            // [OH] - old head
            // [NH] - new head
            // [C] - commit
            // (NL) - new link
            // [] <-> [NH] <-(NL)-> [OH] <-> [C] ... [C] <-> []
            _link_commits(agreementId, epoch, commit.identityId, refCommit.identityId);
        } else if (commit.score > refCommit.score) {
            // [H] - head
            // [RC] - reference commit
            // [RC-] - commit before reference commit
            // [RC+] - commit after reference commit
            // [NC] - new commit
            // [] <-> [H] <-> [X] ... [RC-] <-> [RC] <-> [RC+] ... [C] <-> []
            // [] <-> [H] <-> [X] ... [RC-] <-(NL)-> [NC] <-(NL)-> [RC] <-> [RC+] ... [C] <-> []
            _link_commits(agreementId, epoch, refCommit.prevIdentityId, commit.identityId);
            _link_commits(agreementId, epoch, commit.identityId, refCommit.identityId);
        } else {
            // [] <-> [H] <-> [RC] <-> []
            // [] <-> [H] <-> [RC] <-(NL)-> [NC] <-> []
            _link_commits(agreementId, epoch, refCommit.identityId, commit.identityId);
        }
    }

    function _link_commits(bytes32 agreementId, uint16 epoch, uint72 leftIdentityId, uint72 rightIdentityId)
        private
    {
        bytes32 leftCommitId = keccak256(abi.encodePacked(agreementId, epoch, leftIdentityId));
        commitSubmissions[leftCommitId].nextIdentityId = rightIdentityId;

        bytes32 rightCommitId = keccak256(abi.encodePacked(agreementId, epoch, rightIdentityId));
        commitSubmissions[rightCommitId].prevIdentityId = leftIdentityId;
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
