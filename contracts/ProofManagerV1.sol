// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import {Hub} from "./Hub.sol";
import {ServiceAgreementV1} from "./ServiceAgreementV1.sol";
import {Staking} from "./Staking.sol";
import {AbstractAsset} from "./assets/AbstractAsset.sol";
import {AssertionStorage} from "./storage/AssertionStorage.sol";
import {IdentityStorage} from "./storage/IdentityStorage.sol";
import {ParametersStorage} from "./storage/ParametersStorage.sol";
import {ProfileStorage} from "./storage/ProfileStorage.sol";
import {ServiceAgreementStorageProxy} from "./storage/ServiceAgreementStorageProxy.sol";
import {Named} from "./interface/Named.sol";
import {Versioned} from "./interface/Versioned.sol";
import {ServiceAgreementStructsV1} from "./structs/ServiceAgreementStructsV1.sol";
import {GeneralErrors} from "./errors/GeneralErrors.sol";
import {ServiceAgreementErrorsV1} from "./errors/ServiceAgreementErrorsV1.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract ProofManagerV1 is Named, Versioned {
    event ProofSubmitted(
        address indexed assetContract,
        uint256 indexed tokenId,
        bytes keyword,
        uint8 hashFunctionId,
        uint16 epoch,
        uint72 indexed identityId
    );
    event Logger(bool value, string message);

    string private constant _NAME = "ProofManagerV1";
    string private constant _VERSION = "1.0.0";

    bool[4] public reqs = [false, false, false, false];

    Hub public hub;
    ServiceAgreementV1 public serviceAgreementV1;
    Staking public stakingContract;
    AssertionStorage public assertionStorage;
    IdentityStorage public identityStorage;
    ParametersStorage public parametersStorage;
    ProfileStorage public profileStorage;
    ServiceAgreementStorageProxy public serviceAgreementStorageProxy;

    constructor(address hubAddress) {
        require(hubAddress != address(0), "Hub Address cannot be 0x0");

        hub = Hub(hubAddress);
        initialize();
    }

    modifier onlyHubOwner() {
        _checkHubOwner();
        _;
    }

    function initialize() public onlyHubOwner {
        serviceAgreementV1 = ServiceAgreementV1(hub.getContractAddress("ServiceAgreementV1"));
        stakingContract = Staking(hub.getContractAddress("Staking"));
        assertionStorage = AssertionStorage(hub.getContractAddress("AssertionStorage"));
        identityStorage = IdentityStorage(hub.getContractAddress("IdentityStorage"));
        parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));
        profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        serviceAgreementStorageProxy = ServiceAgreementStorageProxy(
            hub.getContractAddress("ServiceAgreementStorageProxy")
        );
    }

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function isProofWindowOpen(bytes32 agreementId, uint16 epoch) public view returns (bool) {
        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;
        uint256 startTime = sasProxy.getAgreementStartTime(agreementId);

        if (startTime == 0) revert ServiceAgreementErrorsV1.ServiceAgreementDoesntExist(agreementId);
        if (epoch >= sasProxy.getAgreementEpochsNumber(agreementId))
            revert ServiceAgreementErrorsV1.ServiceAgreementHasBeenExpired(
                agreementId,
                startTime,
                sasProxy.getAgreementEpochsNumber(agreementId),
                sasProxy.getAgreementEpochLength(agreementId)
            );

        uint256 timeNow = block.timestamp;
        uint128 epochLength = sasProxy.getAgreementEpochLength(agreementId);
        uint8 proofWindowOffsetPerc = sasProxy.getAgreementProofWindowOffsetPerc(agreementId);

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
        _sendProof(args);
    }

    function bulkSendProof(ServiceAgreementStructsV1.ProofInputArgs[] calldata argsArray) external {
        uint256 proofsNumber = argsArray.length;

        for (uint256 i; i < proofsNumber; ) {
            _sendProof(argsArray[i]);
            unchecked {
                i++;
            }
        }
    }

    // function sendProofWithAutoCommit(ServiceAgreementStructsV1.ProofInputArgs calldata args) external {
    //     bytes32 agreementId;
    //     uint72 identityId;
    //     (agreementId, identityId) = _sendProof(args);

    //     uint40 score = scoringProxy.callScoreFunction(
    //         serviceAgreementStorageV1.getAgreementScoreFunctionId(agreementId),
    //         args.hashFunctionId,
    //         profileStorage.getNodeId(identityId),
    //         args.keyword,
    //         stakingStorage.totalStakes(identityId)
    //     );

    //     _insertCommit(agreementId, (args.epoch + 1), identityId, 0, 0, score);

    //     emit CommitSubmitted(
    //         args.assetContract,
    //         args.tokenId,
    //         args.keyword,
    //         args.hashFunctionId,
    //         (args.epoch + 1),
    //         identityId,
    //         score
    //     );
    // }

    // function bulkSendProofWithAutoCommit(ServiceAgreementStructsV1.ProofInputArgs[] calldata argsArray) external {
    //     uint256 proofsNumber = argsArray.length;

    //     bytes32 agreementId;
    //     uint72 identityId;
    //     uint40 score;
    //     for (uint256 i; i < proofsNumber; ) {
    //         (agreementId, identityId) = _sendProof(argsArray[i]);

    //         score = scoringProxy.callScoreFunction(
    //             serviceAgreementStorageV1.getAgreementScoreFunctionId(agreementId),
    //             argsArray[i].hashFunctionId,
    //             profileStorage.getNodeId(identityId),
    //             argsArray[i].keyword,
    //             stakingStorage.totalStakes(identityId)
    //         );

    //         _insertCommit(agreementId, (argsArray[i].epoch + 1), identityId, 0, 0, score);

    //         emit CommitSubmitted(
    //             argsArray[i].assetContract,
    //             argsArray[i].tokenId,
    //             argsArray[i].keyword,
    //             argsArray[i].hashFunctionId,
    //             (argsArray[i].epoch + 1),
    //             identityId,
    //             score
    //         );

    //         unchecked {
    //             i++;
    //         }
    //     }
    // }

    function setReq(uint256 index, bool req) external onlyHubOwner {
        reqs[index] = req;
    }

    function _sendProof(
        ServiceAgreementStructsV1.ProofInputArgs calldata args
    ) internal virtual returns (bytes32, uint72) {
        bytes32 agreementId = serviceAgreementV1.generateAgreementId(
            args.assetContract,
            args.tokenId,
            args.keyword,
            args.hashFunctionId
        );

        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;

        if (!reqs[0] && !isProofWindowOpen(agreementId, args.epoch)) {
            uint128 epochLength = sasProxy.getAgreementEpochLength(agreementId);

            uint256 actualCommitWindowStart = (sasProxy.getAgreementStartTime(agreementId) + args.epoch * epochLength);

            revert ServiceAgreementErrorsV1.ProofWindowClosed(
                agreementId,
                args.epoch,
                actualCommitWindowStart,
                actualCommitWindowStart + (parametersStorage.commitWindowDurationPerc() * epochLength) / 100,
                block.timestamp
            );
        }
        emit Logger(!isProofWindowOpen(agreementId, args.epoch), "req1");

        IdentityStorage ids = identityStorage;

        uint72 identityId = ids.getIdentityId(msg.sender);

        if (
            !reqs[1] &&
            (sasProxy.getCommitSubmissionScore(keccak256(abi.encodePacked(agreementId, args.epoch, identityId))) == 0)
        )
            revert ServiceAgreementErrorsV1.NodeAlreadyRewarded(
                agreementId,
                args.epoch,
                identityId,
                profileStorage.getNodeId(identityId)
            );
        emit Logger(
            sasProxy.getCommitSubmissionScore(keccak256(abi.encodePacked(agreementId, args.epoch, identityId))) == 0,
            "req2"
        );

        bytes32 nextCommitId = sasProxy.getAgreementEpochSubmissionHead(agreementId, args.epoch);
        uint32 r0 = parametersStorage.r0();
        uint8 i;
        while ((identityId != sasProxy.getCommitSubmissionIdentityId(nextCommitId)) && (i < r0)) {
            nextCommitId = keccak256(
                abi.encodePacked(agreementId, args.epoch, sasProxy.getCommitSubmissionNextIdentityId(nextCommitId))
            );
            unchecked {
                i++;
            }
        }

        if (!reqs[2] && (i >= r0))
            revert ServiceAgreementErrorsV1.NodeNotAwarded(
                agreementId,
                args.epoch,
                identityId,
                profileStorage.getNodeId(identityId),
                i
            );
        emit Logger(i >= r0, "req3");

        bytes32 merkleRoot;
        uint256 challenge;
        (merkleRoot, challenge) = getChallenge(msg.sender, args.assetContract, args.tokenId, args.epoch);

        if (
            !reqs[3] &&
            !MerkleProof.verify(args.proof, merkleRoot, keccak256(abi.encodePacked(args.chunkHash, challenge)))
        )
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
        emit Logger(
            !MerkleProof.verify(args.proof, merkleRoot, keccak256(abi.encodePacked(args.chunkHash, challenge))),
            "req4"
        );

        emit ProofSubmitted(
            args.assetContract,
            args.tokenId,
            args.keyword,
            args.hashFunctionId,
            args.epoch,
            identityId
        );

        uint96 reward = (sasProxy.getAgreementTokenAmount(agreementId) /
            (sasProxy.getAgreementEpochsNumber(agreementId) - args.epoch + 1) /
            (r0 - sasProxy.getAgreementRewardedNodesNumber(agreementId, args.epoch)));

        stakingContract.addReward(identityId, reward);
        sasProxy.setAgreementTokenAmount(agreementId, sasProxy.getAgreementTokenAmount(agreementId) - reward);
        sasProxy.incrementAgreementRewardedNodesNumber(agreementId, args.epoch);

        // To make sure that node already received reward
        sasProxy.setCommitSubmissionScore(keccak256(abi.encodePacked(agreementId, args.epoch, identityId)), 0);

        return (agreementId, identityId);
    }

    function _checkHubOwner() internal view virtual {
        if (msg.sender != hub.owner()) revert GeneralErrors.OnlyHubOwnerFunction(msg.sender);
    }
}
