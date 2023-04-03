// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import {CommitManagerV1} from "./CommitManagerV1.sol";
import {CommitManagerV1U1} from "./CommitManagerV1U1.sol";
import {HashingProxy} from "./HashingProxy.sol";
import {ProofManagerV1} from "./ProofManagerV1.sol";
import {ProofManagerV1U1} from "./ProofManagerV1U1.sol";
import {ScoringProxy} from "./ScoringProxy.sol";
import {ParametersStorage} from "./storage/ParametersStorage.sol";
import {ServiceAgreementStorageProxy} from "./storage/ServiceAgreementStorageProxy.sol";
import {ContractStatus} from "./abstract/ContractStatus.sol";
import {Initializable} from "./interface/Initializable.sol";
import {Named} from "./interface/Named.sol";
import {Versioned} from "./interface/Versioned.sol";
import {ServiceAgreementStructsV1} from "./structs/ServiceAgreementStructsV1.sol";
import {GeneralErrors} from "./errors/GeneralErrors.sol";
import {ServiceAgreementErrorsV1U1} from "./errors/ServiceAgreementErrorsV1U1.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ServiceAgreementV1 is Named, Versioned, ContractStatus, Initializable {
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
    event ServiceAgreementV1Terminated(bytes32 indexed agreementId);
    event ServiceAgreementV1Extended(bytes32 indexed agreementId, uint16 epochsNumber);
    event ServiceAgreementV1RewardRaised(bytes32 indexed agreementId, uint96 tokenAmount);
    event ServiceAgreementV1UpdateRewardRaised(bytes32 indexed agreementId, uint96 updateTokenAmount);

    string private constant _NAME = "ServiceAgreementV1";
    string private constant _VERSION = "1.1.1";

    CommitManagerV1 public commitManagerV1;
    CommitManagerV1U1 public commitManagerV1U1;
    ProofManagerV1 public proofManagerV1;
    ProofManagerV1U1 public proofManagerV1U1;
    HashingProxy public hashingProxy;
    ScoringProxy public scoringProxy;
    ParametersStorage public parametersStorage;
    ServiceAgreementStorageProxy public serviceAgreementStorageProxy;
    IERC20 public tokenContract;

    error ScoreError();

    constructor(address hubAddress) ContractStatus(hubAddress) {
        initialize();
    }

    function initialize() public onlyHubOwner {
        commitManagerV1 = CommitManagerV1(hub.getContractAddress("CommitManagerV1"));
        commitManagerV1U1 = CommitManagerV1U1(hub.getContractAddress("CommitManagerV1U1"));
        proofManagerV1 = ProofManagerV1(hub.getContractAddress("ProofManagerV1"));
        proofManagerV1U1 = ProofManagerV1U1(hub.getContractAddress("ProofManagerV1U1"));
        hashingProxy = HashingProxy(hub.getContractAddress("HashingProxy"));
        scoringProxy = ScoringProxy(hub.getContractAddress("ScoringProxy"));
        parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));
        serviceAgreementStorageProxy = ServiceAgreementStorageProxy(
            hub.getContractAddress("ServiceAgreementStorageProxy")
        );
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
        if (args.epochsNumber == 0) revert ServiceAgreementErrorsV1U1.ZeroEpochsNumber();
        if (args.tokenAmount == 0) revert ServiceAgreementErrorsV1U1.ZeroTokenAmount();
        if (!scoringProxy.isScoreFunction(args.scoreFunctionId))
            revert ServiceAgreementErrorsV1U1.ScoreFunctionDoesntExist(args.scoreFunctionId);

        bytes32 agreementId = hashingProxy.callHashFunction(
            args.hashFunctionId,
            abi.encodePacked(args.assetContract, args.tokenId, args.keyword)
        );

        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;
        ParametersStorage params = parametersStorage;

        sasProxy.createV1ServiceAgreementObject(
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
            revert ServiceAgreementErrorsV1U1.TooLowAllowance(tknc.allowance(args.assetCreator, address(this)));
        if (tknc.balanceOf(args.assetCreator) < args.tokenAmount)
            revert ServiceAgreementErrorsV1U1.TooLowBalance(tknc.balanceOf(args.assetCreator));

        tknc.transferFrom(args.assetCreator, sasProxy.agreementV1StorageAddress(), args.tokenAmount);

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

    function terminateAgreement(address assetOwner, bytes32 agreementId) external onlyContracts {
        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;

        uint96 agreementBalance = sasProxy.getAgreementTokenAmount(agreementId);

        sasProxy.setAgreementTokenAmount(agreementId, 0);
        sasProxy.transferAgreementTokens(agreementId, assetOwner, agreementBalance);
        sasProxy.deleteServiceAgreementObject(agreementId);

        emit ServiceAgreementV1Terminated(agreementId);
    }

    function extendStoringPeriod(
        address assetOwner,
        bytes32 agreementId,
        uint16 epochsNumber,
        uint96 tokenAmount
    ) external onlyContracts {
        if (epochsNumber == 0) revert ServiceAgreementErrorsV1U1.ZeroEpochsNumber();

        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;

        sasProxy.setAgreementEpochsNumber(agreementId, sasProxy.getAgreementEpochsNumber(agreementId) + epochsNumber);
        sasProxy.setAgreementTokenAmount(agreementId, sasProxy.getAgreementTokenAmount(agreementId) + tokenAmount);

        if (sasProxy.agreementV1Exists(agreementId)) {
            _addTokens(assetOwner, sasProxy.agreementV1StorageAddress(), tokenAmount);
        } else {
            _addTokens(assetOwner, sasProxy.agreementV1U1StorageAddress(), tokenAmount);
        }

        emit ServiceAgreementV1Extended(agreementId, epochsNumber);
    }

    function addTokens(address assetOwner, bytes32 agreementId, uint96 tokenAmount) external onlyContracts {
        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;

        sasProxy.setAgreementTokenAmount(agreementId, sasProxy.getAgreementTokenAmount(agreementId) + tokenAmount);

        if (sasProxy.agreementV1Exists(agreementId)) {
            _addTokens(assetOwner, sasProxy.agreementV1StorageAddress(), tokenAmount);
        } else {
            _addTokens(assetOwner, sasProxy.agreementV1U1StorageAddress(), tokenAmount);
        }

        emit ServiceAgreementV1RewardRaised(agreementId, tokenAmount);
    }

    function addUpdateTokens(address assetOwner, bytes32 agreementId, uint96 tokenAmount) external onlyContracts {
        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;

        sasProxy.setAgreementUpdateTokenAmount(
            agreementId,
            sasProxy.getAgreementUpdateTokenAmount(agreementId) + tokenAmount
        );

        _addTokens(assetOwner, sasProxy.agreementV1U1StorageAddress(), tokenAmount);

        emit ServiceAgreementV1UpdateRewardRaised(agreementId, tokenAmount);
    }

    function isCommitWindowOpen(bytes32 agreementId, uint16 epoch) public view returns (bool) {
        if (serviceAgreementStorageProxy.agreementV1Exists(agreementId)) {
            return commitManagerV1.isCommitWindowOpen(agreementId, epoch);
        } else {
            return commitManagerV1U1.isCommitWindowOpen(agreementId, epoch);
        }
    }

    function getTopCommitSubmissions(
        bytes32 agreementId,
        uint16 epoch
    ) external view returns (ServiceAgreementStructsV1.CommitSubmission[] memory) {
        if (serviceAgreementStorageProxy.agreementV1Exists(agreementId)) {
            return commitManagerV1.getTopCommitSubmissions(agreementId, epoch);
        } else {
            return commitManagerV1U1.getTopCommitSubmissions(agreementId, epoch, 0);
        }
    }

    function submitCommit(ServiceAgreementStructsV1.CommitInputArgs calldata args) external {
        bytes32 agreementId = hashingProxy.callHashFunction(
            args.hashFunctionId,
            abi.encodePacked(args.assetContract, args.tokenId, args.keyword)
        );

        if (serviceAgreementStorageProxy.agreementV1Exists(agreementId)) {
            commitManagerV1.submitCommit(args);
        } else {
            commitManagerV1U1.submitCommit(args);
        }
    }

    function isProofWindowOpen(bytes32 agreementId, uint16 epoch) public view returns (bool) {
        if (serviceAgreementStorageProxy.agreementV1Exists(agreementId)) {
            return proofManagerV1.isProofWindowOpen(agreementId, epoch);
        } else {
            return proofManagerV1U1.isProofWindowOpen(agreementId, epoch);
        }
    }

    function getChallenge(
        address sender,
        address assetContract,
        uint256 tokenId,
        uint16 epoch
    ) public view returns (bytes32, uint256) {
        return proofManagerV1.getChallenge(sender, assetContract, tokenId, epoch);
    }

    function sendProof(ServiceAgreementStructsV1.ProofInputArgs calldata args) external {
        bytes32 agreementId = hashingProxy.callHashFunction(
            args.hashFunctionId,
            abi.encodePacked(args.assetContract, args.tokenId, args.keyword)
        );

        if (serviceAgreementStorageProxy.agreementV1Exists(agreementId)) {
            proofManagerV1.sendProof(args);
        } else {
            proofManagerV1U1.sendProof(args);
        }
    }

    function _addTokens(address assetOwner, address sasAddress, uint96 tokenAmount) internal virtual {
        if (tokenAmount == 0) revert ServiceAgreementErrorsV1U1.ZeroTokenAmount();

        IERC20 tknc = tokenContract;

        if (tknc.allowance(assetOwner, address(this)) < tokenAmount)
            revert ServiceAgreementErrorsV1U1.TooLowAllowance(tknc.allowance(assetOwner, address(this)));
        if (tknc.balanceOf(assetOwner) < tokenAmount)
            revert ServiceAgreementErrorsV1U1.TooLowBalance(tknc.balanceOf(assetOwner));

        tknc.transferFrom(assetOwner, sasAddress, tokenAmount);
    }

    function _generatePseudorandomUint8(address sender, uint8 limit) internal view virtual returns (uint8) {
        return uint8(uint256(keccak256(abi.encodePacked(block.timestamp, sender, block.number))) % limit);
    }
}
