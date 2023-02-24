// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import {HashingProxy} from "./HashingProxy.sol";
import {Hub} from "./Hub.sol";
import {ScoringProxy} from "./ScoringProxy.sol";
import {ParametersStorage} from "./storage/ParametersStorage.sol";
import {ServiceAgreementStorageProxy} from "./storage/ServiceAgreementStorageProxy.sol";
import {Named} from "./interface/Named.sol";
import {Versioned} from "./interface/Versioned.sol";
import {ServiceAgreementStructsV1} from "./structs/ServiceAgreementStructsV1.sol";
import {GeneralErrors} from "./errors/GeneralErrors.sol";
import {ServiceAgreementErrorsV1} from "./errors/ServiceAgreementErrorsV1.sol";
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
    event ServiceAgreementV1Updated(
        address indexed assetContract,
        uint256 indexed tokenId,
        bytes keyword,
        uint8 hashFunctionId,
        uint16 epochsNumber,
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

    string private constant _NAME = "ServiceAgreementV1";
    string private constant _VERSION = "1.1.0";

    Hub public hub;
    HashingProxy public hashingProxy;
    ScoringProxy public scoringProxy;
    ParametersStorage public parametersStorage;
    ServiceAgreementStorageProxy public serviceAgreementStorageProxy;
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
        if (args.assetCreator == address(0x0)) revert ServiceAgreementErrorsV1.EmptyAssetCreatorAddress();
        if (!hub.isAssetStorage(args.assetContract))
            revert ServiceAgreementErrorsV1.AssetStorgeNotInTheHub(args.assetContract);
        if (keccak256(args.keyword) == keccak256("")) revert ServiceAgreementErrorsV1.EmptyKeyword();
        if (args.epochsNumber == 0) revert ServiceAgreementErrorsV1.ZeroEpochsNumber();
        if (args.tokenAmount == 0) revert ServiceAgreementErrorsV1.ZeroTokenAmount();
        if (!scoringProxy.isScoreFunction(args.scoreFunctionId))
            revert ServiceAgreementErrorsV1.ScoreFunctionDoesntExist(args.scoreFunctionId);

        bytes32 agreementId = generateAgreementId(args.assetContract, args.tokenId, args.keyword, args.hashFunctionId);

        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;
        ParametersStorage params = parametersStorage;

        sasProxy.createServiceAgreementObject(
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

        tknc.transferFrom(args.assetCreator, sasProxy.lastestStorageAddress(), args.tokenAmount);

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
        if (assetOwner == address(0x0)) revert ServiceAgreementErrorsV1.EmptyAssetCreatorAddress();
        if (!hub.isAssetStorage(assetContract)) revert ServiceAgreementErrorsV1.AssetStorgeNotInTheHub(assetContract);
        if (keccak256(keyword) == keccak256("")) revert ServiceAgreementErrorsV1.EmptyKeyword();

        bytes32 agreementId = generateAgreementId(assetContract, tokenId, keyword, hashFunctionId);

        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;

        uint96 agreementBalance = sasProxy.getAgreementTokenAmount(agreementId);
        sasProxy.deleteServiceAgreementObject(agreementId);
        sasProxy.transferAgreementTokens(assetOwner, agreementBalance);

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
        if (assetOwner == address(0x0)) revert ServiceAgreementErrorsV1.EmptyAssetCreatorAddress();
        if (!hub.isAssetStorage(assetContract)) revert ServiceAgreementErrorsV1.AssetStorgeNotInTheHub(assetContract);
        if (keccak256(keyword) == keccak256("")) revert ServiceAgreementErrorsV1.EmptyKeyword();
        if (epochsNumber == 0) revert ServiceAgreementErrorsV1.ZeroEpochsNumber();
        if (tokenAmount == 0) revert ServiceAgreementErrorsV1.ZeroTokenAmount();

        bytes32 agreementId = generateAgreementId(assetContract, tokenId, keyword, hashFunctionId);

        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;
        sasProxy.setAgreementEpochsNumber(agreementId, sasProxy.getAgreementEpochsNumber(agreementId) + epochsNumber);
        _addTokens(assetOwner, agreementId, tokenAmount);

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
        if (assetOwner == address(0x0)) revert ServiceAgreementErrorsV1.EmptyAssetCreatorAddress();
        if (!hub.isAssetStorage(assetContract)) revert ServiceAgreementErrorsV1.AssetStorgeNotInTheHub(assetContract);
        if (keccak256(keyword) == keccak256("")) revert ServiceAgreementErrorsV1.EmptyKeyword();
        if (tokenAmount == 0) revert ServiceAgreementErrorsV1.ZeroTokenAmount();

        bytes32 agreementId = generateAgreementId(assetContract, tokenId, keyword, hashFunctionId);

        _addTokens(assetOwner, agreementId, tokenAmount);

        emit ServiceAgreementV1RewardRaised(assetContract, tokenId, keyword, hashFunctionId, tokenAmount);
    }

    function generateAgreementId(
        address assetContract,
        uint256 tokenId,
        bytes calldata keyword,
        uint8 hashFunctionId
    ) public view virtual returns (bytes32) {
        return hashingProxy.callHashFunction(hashFunctionId, abi.encodePacked(assetContract, tokenId, keyword));
    }

    function _addTokens(address assetOwner, bytes32 agreementId, uint96 tokenAmount) internal virtual {
        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;
        IERC20 tknc = tokenContract;

        if (tknc.allowance(assetOwner, address(this)) < tokenAmount)
            revert ServiceAgreementErrorsV1.TooLowAllowance(tknc.allowance(assetOwner, address(this)));
        if (tknc.balanceOf(assetOwner) < tokenAmount)
            revert ServiceAgreementErrorsV1.TooLowBalance(tknc.balanceOf(assetOwner));

        sasProxy.setAgreementTokenAmount(agreementId, sasProxy.getAgreementTokenAmount(agreementId) + tokenAmount);
        tknc.transferFrom(assetOwner, sasProxy.lastestStorageAddress(), tokenAmount);
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
