// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import {CommitManagerV1} from "./CommitManagerV1.sol";
import {CommitManagerV1U1} from "./CommitManagerV1U1.sol";
import {HashingProxy} from "./HashingProxy.sol";
import {Hub} from "./Hub.sol";
import {ScoringProxy} from "./ScoringProxy.sol";
import {ParametersStorage} from "./storage/ParametersStorage.sol";
import {ProofManagerV1} from "./ProofManagerV1.sol";
import {ProofManagerV1U1} from "./ProofManagerV1U1.sol";
import {ServiceAgreementStorageProxy} from "./storage/ServiceAgreementStorageProxy.sol";
import {ServiceAgreementHelperFunctions} from "./ServiceAgreementHelperFunctions.sol";
import {Named} from "./interface/Named.sol";
import {Versioned} from "./interface/Versioned.sol";
import {ServiceAgreementStructsV1} from "./structs/ServiceAgreementStructsV1.sol";
import {GeneralErrors} from "./errors/GeneralErrors.sol";
import {ServiceAgreementErrorsV1U1} from "./errors/ServiceAgreementErrorsV1U1.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

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
    event ServiceAgreementV1Terminated(
        address indexed assetContract,
        uint256 indexed tokenId,
        bytes keyword,
        uint8 hashFunctionId
    );
    event ServiceAgreementV1Extended(
        address indexed assetContract,
        uint256 indexed tokenId,
        bytes keyword,
        uint8 hashFunctionId,
        uint16 epochsNumber
    );
    event ServiceAgreementV1RewardRaised(
        address indexed assetContract,
        uint256 indexed tokenId,
        bytes keyword,
        uint8 hashFunctionId,
        uint96 tokenAmount
    );
    event ServiceAgreementV1UpdateRewardRaised(
        address indexed assetContract,
        uint256 indexed tokenId,
        bytes keyword,
        uint8 hashFunctionId,
        uint96 tokenAmount
    );

    string private constant _NAME = "ServiceAgreementV1";
    string private constant _VERSION = "1.1.0";

    Hub public hub;
    CommitManagerV1 public commitManagerV1;
    CommitManagerV1U1 public commitManagerV1U1;
    ProofManagerV1 public proofManagerV1;
    ProofManagerV1U1 public proofManagerV1U1;
    HashingProxy public hashingProxy;
    ScoringProxy public scoringProxy;
    ParametersStorage public parametersStorage;
    ServiceAgreementStorageProxy public serviceAgreementStorageProxy;
    ServiceAgreementHelperFunctions public serviceAgreementHelperFunctions;
    IERC20 public tokenContract;

    error ScoreError();

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
        serviceAgreementHelperFunctions = ServiceAgreementHelperFunctions(
            hub.getContractAddress("ServiceAgreementHelperFunctions")
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
        if (args.assetCreator == address(0x0)) revert ServiceAgreementErrorsV1U1.EmptyAssetCreatorAddress();
        if (args.epochsNumber == 0) revert ServiceAgreementErrorsV1U1.ZeroEpochsNumber();
        if (args.tokenAmount == 0) revert ServiceAgreementErrorsV1U1.ZeroTokenAmount();
        if (!scoringProxy.isScoreFunction(args.scoreFunctionId))
            revert ServiceAgreementErrorsV1U1.ScoreFunctionDoesntExist(args.scoreFunctionId);

        bytes32 agreementId = serviceAgreementHelperFunctions.generateAgreementId(
            args.assetContract,
            args.tokenId,
            args.keyword,
            args.hashFunctionId
        );

        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;
        ParametersStorage params = parametersStorage;

        sasProxy.createV1U1ServiceAgreementObject(
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

        tknc.transferFrom(args.assetCreator, sasProxy.agreementV1U1StorageAddress(), args.tokenAmount);

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

    function terminateAgreement(
        address assetOwner,
        address assetContract,
        uint256 tokenId,
        bytes calldata keyword,
        uint8 hashFunctionId
    ) external onlyContracts {
        if (assetOwner == address(0x0)) revert ServiceAgreementErrorsV1U1.EmptyAssetCreatorAddress();

        bytes32 agreementId = serviceAgreementHelperFunctions.generateAgreementId(
            assetContract,
            tokenId,
            keyword,
            hashFunctionId
        );

        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;

        uint96 agreementBalance = sasProxy.getAgreementTokenAmount(agreementId);
        sasProxy.deleteServiceAgreementObject(agreementId);
        sasProxy.transferV1U1AgreementTokens(assetOwner, agreementBalance);

        emit ServiceAgreementV1Terminated(assetContract, tokenId, keyword, hashFunctionId);
    }

    function extendStoringPeriod(
        address assetOwner,
        address assetContract,
        uint256 tokenId,
        bytes calldata keyword,
        uint8 hashFunctionId,
        uint16 epochsNumber,
        uint96 tokenAmount
    ) external onlyContracts {
        if (epochsNumber == 0) revert ServiceAgreementErrorsV1U1.ZeroEpochsNumber();

        _addTokens(assetOwner, tokenAmount);

        bytes32 agreementId = serviceAgreementHelperFunctions.generateAgreementId(
            assetContract,
            tokenId,
            keyword,
            hashFunctionId
        );

        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;
        sasProxy.setAgreementEpochsNumber(agreementId, sasProxy.getAgreementEpochsNumber(agreementId) + epochsNumber);
        sasProxy.setAgreementTokenAmount(agreementId, sasProxy.getAgreementTokenAmount(agreementId) + tokenAmount);

        emit ServiceAgreementV1Extended(assetContract, tokenId, keyword, hashFunctionId, epochsNumber);
    }

    function addTokens(
        address assetOwner,
        address assetContract,
        uint256 tokenId,
        bytes calldata keyword,
        uint8 hashFunctionId,
        uint96 tokenAmount
    ) external onlyContracts {
        _addTokens(assetOwner, tokenAmount);

        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;
        bytes32 agreementId = serviceAgreementHelperFunctions.generateAgreementId(
            assetContract,
            tokenId,
            keyword,
            hashFunctionId
        );
        sasProxy.setAgreementTokenAmount(agreementId, sasProxy.getAgreementTokenAmount(agreementId) + tokenAmount);

        emit ServiceAgreementV1RewardRaised(assetContract, tokenId, keyword, hashFunctionId, tokenAmount);
    }

    function addUpdateTokens(
        address assetOwner,
        address assetContract,
        uint256 tokenId,
        bytes calldata keyword,
        uint8 hashFunctionId,
        uint96 tokenAmount
    ) external onlyContracts {
        _addTokens(assetOwner, tokenAmount);

        bytes32 agreementId = serviceAgreementHelperFunctions.generateAgreementId(
            assetContract,
            tokenId,
            keyword,
            hashFunctionId
        );
        serviceAgreementStorageProxy.setAgreementUpdateTokenAmount(agreementId, tokenAmount);

        emit ServiceAgreementV1UpdateRewardRaised(assetContract, tokenId, keyword, hashFunctionId, tokenAmount);
    }

    function isCommitWindowOpen(bytes32 agreementId, uint16 epoch) public view returns (bool) {
        if (serviceAgreementStorageProxy.isV1U1Agreement(agreementId)) {
            return commitManagerV1U1.isCommitWindowOpen(agreementId, epoch);
        } else {
            return commitManagerV1.isCommitWindowOpen(agreementId, epoch);
        }
    }

    function getTopCommitSubmissions(
        bytes32 agreementId,
        uint16 epoch
    ) external view returns (ServiceAgreementStructsV1.CommitSubmission[] memory) {
        if (serviceAgreementStorageProxy.isV1U1Agreement(agreementId)) {
            return commitManagerV1U1.getTopCommitSubmissions(agreementId, epoch, 0);
        } else {
            return commitManagerV1.getTopCommitSubmissions(agreementId, epoch);
        }
    }

    function submitCommit(ServiceAgreementStructsV1.CommitInputArgs calldata args) external {
        bytes32 agreementId = serviceAgreementHelperFunctions.generateAgreementId(
            args.assetContract,
            args.tokenId,
            args.keyword,
            args.hashFunctionId
        );

        if (serviceAgreementStorageProxy.isV1U1Agreement(agreementId)) {
            commitManagerV1U1.submitCommit(args);
        } else {
            commitManagerV1.submitCommit(args);
        }
    }

    function isProofWindowOpen(bytes32 agreementId, uint16 epoch) public view returns (bool) {
        if (serviceAgreementStorageProxy.isV1U1Agreement(agreementId)) {
            return proofManagerV1U1.isProofWindowOpen(agreementId, epoch);
        } else {
            return proofManagerV1.isProofWindowOpen(agreementId, epoch);
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
        bytes32 agreementId = serviceAgreementHelperFunctions.generateAgreementId(
            args.assetContract,
            args.tokenId,
            args.keyword,
            args.hashFunctionId
        );

        if (serviceAgreementStorageProxy.isV1U1Agreement(agreementId)) {
            proofManagerV1U1.sendProof(args);
        } else {
            proofManagerV1.sendProof(args);
        }
    }

    function _addTokens(address assetOwner, uint96 tokenAmount) internal virtual {
        if (assetOwner == address(0x0)) revert ServiceAgreementErrorsV1U1.EmptyAssetCreatorAddress();
        if (tokenAmount == 0) revert ServiceAgreementErrorsV1U1.ZeroTokenAmount();

        IERC20 tknc = tokenContract;

        if (tknc.allowance(assetOwner, address(this)) < tokenAmount)
            revert ServiceAgreementErrorsV1U1.TooLowAllowance(tknc.allowance(assetOwner, address(this)));
        if (tknc.balanceOf(assetOwner) < tokenAmount)
            revert ServiceAgreementErrorsV1U1.TooLowBalance(tknc.balanceOf(assetOwner));

        tknc.transferFrom(assetOwner, serviceAgreementStorageProxy.agreementV1U1StorageAddress(), tokenAmount);
    }

    function _generatePseudorandomUint8(address sender, uint8 limit) internal view virtual returns (uint8) {
        return uint8(uint256(keccak256(abi.encodePacked(block.timestamp, sender, block.number))) % limit);
    }

    function _checkHubOwner() internal view virtual {
        if (msg.sender != hub.owner()) revert GeneralErrors.OnlyHubOwnerFunction(msg.sender);
    }

    function _checkHub() internal view virtual {
        if (!hub.isContract(msg.sender)) revert GeneralErrors.OnlyHubContractsFunction(msg.sender);
    }
}
