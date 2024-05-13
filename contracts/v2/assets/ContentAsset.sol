// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {Assertion} from "../../v1/Assertion.sol";
import {HashingProxy} from "../../v1/HashingProxy.sol";
import {ServiceAgreementV1} from "../../v1/ServiceAgreementV1.sol";
import {ContentAssetStorage} from "../storage/assets/ContentAssetStorage.sol";
import {ParametersStorage} from "../../v1/storage/ParametersStorage.sol";
import {ParanetKnowledgeAssetsRegistry} from "../storage/paranets/ParanetKnowledgeAssetsRegistry.sol";
import {ParanetKnowledgeMinersRegistry} from "../storage/paranets/ParanetKnowledgeMinersRegistry.sol";
import {ParanetsRegistry} from "../storage/paranets/ParanetsRegistry.sol";
import {ServiceAgreementStorageProxy} from "../../v1/storage/ServiceAgreementStorageProxy.sol";
import {UnfinalizedStateStorage} from "../../v1/storage/UnfinalizedStateStorage.sol";
import {HubDependentV2} from "../abstract/HubDependent.sol";
import {Initializable} from "../../v1/interface/Initializable.sol";
import {Named} from "../../v1/interface/Named.sol";
import {Versioned} from "../../v1/interface/Versioned.sol";
import {ContentAssetStructs} from "../../v1/structs/assets/ContentAssetStructs.sol";
import {ServiceAgreementStructsV1} from "../../v1/structs/ServiceAgreementStructsV1.sol";
import {ContentAssetErrors} from "../errors/assets/ContentAssetErrors.sol";
import {HASH_FUNCTION_ID} from "../../v1/constants/assets/ContentAssetConstants.sol";
import {LOG2PLDSF_ID, LINEAR_SUM_ID} from "../../v1/constants/ScoringConstants.sol";

