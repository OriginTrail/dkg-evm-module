// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import {HashingProxy} from "./HashingProxy.sol";
import {Hub} from "./Hub.sol";
import {ScoringProxy} from "./ScoringProxy.sol";
import {Staking} from "./Staking.sol";
import {AbstractAsset} from "./assets/AbstractAsset.sol";
import {AssertionStorage} from "./storage/AssertionStorage.sol";
import {IdentityStorage} from "./storage/IdentityStorage.sol";
import {ParametersStorage} from "./storage/ParametersStorage.sol";
import {ProfileStorage} from "./storage/ProfileStorage.sol";
import {ServiceAgreementStorageV1} from "./storage/ServiceAgreementStorageV1.sol";
import {ShardingTableStorage} from "./storage/ShardingTableStorage.sol";
import {StakingStorage} from "./storage/StakingStorage.sol";
import {Named} from "./interface/Named.sol";
import {Versioned} from "./interface/Versioned.sol";
import {ServiceAgreementStructsV1} from "./structs/ServiceAgreementStructsV1.sol";
import {GeneralErrors} from "./errors/GeneralErrors.sol";
import {ServiceAgreementErrorsV1} from "./errors/ServiceAgreementErrorsV1.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract ServiceAgreementV1 is Named, Versioned {
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

    string private constant _NAME = "ServiceAgreementV1";
    string private constant _VERSION = "1.0.0";

    Hub public hub;
    HashingProxy public hashingProxy;
    ScoringProxy public scoringProxy;
    Staking public stakingContract;
    AssertionStorage public assertionStorage;
    IdentityStorage public identityStorage;
    ParametersStorage public parametersStorage;
    ProfileStorage public profileStorage;
    ServiceAgreementStorageV1 public serviceAgreementStorageV1;
    ShardingTableStorage public shardingTableStorage;
    StakingStorage public stakingStorage;
    IERC20 public tokenContract;

    constructor(address hubAddress) {
        require(hubAddress != address(0), "Hub Address cannot be 0x0");

        hub = Hub(hubAddress);
        initialize();
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
        hashingProxy = HashingProxy(hub.getContractAddress("HashingProxy"));
        scoringProxy = ScoringProxy(hub.getContractAddress("ScoringProxy"));
        stakingContract = Staking(hub.getContractAddress("Staking"));
        assertionStorage = AssertionStorage(hub.getContractAddress("AssertionStorage"));
        identityStorage = IdentityStorage(hub.getContractAddress("IdentityStorage"));
        parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));
        profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        serviceAgreementStorageV1 = ServiceAgreementStorageV1(hub.getContractAddress("ServiceAgreementStorageV1"));
        shardingTableStorage = ShardingTableStorage(hub.getContractAddress("ShardingTableStorage"));
        stakingStorage = StakingStorage(hub.getContractAddress("StakingStorage"));
        tokenContract = IERC20(hub.getContractAddress("Token"));
    }

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function createServiceAgreement(
        ServiceAgreementStructsV1.ServiceAgreementInputArgs calldata args
    ) external onlyContracts {
        if (args.assetCreator == address(0x0)) revert ServiceAgreementErrorsV1.EmptyAssetCreatorAddress();
        if (!hub.isAssetStorage(args.assetContract))
            revert ServiceAgreementErrorsV1.AssetStorgeNotInTheHub(args.assetContract);
        if (keccak256(args.keyword) == keccak256("")) revert ServiceAgreementErrorsV1.EmptyKeyword();
        if (args.epochsNumber == 0) revert ServiceAgreementErrorsV1.ZeroEpochsNumber();
        if (args.tokenAmount == 0) revert ServiceAgreementErrorsV1.ZeroTokenAmount();
        if (!scoringProxy.isScoreFunction(args.scoreFunctionId))
            revert ServiceAgreementErrorsV1.ScoreFunctionDoesntExist(args.scoreFunctionId);

        bytes32 agreementId = generateAgreementId(args.assetContract, args.tokenId, args.keyword, args.hashFunctionId);

        ServiceAgreementStorageV1 sasV1 = serviceAgreementStorageV1;
        ParametersStorage params = parametersStorage;

        sasV1.createServiceAgreementObject(
            agreementId,
            args.epochsNumber,
            params.epochLength(),
            args.tokenAmount,
            args.scoreFunctionId,
            params.minProofWindowOffsetPerc() +
                _generatePseudorandomUint8(
                    args.assetCreator,
                    params.maxProofWindowOffsetPerc() - params.minProofWindowOffsetPerc() + 1
                )
        );

        IERC20 tknc = tokenContract;
        if (tknc.allowance(args.assetCreator, address(this)) < args.tokenAmount)
            revert ServiceAgreementErrorsV1.TooLowAllowance(tknc.allowance(args.assetCreator, address(this)));
        if (tknc.balanceOf(args.assetCreator) < args.tokenAmount)
            revert ServiceAgreementErrorsV1.TooLowBalance(tknc.balanceOf(args.assetCreator));

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

    function updateAgreement(address assetOwner, bytes32 agreementId, uint96 tokenAmount) external onlyContracts {
        if (tokenAmount == 0) revert ServiceAgreementErrorsV1.ZeroTokenAmount();

        ServiceAgreementStorageV1 sasV1 = serviceAgreementStorageV1;

        uint16 epochsNumber;
        uint128 epochLength;
        uint96 agreementBalance;
        uint8[2] memory uint8Params;
        (, epochsNumber, epochLength, agreementBalance, uint8Params) = sasV1.getAgreementData(agreementId);

        sasV1.deleteServiceAgreementObject(agreementId);
        sasV1.createServiceAgreementObject(
            agreementId,
            epochsNumber,
            epochLength,
            agreementBalance,
            uint8Params[0],
            uint8Params[1]
        );

        _addTokens(assetOwner, agreementId, tokenAmount);
    }

    function terminateAgreement(address assetOwner, bytes32 agreementId) external onlyContracts {
        ServiceAgreementStorageV1 sasV1 = serviceAgreementStorageV1;

        uint96 agreementBalance = sasV1.getAgreementTokenAmount(agreementId);
        sasV1.deleteServiceAgreementObject(agreementId);
        sasV1.transferAgreementTokens(assetOwner, agreementBalance);
    }

    function extendStoringPeriod(
        address assetOwner,
        bytes32 agreementId,
        uint16 epochsNumber,
        uint96 tokenAmount
    ) external onlyContracts {
        if (!serviceAgreementStorageV1.serviceAgreementExists(agreementId))
            revert ServiceAgreementErrorsV1.ServiceAgreementDoesntExist(agreementId);
        if (epochsNumber == 0) revert ServiceAgreementErrorsV1.ZeroEpochsNumber();
        if (tokenAmount == 0) revert ServiceAgreementErrorsV1.ZeroTokenAmount();

        ServiceAgreementStorageV1 sasV1 = serviceAgreementStorageV1;
        sasV1.setAgreementEpochsNumber(agreementId, sasV1.getAgreementEpochsNumber(agreementId) + epochsNumber);
        _addTokens(assetOwner, agreementId, tokenAmount);
    }

    function addTokens(address assetOwner, bytes32 agreementId, uint96 tokenAmount) external onlyContracts {
        if (!serviceAgreementStorageV1.serviceAgreementExists(agreementId))
            revert ServiceAgreementErrorsV1.ServiceAgreementDoesntExist(agreementId);
        if (tokenAmount == 0) revert ServiceAgreementErrorsV1.ZeroTokenAmount();

        _addTokens(assetOwner, agreementId, tokenAmount);
    }

    function isCommitWindowOpen(bytes32 agreementId, uint16 epoch) public view returns (bool) {
        ServiceAgreementStorageV1 sasV1 = serviceAgreementStorageV1;
        uint256 startTime = sasV1.getAgreementStartTime(agreementId);

        ParametersStorage params = parametersStorage;
        uint128 epochLength = sasV1.getAgreementEpochLength(agreementId);

        if (startTime == 0) revert ServiceAgreementErrorsV1.ServiceAgreementDoesntExist(agreementId);
        if (epoch >= sasV1.getAgreementEpochsNumber(agreementId))
            revert ServiceAgreementErrorsV1.ServiceAgreementHasBeenExpired(
                agreementId,
                startTime,
                sasV1.getAgreementEpochsNumber(agreementId),
                epochLength
            );

        uint256 timeNow = block.timestamp;

        if (epoch == 0) {
            return timeNow < (startTime + params.commitWindowDuration());
        }

        return (timeNow > (startTime + epochLength * epoch) &&
            timeNow < (startTime + epochLength * epoch + params.commitWindowDuration()));
    }

    function getTopCommitSubmissions(
        bytes32 agreementId,
        uint16 epoch
    ) external view returns (ServiceAgreementStructsV1.CommitSubmission[] memory) {
        ServiceAgreementStorageV1 sasV1 = serviceAgreementStorageV1;

        if (!sasV1.serviceAgreementExists(agreementId))
            revert ServiceAgreementErrorsV1.ServiceAgreementDoesntExist(agreementId);
        if (epoch >= sasV1.getAgreementEpochsNumber(agreementId))
            revert ServiceAgreementErrorsV1.ServiceAgreementHasBeenExpired(
                agreementId,
                sasV1.getAgreementStartTime(agreementId),
                sasV1.getAgreementEpochsNumber(agreementId),
                parametersStorage.epochLength()
            );

        uint32 r0 = parametersStorage.r0();

        ServiceAgreementStructsV1.CommitSubmission[]
            memory epochCommits = new ServiceAgreementStructsV1.CommitSubmission[](r0);

        bytes32 epochSubmissionsHead = sasV1.getAgreementEpochSubmissionHead(agreementId, epoch);

        epochCommits[0] = sasV1.getCommitSubmission(epochSubmissionsHead);

        bytes32 commitId;
        uint72 nextIdentityId = epochCommits[0].nextIdentityId;
        uint8 submissionsIdx = 1;
        while ((submissionsIdx < r0) && (nextIdentityId != 0)) {
            commitId = keccak256(abi.encodePacked(agreementId, epoch, nextIdentityId));
            epochCommits[submissionsIdx] = sasV1.getCommitSubmission(commitId);

            nextIdentityId = epochCommits[submissionsIdx].nextIdentityId;

            unchecked {
                submissionsIdx++;
            }
        }

        return epochCommits;
    }

    function submitCommit(ServiceAgreementStructsV1.CommitInputArgs calldata args) external {
        bytes32 agreementId = generateAgreementId(args.assetContract, args.tokenId, args.keyword, args.hashFunctionId);

        if (!isCommitWindowOpen(agreementId, args.epoch)) {
            ServiceAgreementStorageV1 sasV1 = serviceAgreementStorageV1;
            uint256 actualCommitWindowStart = (sasV1.getAgreementStartTime(agreementId) +
                args.epoch *
                sasV1.getAgreementEpochLength(agreementId));

            revert ServiceAgreementErrorsV1.CommitWindowClosed(
                agreementId,
                args.epoch,
                actualCommitWindowStart,
                actualCommitWindowStart + parametersStorage.commitWindowDuration(),
                block.timestamp
            );
        }

        uint72 identityId = identityStorage.getIdentityId(msg.sender);

        if (!shardingTableStorage.nodeExists(identityId)) {
            ProfileStorage ps = profileStorage;

            revert ServiceAgreementErrorsV1.NodeNotInShardingTable(
                identityId,
                ps.getNodeId(identityId),
                ps.getAsk(identityId),
                stakingStorage.totalStakes(identityId)
            );
        }

        uint40 score = scoringProxy.callScoreFunction(
            serviceAgreementStorageV1.getAgreementScoreFunctionId(agreementId),
            args.hashFunctionId,
            profileStorage.getNodeId(identityId),
            args.keyword,
            stakingStorage.totalStakes(identityId)
        );

        _insertCommit(agreementId, args.epoch, identityId, 0, 0, score);

        emit CommitSubmitted(args.assetContract, args.tokenId, args.keyword, args.hashFunctionId, identityId, score);
    }

    function isProofWindowOpen(bytes32 agreementId, uint16 epoch) public view returns (bool) {
        ServiceAgreementStorageV1 sasV1 = serviceAgreementStorageV1;
        uint256 startTime = sasV1.getAgreementStartTime(agreementId);

        if (startTime == 0) revert ServiceAgreementErrorsV1.ServiceAgreementDoesntExist(agreementId);
        if (epoch >= sasV1.getAgreementEpochsNumber(agreementId))
            revert ServiceAgreementErrorsV1.ServiceAgreementHasBeenExpired(
                agreementId,
                sasV1.getAgreementStartTime(agreementId),
                sasV1.getAgreementEpochsNumber(agreementId),
                parametersStorage.epochLength()
            );

        uint256 timeNow = block.timestamp;
        uint128 epochLength = sasV1.getAgreementEpochLength(agreementId);
        uint8 proofWindowOffsetPerc = sasV1.getAgreementProofWindowOffsetPerc(agreementId);

        uint256 proofWindowOffset = (epochLength * proofWindowOffsetPerc) / 100;
        uint256 proofWindowDuration = (epochLength * parametersStorage.proofWindowDurationPerc()) / 100;

        return (timeNow > (startTime + epochLength * epoch + proofWindowOffset) &&
            timeNow < (startTime + epochLength * epoch + proofWindowOffset + proofWindowDuration));
    }

    function getChallenge(
        address sender,
        address assetContract,
        uint256 tokenId,
        uint16 epoch
    ) public view returns (bytes32, uint256) {
        uint72 identityId = identityStorage.getIdentityId(sender);

        AbstractAsset generalAssetInterface = AbstractAsset(assetContract);
        bytes32 assertionId = generalAssetInterface.getLatestAssertionId(tokenId);

        uint256 assertionChunksNumber = assertionStorage.getAssertionChunksNumber(assertionId);

        // blockchash() function only works for last 256 blocks (25.6 min window in case of 6s block time)
        // TODO: figure out how to achieve randomness
        return (assertionId, uint256(sha256(abi.encodePacked(epoch, identityId))) % assertionChunksNumber);
    }

    function sendProof(ServiceAgreementStructsV1.ProofInputArgs calldata args) external {
        bytes32 agreementId = generateAgreementId(args.assetContract, args.tokenId, args.keyword, args.hashFunctionId);

        ServiceAgreementStorageV1 sasV1 = serviceAgreementStorageV1;

        if (!isProofWindowOpen(agreementId, args.epoch)) {
            uint256 actualCommitWindowStart = (sasV1.getAgreementStartTime(agreementId) +
                args.epoch *
                sasV1.getAgreementEpochLength(agreementId));

            revert ServiceAgreementErrorsV1.ProofWindowClosed(
                agreementId,
                args.epoch,
                actualCommitWindowStart,
                actualCommitWindowStart + parametersStorage.commitWindowDuration(),
                block.timestamp
            );
        }

        IdentityStorage ids = identityStorage;

        uint72 identityId = ids.getIdentityId(msg.sender);

        if (sasV1.getCommitSubmissionScore(keccak256(abi.encodePacked(agreementId, args.epoch, identityId))) == 0)
            revert ServiceAgreementErrorsV1.NodeAlreadyRewarded(
                agreementId,
                args.epoch,
                identityId,
                profileStorage.getNodeId(identityId)
            );

        bytes32 nextCommitId = sasV1.getAgreementEpochSubmissionHead(agreementId, args.epoch);
        uint32 r0 = parametersStorage.r0();
        uint8 i;
        while ((identityId != sasV1.getCommitSubmissionIdentityId(nextCommitId)) && (i < r0)) {
            nextCommitId = keccak256(
                abi.encodePacked(agreementId, args.epoch, sasV1.getCommitSubmissionNextIdentityId(nextCommitId))
            );
            unchecked {
                i++;
            }
        }

        if (i >= r0)
            revert ServiceAgreementErrorsV1.NodeNotAwarded(
                agreementId,
                args.epoch,
                identityId,
                profileStorage.getNodeId(identityId),
                i
            );

        bytes32 merkleRoot;
        uint256 challenge;
        (merkleRoot, challenge) = getChallenge(msg.sender, args.assetContract, args.tokenId, args.epoch);

        if (!MerkleProof.verify(args.proof, merkleRoot, keccak256(abi.encodePacked(args.chunkHash, challenge))))
            revert ServiceAgreementErrorsV1.WrongMerkleProof(
                agreementId,
                args.epoch,
                identityId,
                profileStorage.getNodeId(identityId),
                args.proof,
                merkleRoot,
                args.chunkHash,
                challenge
            );

        emit ProofSubmitted(args.assetContract, args.tokenId, args.keyword, args.hashFunctionId, identityId);

        uint96 reward = (sasV1.getAgreementTokenAmount(agreementId) /
            (sasV1.getAgreementEpochsNumber(agreementId) - args.epoch + 1) /
            (r0 - sasV1.getAgreementRewardedNodesNumber(agreementId, args.epoch)));

        stakingContract.addReward(identityId, reward);
        sasV1.setAgreementTokenAmount(agreementId, sasV1.getAgreementTokenAmount(agreementId) - reward);
        sasV1.incrementAgreementRewardedNodesNumber(agreementId, args.epoch);

        // To make sure that node already received reward
        sasV1.setCommitSubmissionScore(keccak256(abi.encodePacked(agreementId, args.epoch, identityId)), 0);
    }

    function generateAgreementId(
        address assetContract,
        uint256 tokenId,
        bytes calldata keyword,
        uint8 hashFunctionId
    ) public view onlyContracts returns (bytes32) {
        return hashingProxy.callHashFunction(hashFunctionId, abi.encodePacked(assetContract, tokenId, keyword));
    }

    function _insertCommit(
        bytes32 agreementId,
        uint16 epoch,
        uint72 identityId,
        uint72 prevIdentityId,
        uint72 nextIdentityId,
        uint40 score
    ) private {
        ServiceAgreementStorageV1 sasV1 = serviceAgreementStorageV1;

        bytes32 commitId = keccak256(abi.encodePacked(agreementId, epoch, identityId));

        if (sasV1.commitSubmissionExists(commitId))
            revert ServiceAgreementErrorsV1.NodeAlreadySubmittedCommit(
                agreementId,
                epoch,
                identityId,
                profileStorage.getNodeId(identityId)
            );

        bytes32 refCommitId = sasV1.getAgreementEpochSubmissionHead(agreementId, epoch);

        ParametersStorage params = parametersStorage;

        uint72 refCommitNextIdentityId = sasV1.getCommitSubmissionNextIdentityId(refCommitId);
        uint32 r0 = params.r0();
        uint8 i;
        while ((score < sasV1.getCommitSubmissionScore(refCommitId)) && (refCommitNextIdentityId != 0) && (i < r0)) {
            refCommitId = keccak256(abi.encodePacked(agreementId, epoch, refCommitNextIdentityId));

            refCommitNextIdentityId = sasV1.getCommitSubmissionNextIdentityId(refCommitId);
            unchecked {
                i++;
            }
        }

        if (i >= r0)
            revert ServiceAgreementErrorsV1.NodeNotAwarded(
                agreementId,
                epoch,
                identityId,
                profileStorage.getNodeId(identityId),
                i
            );

        sasV1.createCommitSubmissionObject(commitId, identityId, prevIdentityId, nextIdentityId, score);

        ServiceAgreementStructsV1.CommitSubmission memory refCommit = sasV1.getCommitSubmission(refCommitId);

        if ((i == 0) && (refCommit.identityId == 0)) {
            //  No head -> Setting new head
            sasV1.setAgreementEpochSubmissionHead(agreementId, epoch, commitId);
        } else if ((i == 0) && (score <= refCommit.score)) {
            // There is a head with higher or equal score, add new commit on the right
            _linkCommits(agreementId, epoch, refCommit.identityId, identityId);
        } else if ((i == 0) && (score > refCommit.score)) {
            // There is a head with lower score, replace the head
            sasV1.setAgreementEpochSubmissionHead(agreementId, epoch, commitId);
            _linkCommits(agreementId, epoch, identityId, refCommit.identityId);
        } else if (score > refCommit.score) {
            // [H] - head
            // [RC] - reference commit
            // [RC-] - commit before reference commit
            // [RC+] - commit after reference commit
            // [NC] - new commit
            // [] <-> [H] <-> [X] ... [RC-] <-> [RC] <-> [RC+] ... [C] <-> []
            // [] <-> [H] <-> [X] ... [RC-] <-(NL)-> [NC] <-(NL)-> [RC] <-> [RC+] ... [C] <-> []
            _linkCommits(agreementId, epoch, refCommit.prevIdentityId, identityId);
            _linkCommits(agreementId, epoch, identityId, refCommit.identityId);
        } else {
            // [] <-> [H] <-> [RC] <-> []
            // [] <-> [H] <-> [RC] <-(NL)-> [NC] <-> []
            _linkCommits(agreementId, epoch, refCommit.identityId, identityId);
        }
    }

    function _linkCommits(bytes32 agreementId, uint16 epoch, uint72 leftIdentityId, uint72 rightIdentityId) private {
        ServiceAgreementStorageV1 sasV1 = serviceAgreementStorageV1;

        sasV1.setCommitSubmissionNextIdentityId(
            keccak256(abi.encodePacked(agreementId, epoch, leftIdentityId)), // leftCommitId
            rightIdentityId
        );

        sasV1.setCommitSubmissionPrevIdentityId(
            keccak256(abi.encodePacked(agreementId, epoch, rightIdentityId)), // rightCommitId
            leftIdentityId
        );
    }

    function _addTokens(address assetOwner, bytes32 agreementId, uint96 tokenAmount) internal {
        ServiceAgreementStorageV1 sasV1 = serviceAgreementStorageV1;
        IERC20 tknc = tokenContract;

        if (tknc.allowance(assetOwner, address(this)) < tokenAmount)
            revert ServiceAgreementErrorsV1.TooLowAllowance(tknc.allowance(assetOwner, address(this)));
        if (tknc.balanceOf(assetOwner) < tokenAmount)
            revert ServiceAgreementErrorsV1.TooLowBalance(tknc.balanceOf(assetOwner));

        sasV1.setAgreementTokenAmount(agreementId, sasV1.getAgreementTokenAmount(agreementId) + tokenAmount);
        tknc.transferFrom(assetOwner, address(sasV1), tokenAmount);
    }

    function _generatePseudorandomUint8(address sender, uint8 limit) private view returns (uint8) {
        return uint8(uint256(keccak256(abi.encodePacked(block.timestamp, sender, block.number))) % limit);
    }

    function _checkHubOwner() internal view virtual {
        if (msg.sender != hub.owner()) revert GeneralErrors.OnlyHubOwnerFunction(msg.sender);
    }

    function _checkHub() internal view virtual {
        if (!hub.isContract(msg.sender)) revert GeneralErrors.OnlyHubContractsFunction(msg.sender);
    }
}
