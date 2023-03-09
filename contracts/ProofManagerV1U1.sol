// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import {AbstractAsset} from "./assets/AbstractAsset.sol";
import {Hub} from "./Hub.sol";
import {ServiceAgreementV1} from "./ServiceAgreementV1.sol";
import {Staking} from "./Staking.sol";
import {AssertionStorage} from "./storage/AssertionStorage.sol";
import {IdentityStorage} from "./storage/IdentityStorage.sol";
import {ParametersStorage} from "./storage/ParametersStorage.sol";
import {ProfileStorage} from "./storage/ProfileStorage.sol";
import {ServiceAgreementStorageProxy} from "./storage/ServiceAgreementStorageProxy.sol";
import {Named} from "./interface/Named.sol";
import {Versioned} from "./interface/Versioned.sol";
import {ServiceAgreementStructsV1} from "./structs/ServiceAgreementStructsV1.sol";
import {GeneralErrors} from "./errors/GeneralErrors.sol";
import {ServiceAgreementErrorsV1U1} from "./errors/ServiceAgreementErrorsV1U1.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract ProofManagerV1U1 is Named, Versioned {
    event ProofSubmitted(
        address indexed assetContract,
        uint256 indexed tokenId,
        bytes keyword,
        uint8 hashFunctionId,
        uint16 epoch,
        uint256 stateIndex,
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

        if (startTime == 0) revert ServiceAgreementErrorsV1U1.ServiceAgreementDoesntExist(agreementId);
        if (epoch >= sasProxy.getAgreementEpochsNumber(agreementId))
            revert ServiceAgreementErrorsV1U1.ServiceAgreementHasBeenExpired(
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

    function getChallenge(address assetContract, uint256 tokenId, uint16 epoch) public view returns (bytes32, uint256) {
        return _getChallenge(msg.sender, assetContract, tokenId, epoch);
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

    function setReq(uint256 index, bool req) external onlyHubOwner {
        reqs[index] = req;
    }

    function _getChallenge(
        address sender,
        address assetContract,
        uint256 tokenId,
        uint16 epoch
    ) internal view returns (bytes32, uint256) {
        uint72 identityId = identityStorage.getIdentityId(sender);

        AbstractAsset generalAssetInterface = AbstractAsset(assetContract);
        bytes32 latestFinalizedState = generalAssetInterface.getLatestAssertionId(tokenId);

        uint256 assertionChunksNumber = assertionStorage.getAssertionChunksNumber(latestFinalizedState);

        // blockchash() function only works for last 256 blocks (25.6 min window in case of 6s block time)
        // TODO: figure out how to achieve randomness
        return (latestFinalizedState, uint256(sha256(abi.encodePacked(epoch, identityId))) % assertionChunksNumber);
    }

    function _sendProof(ServiceAgreementStructsV1.ProofInputArgs calldata args) internal virtual {
        bytes32 agreementId = serviceAgreementV1.generateAgreementId(
            args.assetContract,
            args.tokenId,
            args.keyword,
            args.hashFunctionId
        );

        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;
        AbstractAsset generalAssetInterface = AbstractAsset(args.assetContract);

        uint256 latestFinalizedStateIndex = generalAssetInterface.getAssertionIdsLength(args.tokenId) - 1;

        if (!reqs[0] && !isProofWindowOpen(agreementId, args.epoch)) {
            uint128 epochLength = sasProxy.getAgreementEpochLength(agreementId);

            uint256 actualProofWindowStart = (sasProxy.getAgreementStartTime(agreementId) +
                args.epoch *
                epochLength +
                (sasProxy.getAgreementProofWindowOffsetPerc(agreementId) * epochLength) /
                100);

            revert ServiceAgreementErrorsV1U1.ProofWindowClosed(
                agreementId,
                args.epoch,
                latestFinalizedStateIndex,
                actualProofWindowStart,
                actualProofWindowStart + (parametersStorage.proofWindowDurationPerc() * epochLength) / 100,
                block.timestamp
            );
        }
        emit Logger(!isProofWindowOpen(agreementId, args.epoch), "req1");

        IdentityStorage ids = identityStorage;

        uint72 identityId = ids.getIdentityId(msg.sender);
        bytes32 commitId = keccak256(abi.encodePacked(agreementId, args.epoch, latestFinalizedStateIndex, identityId));

        if (!reqs[1] && (sasProxy.getCommitSubmissionScore(commitId) == 0))
            revert ServiceAgreementErrorsV1U1.NodeAlreadyRewarded(
                agreementId,
                args.epoch,
                latestFinalizedStateIndex,
                identityId,
                profileStorage.getNodeId(identityId)
            );
        emit Logger(sasProxy.getCommitSubmissionScore(commitId) == 0, "req2");

        bytes32 nextCommitId = sasProxy.getAgreementEpochSubmissionHead(
            agreementId,
            args.epoch,
            latestFinalizedStateIndex
        );
        uint32 r0 = parametersStorage.r0();
        uint8 i;
        while ((identityId != sasProxy.getCommitSubmissionIdentityId(nextCommitId)) && (i < r0)) {
            nextCommitId = keccak256(
                abi.encodePacked(
                    agreementId,
                    args.epoch,
                    latestFinalizedStateIndex,
                    sasProxy.getCommitSubmissionNextIdentityId(nextCommitId)
                )
            );
            unchecked {
                i++;
            }
        }

        if (!reqs[2] && (i >= r0))
            revert ServiceAgreementErrorsV1U1.NodeNotAwarded(
                agreementId,
                args.epoch,
                latestFinalizedStateIndex,
                identityId,
                profileStorage.getNodeId(identityId),
                i
            );
        emit Logger(i >= r0, "req3");

        bytes32 merkleRoot;
        uint256 challenge;
        (merkleRoot, challenge) = _getChallenge(msg.sender, args.assetContract, args.tokenId, args.epoch);

        if (
            !reqs[3] &&
            !MerkleProof.verify(args.proof, merkleRoot, keccak256(abi.encodePacked(args.chunkHash, challenge)))
        )
            revert ServiceAgreementErrorsV1U1.WrongMerkleProof(
                agreementId,
                args.epoch,
                latestFinalizedStateIndex,
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
            latestFinalizedStateIndex,
            identityId
        );

        uint96 reward = (sasProxy.getAgreementTokenAmount(agreementId) /
            (sasProxy.getAgreementEpochsNumber(agreementId) - args.epoch + 1) /
            (r0 - sasProxy.getAgreementRewardedNodesNumber(agreementId, args.epoch)));

        stakingContract.addReward(identityId, reward);
        sasProxy.setAgreementTokenAmount(agreementId, sasProxy.getAgreementTokenAmount(agreementId) - reward);
        sasProxy.incrementAgreementRewardedNodesNumber(agreementId, args.epoch);

        // To make sure that node already received reward
        sasProxy.setCommitSubmissionScore(commitId, 0);
    }

    function _checkHubOwner() internal view virtual {
        if (msg.sender != hub.owner()) revert GeneralErrors.OnlyHubOwnerFunction(msg.sender);
    }
}
