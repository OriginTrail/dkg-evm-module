// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import { Assertion } from "../Assertion.sol";
import { Hub } from "../Hub.sol";
import { ServiceAgreementV1 } from "../ServiceAgreementV1.sol";
import { Named } from "../interface/Named.sol";
import { Versioned } from "../interface/Versioned.sol";
import { ContentAssetStorage } from "../storage/assets/ContentAssetStorage.sol";
import { ContentAssetStructs } from "../structs/assets/ContentAssetStructs.sol";
import { ServiceAgreementStructsV1 } from "../structs/ServiceAgreementStructsV1.sol";

contract ContentAsset is Named, Versioned {

    event AssetCreated(address indexed assetContract, uint256 indexed tokenId, bytes32 indexed stateCommitHash);
    event AssetUpdated(address indexed assetContract, uint256 indexed tokenId, bytes32 indexed stateCommitHash);

    string constant private _NAME = "ContentAsset";
    string constant private _VERSION = "1.0.0";

    Hub public hub;
    Assertion public assertionContract;
    ContentAssetStorage public contentAssetStorage;
    ServiceAgreementV1 public serviceAgreementV1;

    constructor(address hubAddress) {
        require(hubAddress != address(0));

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
        ContentAssetStorage cas = contentAssetStorage;

        uint256 tokenId = cas.generateTokenId();
        cas.mint(msg.sender, tokenId);

        assertionContract.createAssertion(
            args.assertionId,
            args.size,
            args.triplesNumber,
            args.chunksNumber
        );
        cas.setAssertionIssuer(tokenId, args.assertionId, msg.sender);
        cas.pushAssertionId(tokenId, args.assertionId);

        serviceAgreementV1.createServiceAgreement(
            ServiceAgreementStructsV1.ServiceAgreementInputArgs({
                assetCreator: msg.sender,
                assetContract: address(this),
                tokenId: tokenId,
                keyword: abi.encodePacked(address(this), args.assertionId),
                hashFunctionId: 1,  // hashFunctionId | 1 = sha256
                epochsNumber: args.epochsNumber,
                tokenAmount: args.tokenAmount,
                scoreFunctionId: args.scoreFunctionId
            })
        );

        emit AssetCreated(address(this), tokenId, args.assertionId);
    }

    function _checkHubOwner() internal view virtual {
        require(msg.sender == hub.owner(), "Fn can only be used by hub owner");
    }

    function _checkAssetOwner(uint256 tokenId) internal view virtual {
        require(msg.sender == contentAssetStorage.ownerOf(tokenId), "Only asset owner can use this fn");
    }

}