contract ContentAssetV2 is Named, Versioned, HubDependentV2, Initializable {
    event AssetMinted(address indexed assetContract, uint256 indexed tokenId, bytes32 indexed state);
    event AssetBurnt(address indexed assetContract, uint256 indexed tokenId, uint96 returnedTokenAmount);
    event AssetStateUpdated(
        address indexed assetContract,
        uint256 indexed tokenId,
        uint256 indexed stateIndex,
        uint96 updateTokenAmount
    );
    event AssetStateUpdateCanceled(
        address indexed assetContract,
        uint256 indexed tokenId,
        uint256 indexed stateIndex,
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
    string private constant _VERSION = "2.1.0";

    Assertion public assertionContract;
    HashingProxy public hashingProxy;
    ContentAssetStorage public contentAssetStorage;
    ParametersStorage public parametersStorage;
    ParanetKnowledgeAssetsRegistry public paranetKnowledgeAssetsRegistry;
    ParanetKnowledgeMinersRegistry public paranetKnowledgeMinersRegistry;
    ParanetsRegistry public paranetsRegistry;
    ServiceAgreementStorageProxy public serviceAgreementStorageProxy;
    ServiceAgreementV1 public serviceAgreementV1;
    UnfinalizedStateStorage public unfinalizedStateStorage;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) HubDependentV2(hubAddress) {}

    function initialize() public onlyHubOwner {
        assertionContract = Assertion(hub.getContractAddress("Assertion"));
        hashingProxy = HashingProxy(hub.getContractAddress("HashingProxy"));
        contentAssetStorage = ContentAssetStorage(hub.getAssetStorageAddress("ContentAssetStorage"));
        parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));
        paranetKnowledgeAssetsRegistry = ParanetKnowledgeAssetsRegistry(
            hub.getContractAddress("ParanetKnowledgeAssetsRegistry")
        );
        paranetKnowledgeMinersRegistry = ParanetKnowledgeMinersRegistry(
            hub.getContractAddress("ParanetKnowledgeMinersRegistry")
        );
        paranetsRegistry = ParanetsRegistry(hub.getContractAddress("ParanetsRegistry"));
        serviceAgreementStorageProxy = ServiceAgreementStorageProxy(
            hub.getContractAddress("ServiceAgreementStorageProxy")
        );
        serviceAgreementV1 = ServiceAgreementV1(hub.getContractAddress("ServiceAgreementV1"));
        unfinalizedStateStorage = UnfinalizedStateStorage(hub.getContractAddress("UnfinalizedStateStorage"));
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

    function createAsset(ContentAssetStructs.AssetInputArgs calldata args) external returns (uint256) {
        return
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
    ) external returns (uint256) {
        return
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

    function createAsset(
        ContentAssetStructs.AssetInputArgs calldata args,
        address knowledgeMiner
    ) external returns (uint256) {
        return
            _createAsset(
                args.assertionId,
                args.size,
                args.triplesNumber,
                args.chunksNumber,
                args.epochsNumber,
                args.tokenAmount,
                args.scoreFunctionId,
                args.immutable_,
                knowledgeMiner
            );
    }

    function burnAsset(uint256 tokenId) external onlyAssetOwner(tokenId) {
        ContentAssetStorage cas = contentAssetStorage;

        address contentAssetStorageAddress = address(cas);

        bytes memory keyword = abi.encodePacked(contentAssetStorageAddress, cas.getAssertionIdByIndex(tokenId, 0));

        bytes32 agreementId = hashingProxy.callHashFunction(
            HASH_FUNCTION_ID,
            abi.encodePacked(contentAssetStorageAddress, tokenId, keyword)
        );

        bytes32 unfinalizedState = unfinalizedStateStorage.getUnfinalizedState(tokenId);

        if (unfinalizedState != bytes32(0)) {
            revert ContentAssetErrors.UpdateIsNotFinalized(contentAssetStorageAddress, tokenId, unfinalizedState);
        }

        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;
        ParametersStorage params = parametersStorage;

        uint256 timeNow = block.timestamp;
        uint256 epochStart = sasProxy.getAgreementStartTime(agreementId);
        uint256 commitPhaseEnd = epochStart +
            (sasProxy.getAgreementEpochLength(agreementId) * params.commitWindowDurationPerc()) /
            100;
        uint256 epochEnd = epochStart + sasProxy.getAgreementEpochLength(agreementId);
        uint16 epoch = 0;
        uint8 commitsCount = sasProxy.getCommitsCount(
            keccak256(abi.encodePacked(agreementId, epoch, cas.getAssertionIdsLength(tokenId) - 1))
        );
        uint32 r0 = params.r0();

        if ((timeNow < commitPhaseEnd) && (commitsCount < r0)) {
            revert ContentAssetErrors.CommitPhaseOngoing(agreementId);
        } else if ((timeNow < epochEnd) && (commitsCount >= r0)) {
            revert ContentAssetErrors.CommitPhaseSucceeded(agreementId);
        } else if (timeNow > epochEnd) {
            revert ContentAssetErrors.FirstEpochHasAlreadyEnded(agreementId);
        }

        ParanetKnowledgeAssetsRegistry pkar = paranetKnowledgeAssetsRegistry;

        if (pkar.isParanetKnowledgeAsset(keccak256(abi.encodePacked(contentAssetStorageAddress, tokenId)))) {
            ParanetKnowledgeMinersRegistry pkmr = paranetKnowledgeMinersRegistry;
            ParanetsRegistry pr = paranetsRegistry;

            bytes32 paranetId = pkar.getParanetId(keccak256(abi.encodePacked(contentAssetStorageAddress, tokenId)));
            uint96 tokenAmount = sasProxy.getAgreementTokenAmount(agreementId);

            // Remove Knowledge Asset from the KnowledgeAssetsRegistry
            pkar.removeKnowledgeAsset(keccak256(abi.encodePacked(contentAssetStorageAddress, tokenId)));

            // Remove Knowledge Asset Metadata from the KnowledgeMinersRegistry
            pkmr.removeSubmittedKnowledgeAsset(
                msg.sender,
                paranetId,
                keccak256(abi.encodePacked(contentAssetStorageAddress, tokenId))
            );
            pkmr.subCumulativeTracSpent(msg.sender, paranetId, tokenAmount);
            pkmr.subUnrewardedTracSpent(msg.sender, paranetId, tokenAmount);
            pkmr.decrementTotalSubmittedKnowledgeAssetsCount(msg.sender);
            pkmr.subTotalTracSpent(msg.sender, tokenAmount);

            // Remove Knowledge Asset Metadata from the ParanetsRegistry
            pr.removeKnowledgeAsset(paranetId, keccak256(abi.encodePacked(contentAssetStorageAddress, tokenId)));
            pr.subCumulativeKnowledgeValue(paranetId, tokenAmount);
        }

        cas.deleteAsset(tokenId);
        cas.burn(tokenId);
        serviceAgreementV1.terminateAgreement(msg.sender, agreementId);

        emit AssetBurnt(contentAssetStorageAddress, tokenId, sasProxy.getAgreementTokenAmount(agreementId));
    }

    function updateAssetState(
        uint256 tokenId,
        bytes32 assertionId,
        uint128 size,
        uint32 triplesNumber,
        uint96 chunksNumber,
        uint96 updateTokenAmount
    ) external onlyAssetOwner(tokenId) onlyMutable(tokenId) {
        ContentAssetStorage cas = contentAssetStorage;
        UnfinalizedStateStorage uss = unfinalizedStateStorage;
        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;

        address contentAssetStorageAddress = address(cas);

        bytes memory keyword = abi.encodePacked(contentAssetStorageAddress, cas.getAssertionIdByIndex(tokenId, 0));

        bytes32 agreementId = hashingProxy.callHashFunction(
            HASH_FUNCTION_ID,
            abi.encodePacked(contentAssetStorageAddress, tokenId, keyword)
        );

        uint256 startTime;
        uint16 epochsNumber;
        uint128 epochLength;
        uint8[2] memory scoreFunctionIdAndProofWindowOffsetPerc;
        (startTime, epochsNumber, epochLength, , scoreFunctionIdAndProofWindowOffsetPerc) = sasProxy.getAgreementData(
            agreementId
        );

        if (block.timestamp > startTime + epochsNumber * epochLength) {
            revert ContentAssetErrors.AssetExpired(tokenId);
        }

        bytes32 unfinalizedState = uss.getUnfinalizedState(tokenId);

        if (unfinalizedState != bytes32(0)) {
            revert ContentAssetErrors.UpdateIsNotFinalized(contentAssetStorageAddress, tokenId, unfinalizedState);
        }

        ParanetKnowledgeAssetsRegistry pkar = paranetKnowledgeAssetsRegistry;

        if (pkar.isParanetKnowledgeAsset(keccak256(abi.encodePacked(contentAssetStorageAddress, tokenId)))) {
            bytes32 paranetId = pkar.getParanetId(keccak256(abi.encodePacked(contentAssetStorageAddress, tokenId)));

            // Add Knowledge Asset to the UpdatingKnowledgeAssets in the KnowledgeMinersRegistry
            paranetKnowledgeMinersRegistry.addUpdatingKnowledgeAssetState(
                msg.sender,
                paranetId,
                contentAssetStorageAddress,
                tokenId,
                assertionId,
                updateTokenAmount
            );
        }

        assertionContract.createAssertion(assertionId, size, triplesNumber, chunksNumber);
        uss.setUnfinalizedState(tokenId, assertionId);
        uss.setIssuer(tokenId, msg.sender);

        if (!sasProxy.agreementV1U1Exists(agreementId)) {
            sasProxy.createV1U1ServiceAgreementObject(
                agreementId,
                startTime,
                epochsNumber,
                epochLength,
                0,
                scoreFunctionIdAndProofWindowOffsetPerc[0],
                scoreFunctionIdAndProofWindowOffsetPerc[1]
            );
        }

        if (updateTokenAmount != 0) {
            serviceAgreementV1.addUpdateTokens(msg.sender, agreementId, updateTokenAmount);
        }

        uint256 unfinalizedStateIndex = cas.getAssertionIdsLength(tokenId);
        sasProxy.setUpdateCommitsDeadline(
            keccak256(abi.encodePacked(agreementId, unfinalizedStateIndex)),
            block.timestamp + parametersStorage.updateCommitWindowDuration()
        );

        emit AssetStateUpdated(contentAssetStorageAddress, tokenId, unfinalizedStateIndex, updateTokenAmount);
    }

    function cancelAssetStateUpdate(uint256 tokenId) external onlyAssetOwner(tokenId) {
        ContentAssetStorage cas = contentAssetStorage;
        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;
        UnfinalizedStateStorage uss = unfinalizedStateStorage;

        address contentAssetStorageAddress = address(cas);

        bytes memory keyword = abi.encodePacked(contentAssetStorageAddress, cas.getAssertionIdByIndex(tokenId, 0));

        bytes32 agreementId = hashingProxy.callHashFunction(
            HASH_FUNCTION_ID,
            abi.encodePacked(contentAssetStorageAddress, tokenId, keyword)
        );

        uint256 startTime;
        uint16 epochsNumber;
        uint16 currentEpoch;
        uint128 epochLength;
        (startTime, epochsNumber, epochLength, , ) = sasProxy.getAgreementData(agreementId);

        if (block.timestamp > startTime + epochsNumber * epochLength) {
            revert ContentAssetErrors.AssetExpired(tokenId);
        }

        currentEpoch = uint16((block.timestamp - startTime) / epochLength);

        bytes32 unfinalizedState = uss.getUnfinalizedState(tokenId);
        uint256 unfinalizedStateIndex = cas.getAssertionIdsLength(tokenId);

        if (unfinalizedState == bytes32(0)) {
            revert ContentAssetErrors.NoPendingUpdate(contentAssetStorageAddress, tokenId);
        } else if (
            block.timestamp <=
            sasProxy.getUpdateCommitsDeadline(keccak256(abi.encodePacked(agreementId, unfinalizedStateIndex)))
        ) {
            revert ContentAssetErrors.PendingUpdateFinalization(
                contentAssetStorageAddress,
                tokenId,
                unfinalizedStateIndex
            );
        }

        ParanetKnowledgeAssetsRegistry pkar = paranetKnowledgeAssetsRegistry;

        if (pkar.isParanetKnowledgeAsset(keccak256(abi.encodePacked(contentAssetStorageAddress, tokenId)))) {
            bytes32 paranetId = pkar.getParanetId(keccak256(abi.encodePacked(contentAssetStorageAddress, tokenId)));

            // Remove Knowledge Asset from the UpdatingKnowledgeAssets in the KnowledgeMinersRegistry
            paranetKnowledgeMinersRegistry.removeUpdatingKnowledgeAssetState(
                msg.sender,
                paranetId,
                keccak256(abi.encodePacked(contentAssetStorageAddress, tokenId, unfinalizedState))
            );
        }

        uint96 updateTokenAmount = sasProxy.getAgreementUpdateTokenAmount(agreementId);

        if (sasProxy.agreementV1Exists(agreementId)) {
            sasProxy.deleteServiceAgreementV1U1Object(agreementId);
        } else {
            sasProxy.setAgreementUpdateTokenAmount(agreementId, 0);
        }

        sasProxy.deleteCommitsCount(keccak256(abi.encodePacked(agreementId, currentEpoch, unfinalizedStateIndex)));
        sasProxy.deleteUpdateCommitsDeadline(keccak256(abi.encodePacked(agreementId, unfinalizedStateIndex)));
        sasProxy.setV1U1AgreementEpochSubmissionHead(agreementId, currentEpoch, unfinalizedStateIndex, 0);

        sasProxy.transferV1U1AgreementTokens(msg.sender, updateTokenAmount);

        uss.deleteIssuer(tokenId);
        uss.deleteUnfinalizedState(tokenId);

        emit AssetStateUpdateCanceled(
            contentAssetStorageAddress,
            tokenId,
            cas.getAssertionIdsLength(tokenId),
            updateTokenAmount
        );
    }

    function extendAssetStoringPeriod(
        uint256 tokenId,
        uint16 epochsNumber,
        uint96 tokenAmount
    ) external onlyAssetOwner(tokenId) {
        ContentAssetStorage cas = contentAssetStorage;
        ServiceAgreementV1 sasV1 = serviceAgreementV1;

        address contentAssetStorageAddress = address(cas);

        bytes32 unfinalizedState = unfinalizedStateStorage.getUnfinalizedState(tokenId);

        if (unfinalizedState != bytes32(0)) {
            revert ContentAssetErrors.UpdateIsNotFinalized(contentAssetStorageAddress, tokenId, unfinalizedState);
        }

        bytes memory keyword = abi.encodePacked(contentAssetStorageAddress, cas.getAssertionIdByIndex(tokenId, 0));

        bytes32 agreementId = hashingProxy.callHashFunction(
            HASH_FUNCTION_ID,
            abi.encodePacked(contentAssetStorageAddress, tokenId, keyword)
        );

        uint256 startTime;
        uint16 oldEpochsNumber;
        uint128 epochLength;
        (startTime, oldEpochsNumber, epochLength, , ) = serviceAgreementStorageProxy.getAgreementData(agreementId);

        if (block.timestamp > startTime + oldEpochsNumber * epochLength) {
            revert ContentAssetErrors.AssetExpired(tokenId);
        }

        ParanetKnowledgeAssetsRegistry pkar = paranetKnowledgeAssetsRegistry;

        if (pkar.isParanetKnowledgeAsset(keccak256(abi.encodePacked(contentAssetStorageAddress, tokenId)))) {
            ParanetKnowledgeMinersRegistry pkmr = paranetKnowledgeMinersRegistry;

            bytes32 paranetId = pkar.getParanetId(keccak256(abi.encodePacked(contentAssetStorageAddress, tokenId)));

            // Add Knowledge Asset Token Amount Metadata to the ParanetsRegistry
            paranetsRegistry.addCumulativeKnowledgeValue(paranetId, tokenAmount);

            // Add Knowledge Asset Token Amount Metadata to the KnowledgeMinersRegistry
            pkmr.addCumulativeTracSpent(msg.sender, paranetId, tokenAmount);
            pkmr.addUnrewardedTracSpent(msg.sender, paranetId, tokenAmount);
            pkmr.addTotalTracSpent(msg.sender, tokenAmount);
        }

        sasV1.extendStoringPeriod(msg.sender, agreementId, epochsNumber, tokenAmount);

        emit AssetStoringPeriodExtended(contentAssetStorageAddress, tokenId, epochsNumber, tokenAmount);
    }

    function increaseAssetTokenAmount(uint256 tokenId, uint96 tokenAmount) external onlyAssetOwner(tokenId) {
        ContentAssetStorage cas = contentAssetStorage;
        ServiceAgreementV1 sasV1 = serviceAgreementV1;

        address contentAssetStorageAddress = address(cas);

        bytes32 unfinalizedState = unfinalizedStateStorage.getUnfinalizedState(tokenId);

        if (unfinalizedState != bytes32(0)) {
            revert ContentAssetErrors.UpdateIsNotFinalized(contentAssetStorageAddress, tokenId, unfinalizedState);
        }

        bytes memory keyword = abi.encodePacked(contentAssetStorageAddress, cas.getAssertionIdByIndex(tokenId, 0));

        bytes32 agreementId = hashingProxy.callHashFunction(
            HASH_FUNCTION_ID,
            abi.encodePacked(contentAssetStorageAddress, tokenId, keyword)
        );

        uint256 startTime;
        uint16 epochsNumber;
        uint128 epochLength;
        (startTime, epochsNumber, epochLength, , ) = serviceAgreementStorageProxy.getAgreementData(agreementId);

        if (block.timestamp > startTime + epochsNumber * epochLength) {
            revert ContentAssetErrors.AssetExpired(tokenId);
        }

        ParanetKnowledgeAssetsRegistry pkar = paranetKnowledgeAssetsRegistry;

        if (pkar.isParanetKnowledgeAsset(keccak256(abi.encodePacked(contentAssetStorageAddress, tokenId)))) {
            ParanetKnowledgeMinersRegistry pkmr = paranetKnowledgeMinersRegistry;

            bytes32 paranetId = pkar.getParanetId(keccak256(abi.encodePacked(contentAssetStorageAddress, tokenId)));

            // Add Knowledge Asset Token Amount Metadata to the ParanetsRegistry
            paranetsRegistry.addCumulativeKnowledgeValue(paranetId, tokenAmount);

            // Add Knowledge Asset Token Amount Metadata to the KnowledgeMinersRegistry
            pkmr.addCumulativeTracSpent(msg.sender, paranetId, tokenAmount);
            pkmr.addUnrewardedTracSpent(msg.sender, paranetId, tokenAmount);
            pkmr.addTotalTracSpent(msg.sender, tokenAmount);
        }

        sasV1.addTokens(msg.sender, agreementId, tokenAmount);

        emit AssetPaymentIncreased(contentAssetStorageAddress, tokenId, tokenAmount);
    }

    function increaseAssetUpdateTokenAmount(uint256 tokenId, uint96 tokenAmount) external onlyAssetOwner(tokenId) {
        ContentAssetStorage cas = contentAssetStorage;
        ServiceAgreementV1 sasV1 = serviceAgreementV1;

        address contentAssetStorageAddress = address(cas);

        bytes32 unfinalizedState = unfinalizedStateStorage.getUnfinalizedState(tokenId);

        if (unfinalizedState == bytes32(0)) {
            revert ContentAssetErrors.NoPendingUpdate(contentAssetStorageAddress, tokenId);
        }

        bytes memory keyword = abi.encodePacked(contentAssetStorageAddress, cas.getAssertionIdByIndex(tokenId, 0));

        bytes32 agreementId = hashingProxy.callHashFunction(
            HASH_FUNCTION_ID,
            abi.encodePacked(contentAssetStorageAddress, tokenId, keyword)
        );

        uint256 startTime;
        uint16 epochsNumber;
        uint128 epochLength;
        (startTime, epochsNumber, epochLength, , ) = serviceAgreementStorageProxy.getAgreementData(agreementId);

        if (block.timestamp > startTime + epochsNumber * epochLength) {
            revert ContentAssetErrors.AssetExpired(tokenId);
        }

        sasV1.addUpdateTokens(msg.sender, agreementId, tokenAmount);

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
    ) internal virtual returns (uint256) {
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
                hashFunctionId: HASH_FUNCTION_ID,
                epochsNumber: epochsNumber,
                tokenAmount: tokenAmount,
                scoreFunctionId: scoreFunctionId == LOG2PLDSF_ID ? LINEAR_SUM_ID : scoreFunctionId
            })
        );

        emit AssetMinted(contentAssetStorageAddress, tokenId, assertionId);

        return tokenId;
    }

    function _createAsset(
        bytes32 assertionId,
        uint128 size,
        uint32 triplesNumber,
        uint96 chunksNumber,
        uint16 epochsNumber,
        uint96 tokenAmount,
        uint8 scoreFunctionId,
        bool immutable_,
        address knowledgeMiner
    ) internal virtual returns (uint256) {
        ContentAssetStorage cas = contentAssetStorage;

        uint256 tokenId = cas.generateTokenId();
        cas.mint(knowledgeMiner, tokenId);

        assertionContract.createAssertion(assertionId, size, triplesNumber, chunksNumber);
        cas.setAssertionIssuer(tokenId, assertionId, knowledgeMiner);
        cas.setMutability(tokenId, immutable_);
        cas.pushAssertionId(tokenId, assertionId);

        address contentAssetStorageAddress = address(cas);

        serviceAgreementV1.createServiceAgreement(
            ServiceAgreementStructsV1.ServiceAgreementInputArgs({
                assetCreator: knowledgeMiner,
                assetContract: contentAssetStorageAddress,
                tokenId: tokenId,
                keyword: abi.encodePacked(contentAssetStorageAddress, assertionId),
                hashFunctionId: HASH_FUNCTION_ID,
                epochsNumber: epochsNumber,
                tokenAmount: tokenAmount,
                scoreFunctionId: scoreFunctionId
            })
        );

        emit AssetMinted(contentAssetStorageAddress, tokenId, assertionId);

        return tokenId;
    }

    function _checkAssetOwner(uint256 tokenId) internal view virtual {
        require(msg.sender == contentAssetStorage.ownerOf(tokenId), "Only asset owner can use this fn");
    }

    function _checkMutability(uint256 tokenId) internal view virtual {
        require(contentAssetStorage.isMutable(tokenId), "Asset is immutable");
    }
}
