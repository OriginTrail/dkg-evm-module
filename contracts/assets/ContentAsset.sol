// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import {Assertion} from "../Assertion.sol";
import {AssertionStorage} from "../storage/AssertionStorage.sol";
import {Hub} from "../Hub.sol";
import {ServiceAgreementV1} from "../ServiceAgreementV1.sol";
import {Named} from "../interface/Named.sol";
import {Versioned} from "../interface/Versioned.sol";
import {ContentAssetStorage} from "../storage/assets/ContentAssetStorage.sol";
import {ParametersStorage} from "../storage/ParametersStorage.sol";
import {ServiceAgreementStorageProxy} from "../storage/ServiceAgreementStorageProxy.sol";
import {UnfinalizedStateStorage} from "../storage/UnfinalizedStateStorage.sol";
import {ContentAssetStructs} from "../structs/assets/ContentAssetStructs.sol";
import {ServiceAgreementStructsV1} from "../structs/ServiceAgreementStructsV1.sol";
import {ServiceAgreementErrorsV1} from "../errors/ServiceAgreementErrorsV1.sol";

contract ContentAsset is Named, Versioned {
    event AssetMinted(address indexed assetContract, uint256 indexed tokenId, bytes32 indexed state);
    event AssetBurnt(
        address indexed assetContract,
        uint256 indexed tokenId,
        bytes32 indexed state,
        uint96 returnedTokenAmount
    );
    event AssetStateUpdated(
        address indexed assetContract,
        uint256 indexed tokenId,
        bytes32 indexed state,
        uint96 addedTokenAmount
    );
    event AssetStateUpdateCanceled(
        address indexed assetContract,
        uint256 indexed tokenId,
        bytes32 indexed state,
        uint96 returnedTokenAmount
    );
    event AssetStoringPeriodExtended(
        address indexed assetContract,
        uint256 indexed tokenId,
        uint16 epochsNumber,
        uint96 tokenAmount
    );
    event AssetPaymentIncreased(address indexed assetContract, uint256 indexed tokenId, uint96 tokenAmount);
    event AssetUpdatePaymentIncreased(address indexed assetContract, uint256 indexed tokenId, uint96 tokenAmount);

    string private constant _NAME = "ContentAsset";
    string private constant _VERSION = "1.0.0";

    Hub public hub;
    Assertion public assertionContract;
    AssertionStorage public assertionStorage;
    ContentAssetStorage public contentAssetStorage;
    ParametersStorage public parametersStorage;
    ServiceAgreementStorageProxy public serviceAgreementStorageProxy;
    ServiceAgreementV1 public serviceAgreementV1;
    UnfinalizedStateStorage public unfinalizedStateStorage;

    constructor(address hubAddress) {
        require(hubAddress != address(0), "Hub Address cannot be 0x0");

        hub = Hub(hubAddress);
        initialize();
    }

    function initialize() public onlyHubOwner {
        assertionContract = Assertion(hub.getContractAddress("Assertion"));
        assertionStorage = AssertionStorage(hub.getContractAddress("AssertionStorage"));
        contentAssetStorage = ContentAssetStorage(hub.getAssetStorageAddress("ContentAssetStorage"));
        parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));
        serviceAgreementStorageProxy = ServiceAgreementStorageProxy(
            hub.getContractAddress("ServiceAgreementStorageProxy")
        );
        serviceAgreementV1 = ServiceAgreementV1(hub.getContractAddress("ServiceAgreementV1"));
        unfinalizedStateStorage = UnfinalizedStateStorage(hub.getContractAddress("UnfinalizedStateStorage"));
    }

    modifier onlyHubOwner() {
        _checkHubOwner();
        _;
    }

    modifier onlyAssetOwner(uint256 tokenId) {
        _checkAssetOwner(tokenId);
        _;
    }

    modifier onlyMutable(uint256 tokenId) {
        _checkMutability(tokenId);
        _;
    }

    function name() external pure override returns (string memory) {
        return _NAME;
    }

    function version() external pure override returns (string memory) {
        return _VERSION;
    }

    function createAsset(ContentAssetStructs.AssetInputArgs calldata args) external {
        _createAsset(
            args.assertionId,
            args.size,
            args.triplesNumber,
            args.chunksNumber,
            args.epochsNumber,
            args.tokenAmount,
            args.scoreFunctionId,
            args.immutable_
        );
    }

    function createAssetWithVariables(
        bytes32 assertionId,
        uint128 size,
        uint32 triplesNumber,
        uint96 chunksNumber,
        uint16 epochsNumber,
        uint96 tokenAmount,
        uint8 scoreFunctionId,
        bool immutable_
    ) external {
        _createAsset(
            assertionId,
            size,
            triplesNumber,
            chunksNumber,
            epochsNumber,
            tokenAmount,
            scoreFunctionId,
            immutable_
        );
    }

    function burnAsset(uint256 tokenId) external onlyAssetOwner(tokenId) {
        ContentAssetStorage cas = contentAssetStorage;
        address contentAssetStorageAddress = address(cas);

        ServiceAgreementV1 sasV1 = serviceAgreementV1;

        bytes memory keyword = abi.encodePacked(
            contentAssetStorageAddress,
            contentAssetStorage.getAssertionIdByIndex(tokenId, 0)
        );
        bytes32 agreementId = sasV1.generateAgreementId(contentAssetStorageAddress, tokenId, keyword, 1);
        bytes32 unfinalizedState = unfinalizedStateStorage.getUnfinalizedState(tokenId);

        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;

        if (
            (sasProxy.getAgreementStartTime(agreementId) + sasProxy.getAgreementEpochLength(agreementId)) <
            block.timestamp
        ) {
            revert ServiceAgreementErrorsV1.FirstEpochHasAlreadyEnded(agreementId);
        } else if (unfinalizedState != bytes32(0)) {
            revert ServiceAgreementErrorsV1.UpdateIsNotFinalized(contentAssetStorageAddress, tokenId, unfinalizedState);
        }

        uint96 tokenAmount = sasProxy.getAgreementTokenAmount(agreementId);

        bytes32 originalAssertionId = cas.getAssertionIdByIndex(tokenId, 0);

        cas.deleteAsset(tokenId);
        cas.burn(tokenId);
        sasV1.terminateAgreement(
            msg.sender,
            contentAssetStorageAddress,
            tokenId,
            abi.encodePacked(contentAssetStorageAddress, originalAssertionId),
            1
        );

        emit AssetBurnt(contentAssetStorageAddress, tokenId, originalAssertionId, tokenAmount);
    }

    function updateAssetState(
        uint256 tokenId,
        bytes32 assertionId,
        uint128 size,
        uint32 triplesNumber,
        uint96 chunksNumber,
        uint96 tokenAmount
    ) external onlyAssetOwner(tokenId) onlyMutable(tokenId) {
        ContentAssetStorage cas = contentAssetStorage;
        UnfinalizedStateStorage uss = unfinalizedStateStorage;

        address contentAssetStorageAddress = address(cas);

        bytes32 unfinalizedState = uss.getUnfinalizedState(tokenId);

        if (unfinalizedState != bytes32(0)) {
            revert ServiceAgreementErrorsV1.UpdateIsNotFinalized(contentAssetStorageAddress, tokenId, unfinalizedState);
        }

        assertionContract.createAssertion(assertionId, size, triplesNumber, chunksNumber);
        uss.setUnfinalizedState(tokenId, assertionId);
        uss.setIssuer(tokenId, msg.sender);

        ServiceAgreementV1 sasV1 = serviceAgreementV1;

        bytes memory keyword = abi.encodePacked(
            contentAssetStorageAddress,
            contentAssetStorage.getAssertionIdByIndex(tokenId, 0)
        );

        sasV1.addAddedTokens(msg.sender, contentAssetStorageAddress, tokenId, keyword, 1, tokenAmount);

        bytes32 agreementId = serviceAgreementV1.generateAgreementId(contentAssetStorageAddress, tokenId, keyword, 1);
        serviceAgreementStorageProxy.setUpdateCommitsDeadline(
            keccak256(abi.encodePacked(agreementId, assertionId)),
            block.timestamp + parametersStorage.updateCommitWindowDuration()
        );

        emit AssetStateUpdated(contentAssetStorageAddress, tokenId, assertionId, tokenAmount);
    }

    function cancelAssetStateUpdate(uint256 tokenId) external onlyAssetOwner(tokenId) {
        ContentAssetStorage cas = contentAssetStorage;
        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;
        UnfinalizedStateStorage uss = unfinalizedStateStorage;

        address contentAssetStorageAddress = address(cas);

        bytes memory keyword = abi.encodePacked(contentAssetStorageAddress, cas.getAssertionIdByIndex(tokenId, 0));
        bytes32 agreementId = serviceAgreementV1.generateAgreementId(contentAssetStorageAddress, tokenId, keyword, 1);
        bytes32 unfinalizedState = uss.getUnfinalizedState(tokenId);

        if (unfinalizedState == bytes32(0)) {
            revert ServiceAgreementErrorsV1.NoPendingUpdate(contentAssetStorageAddress, tokenId);
        } else if (
            block.timestamp <=
            sasProxy.getUpdateCommitsDeadline(keccak256(abi.encodePacked(agreementId, unfinalizedState)))
        ) {
            revert ServiceAgreementErrorsV1.PendingUpdateFinalization(
                contentAssetStorageAddress,
                tokenId,
                unfinalizedState
            );
        }

        uint96 addedTokenAmount = sasProxy.getAgreementAddedTokenAmount(agreementId);
        sasProxy.transferAgreementTokens(msg.sender, addedTokenAmount);

        assertionStorage.deleteAssertion(unfinalizedState);

        uss.deleteIssuer(tokenId);
        uss.deleteUnfinalizedState(tokenId);

        emit AssetStateUpdateCanceled(contentAssetStorageAddress, tokenId, unfinalizedState, addedTokenAmount);
    }

    function updateAssetStoringPeriod(
        uint256 tokenId,
        uint16 epochsNumber,
        uint96 tokenAmount
    ) external onlyAssetOwner(tokenId) {
        ContentAssetStorage cas = contentAssetStorage;
        ServiceAgreementV1 sasV1 = serviceAgreementV1;

        address contentAssetStorageAddress = address(cas);

        sasV1.extendStoringPeriod(
            msg.sender,
            contentAssetStorageAddress,
            tokenId,
            abi.encodePacked(contentAssetStorageAddress, cas.getAssertionIdByIndex(tokenId, 0)),
            1,
            epochsNumber,
            tokenAmount
        );

        emit AssetStoringPeriodExtended(contentAssetStorageAddress, tokenId, epochsNumber, tokenAmount);
    }

    function updateAssetTokenAmount(uint256 tokenId, uint96 tokenAmount) external onlyAssetOwner(tokenId) {
        ContentAssetStorage cas = contentAssetStorage;
        ServiceAgreementV1 sasV1 = serviceAgreementV1;

        address contentAssetStorageAddress = address(cas);

        sasV1.addTokens(
            msg.sender,
            contentAssetStorageAddress,
            tokenId,
            abi.encodePacked(contentAssetStorageAddress, cas.getAssertionIdByIndex(tokenId, 0)),
            1,
            tokenAmount
        );

        emit AssetPaymentIncreased(contentAssetStorageAddress, tokenId, tokenAmount);
    }

    function updateAssetAddedTokenAmount(uint256 tokenId, uint96 tokenAmount) external onlyAssetOwner(tokenId) {
        ContentAssetStorage cas = contentAssetStorage;
        ServiceAgreementV1 sasV1 = serviceAgreementV1;

        address contentAssetStorageAddress = address(cas);

        bytes32 unfinalizedState = unfinalizedStateStorage.getUnfinalizedState(tokenId);

        if (unfinalizedState == bytes32(0)) {
            revert ServiceAgreementErrorsV1.NoPendingUpdate(contentAssetStorageAddress, tokenId);
        }

        sasV1.addAddedTokens(
            msg.sender,
            contentAssetStorageAddress,
            tokenId,
            abi.encodePacked(contentAssetStorageAddress, cas.getAssertionIdByIndex(tokenId, 0)),
            1,
            tokenAmount
        );

        emit AssetUpdatePaymentIncreased(contentAssetStorageAddress, tokenId, tokenAmount);
    }

    function _createAsset(
        bytes32 assertionId,
        uint128 size,
        uint32 triplesNumber,
        uint96 chunksNumber,
        uint16 epochsNumber,
        uint96 tokenAmount,
        uint8 scoreFunctionId,
        bool immutable_
    ) internal virtual {
        ContentAssetStorage cas = contentAssetStorage;

        uint256 tokenId = cas.generateTokenId();
        cas.mint(msg.sender, tokenId);

        assertionContract.createAssertion(assertionId, size, triplesNumber, chunksNumber);
        cas.setAssertionIssuer(tokenId, assertionId, msg.sender);
        cas.setMutability(tokenId, immutable_);
        cas.pushAssertionId(tokenId, assertionId);

        address contentAssetStorageAddress = address(cas);

        serviceAgreementV1.createServiceAgreement(
            ServiceAgreementStructsV1.ServiceAgreementInputArgs({
                assetCreator: msg.sender,
                assetContract: contentAssetStorageAddress,
                tokenId: tokenId,
                keyword: abi.encodePacked(contentAssetStorageAddress, assertionId),
                hashFunctionId: 1, // hashFunctionId | 1 = sha256
                epochsNumber: epochsNumber,
                tokenAmount: tokenAmount,
                scoreFunctionId: scoreFunctionId
            })
        );

        emit AssetMinted(contentAssetStorageAddress, tokenId, assertionId);
    }

    function _checkHubOwner() internal view virtual {
        require(msg.sender == hub.owner(), "Fn can only be used by hub owner");
    }

    function _checkAssetOwner(uint256 tokenId) internal view virtual {
        require(msg.sender == contentAssetStorage.ownerOf(tokenId), "Only asset owner can use this fn");
    }

    function _checkMutability(uint256 tokenId) internal view virtual {
        require(contentAssetStorage.isMutable(tokenId), "Asset is immutable");
    }
}
