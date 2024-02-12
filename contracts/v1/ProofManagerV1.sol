// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {HashingProxy} from "./HashingProxy.sol";
import {Staking} from "./Staking.sol";
import {AssertionStorage} from "./storage/AssertionStorage.sol";
import {IdentityStorage} from "./storage/IdentityStorage.sol";
import {ParametersStorage} from "./storage/ParametersStorage.sol";
import {ProfileStorage} from "./storage/ProfileStorage.sol";
import {ServiceAgreementStorageProxy} from "./storage/ServiceAgreementStorageProxy.sol";
import {AbstractAsset} from "./abstract/AbstractAsset.sol";
import {ContractStatus} from "./abstract/ContractStatus.sol";
import {Initializable} from "./interface/Initializable.sol";
import {Named} from "./interface/Named.sol";
import {Versioned} from "./interface/Versioned.sol";
import {ServiceAgreementStructsV1} from "./structs/ServiceAgreementStructsV1.sol";
import {ContentAssetErrors} from "./errors/assets/ContentAssetErrors.sol";
import {GeneralErrors} from "./errors/GeneralErrors.sol";
import {ServiceAgreementErrorsV1} from "./errors/ServiceAgreementErrorsV1.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract ProofManagerV1 is Named, Versioned, ContractStatus, Initializable {
    event ProofSubmitted(
        address indexed assetContract,
        uint256 indexed tokenId,
        bytes keyword,
        uint8 hashFunctionId,
        uint16 epoch,
        uint72 indexed identityId,
        uint96 reward
    );

    string private constant _NAME = "ProofManagerV1";
    string private constant _VERSION = "1.0.3";

    bool[4] public reqs = [false, false, false, false];

    HashingProxy public hashingProxy;
    Staking public stakingContract;
    AssertionStorage public assertionStorage;
    IdentityStorage public identityStorage;
    ParametersStorage public parametersStorage;
    ProfileStorage public profileStorage;
    ServiceAgreementStorageProxy public serviceAgreementStorageProxy;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) ContractStatus(hubAddress) {}

    function initialize() public onlyHubOwner {
        hashingProxy = HashingProxy(hub.getContractAddress("HashingProxy"));
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

        if (!sasProxy.agreementV1Exists(agreementId))
            revert ServiceAgreementErrorsV1.ServiceAgreementDoesntExist(agreementId);

        uint256 startTime = sasProxy.getAgreementStartTime(agreementId);

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

        return (timeNow >= (startTime + epochLength * epoch + proofWindowOffset) &&
            timeNow < (startTime + epochLength * epoch + proofWindowOffset + proofWindowDuration));
    }

    function getChallenge(
        address sender,
        address assetContract,
        uint256 tokenId,
        uint16 epoch
    ) public view returns (bytes32 assertionId, uint256 challenge) {
        uint72 identityId = identityStorage.getIdentityId(sender);

        AbstractAsset generalAssetInterface = AbstractAsset(assetContract);
        assertionId = generalAssetInterface.getLatestAssertionId(tokenId);

        uint256 assertionChunksNumber = assertionStorage.getAssertionChunksNumber(assertionId);

        // blockchash() function only works for last 256 blocks (25.6 min window in case of 6s block time)
        // TODO: figure out how to achieve randomness
        return (assertionId, uint256(sha256(abi.encodePacked(epoch, identityId))) % assertionChunksNumber);
    }

    function sendProof(ServiceAgreementStructsV1.ProofInputArgs calldata args) external {
        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;

        bytes32 agreementId = hashingProxy.callHashFunction(
            args.hashFunctionId,
            abi.encodePacked(args.assetContract, args.tokenId, args.keyword)
        );

        if (!sasProxy.agreementV1Exists(agreementId))
            revert ServiceAgreementErrorsV1.ServiceAgreementDoesntExist(agreementId);

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

        bytes32 nextCommitId = sasProxy.getV1AgreementEpochSubmissionHead(agreementId, args.epoch);
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

        uint96 reward = sasProxy.getAgreementTokenAmount(agreementId) /
            ((r0 - sasProxy.getAgreementRewardedNodesNumber(agreementId, args.epoch)) +
                (sasProxy.getAgreementEpochsNumber(agreementId) - (args.epoch + 1)) *
                r0);

        emit ProofSubmitted(
            args.assetContract,
            args.tokenId,
            args.keyword,
            args.hashFunctionId,
            args.epoch,
            identityId,
            reward
        );

        stakingContract.addReward(agreementId, identityId, reward);
        sasProxy.setAgreementTokenAmount(agreementId, sasProxy.getAgreementTokenAmount(agreementId) - reward);
        sasProxy.incrementAgreementRewardedNodesNumber(agreementId, args.epoch);

        // To make sure that node already received reward
        sasProxy.setCommitSubmissionScore(keccak256(abi.encodePacked(agreementId, args.epoch, identityId)), 0);
    }

    function setReq(uint256 index, bool req) external onlyHubOwner {
        reqs[index] = req;
    }
}
