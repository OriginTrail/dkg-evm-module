// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import {Assertion} from "../Assertion.sol";
import {Hub} from "../Hub.sol";
import {ServiceAgreementV1} from "../ServiceAgreementV1.sol";
import {Named} from "../interface/Named.sol";
import {Versioned} from "../interface/Versioned.sol";
import {ContentAssetStorage} from "../storage/assets/ContentAssetStorage.sol";
import {ContentAssetStructs} from "../structs/assets/ContentAssetStructs.sol";
import {ServiceAgreementStructsV1} from "../structs/ServiceAgreementStructsV1.sol";

contract ContentAsset is Named, Versioned {
    event AssetCreated(address indexed assetContract, uint256 indexed tokenId, bytes32 indexed stateCommitHash);
    event AssetUpdated(address indexed assetContract, uint256 indexed tokenId, bytes32 indexed stateCommitHash);

    string private constant _NAME = "ContentAsset";
    string private constant _VERSION = "1.0.0";

    Hub public hub;
    Assertion public assertionContract;
    ContentAssetStorage public contentAssetStorage;
    ServiceAgreementV1 public serviceAgreementV1;

    constructor(address hubAddress) {
        require(hubAddress != address(0), "Hub Address cannot be 0x0");

        hub = Hub(hubAddress);
        initialize();
    }

    function initialize() public onlyHubOwner {
        assertionContract = Assertion(hub.getContractAddress("Assertion"));
        contentAssetStorage = ContentAssetStorage(hub.getAssetStorageAddress("ContentAssetStorage"));
        serviceAgreementV1 = ServiceAgreementV1(hub.getContractAddress("ServiceAgreementV1"));
    }

    modifier onlyHubOwner() {
        _checkHubOwner();
        _;
    }

    modifier onlyAssetOwner(uint256 tokenId) {
        _checkAssetOwner(tokenId);
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
            args.scoreFunctionId
        );
    }

    function createAsset(
        bytes32 assertionId,
        uint128 size,
        uint32 triplesNumber,
        uint96 chunksNumber,
        uint16 epochsNumber,
        uint96 tokenAmount,
        uint8 scoreFunctionId
    ) external {
        _createAsset(assertionId, size, triplesNumber, chunksNumber, epochsNumber, tokenAmount, scoreFunctionId);
    }

    function _createAsset(
        bytes32 assertionId,
        uint128 size,
        uint32 triplesNumber,
        uint96 chunksNumber,
        uint16 epochsNumber,
        uint96 tokenAmount,
        uint8 scoreFunctionId
    ) internal {
        ContentAssetStorage cas = contentAssetStorage;

        uint256 tokenId = cas.generateTokenId();
        cas.mint(msg.sender, tokenId);

        assertionContract.createAssertion(assertionId, size, triplesNumber, chunksNumber);
        cas.setAssertionIssuer(tokenId, assertionId, msg.sender);
        cas.pushAssertionId(tokenId, assertionId);

        serviceAgreementV1.createServiceAgreement(
            ServiceAgreementStructsV1.ServiceAgreementInputArgs({
                assetCreator: msg.sender,
                assetContract: address(contentAssetStorage),
                tokenId: tokenId,
                keyword: abi.encodePacked(address(contentAssetStorage), assertionId),
                hashFunctionId: 1, // hashFunctionId | 1 = sha256
                epochsNumber: epochsNumber,
                tokenAmount: tokenAmount,
                scoreFunctionId: scoreFunctionId
            })
        );

        emit AssetCreated(address(contentAssetStorage), tokenId, assertionId);
    }

    function _checkHubOwner() internal view virtual {
        require(msg.sender == hub.owner(), "Fn can only be used by hub owner");
    }

    function _checkAssetOwner(uint256 tokenId) internal view virtual {
        require(msg.sender == contentAssetStorage.ownerOf(tokenId), "Only asset owner can use this fn");
    }
}
