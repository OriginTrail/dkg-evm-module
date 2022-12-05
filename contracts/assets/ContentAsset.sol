// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { AbstractAsset } from "./AbstractAsset.sol";
import { Assertion } from "../Assertion.sol";
import { ServiceAgreementV1 } from "../ServiceAgreementV1.sol";
import { Named } from "../interface/Named.sol";
import { ServiceAgreementStructsV1 } from "../structs/ServiceAgreementStructsV1.sol";
import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract ContentAsset is AbstractAsset, ERC721 {

    event AssetCreated(address indexed assetContract, uint256 indexed tokenId, bytes32 indexed stateCommitHash);
    event AssetUpdated(address indexed assetContract, uint256 indexed tokenId, bytes32 indexed stateCommitHash);

    struct AssetInputArgs {
        bytes32 assertionId;
        uint128 size;
        uint32 triplesNumber;
        uint96 chunksNumber;
        uint16 epochsNumber;
        uint96 tokenAmount;
        uint8 scoreFunctionId;
    }

    struct Asset {
        bytes32[] assertionIds;
    }

    uint256 private _tokenId;

    Assertion public assertionContract;
    ServiceAgreementV1 public serviceAgreementV1;

    mapping (uint256 => Asset) assets;

    constructor(address hubAddress)
        AbstractAsset(hubAddress)
        ERC721("ContentAsset", "DKG")
    {
        assertionContract = Assertion(hub.getContractAddress("Assertion"));
        serviceAgreementV1 = ServiceAgreementV1(hub.getContractAddress("ServiceAgreementV1"));
    }

    modifier onlyAssetOwner(uint256 tokenId) {
        _checkAssetOwner(tokenId);
        _;
    }

    function name() public view override(ERC721, Named) returns (string memory) {
        return ERC721.name();
    }

    function createAsset(AssetInputArgs calldata args) external {
        uint256 tokenId = _tokenId++;
        _mint(msg.sender, tokenId);

        assertionContract.createAssertion(
            args.assertionId,
            msg.sender,
            args.size,
            args.triplesNumber,
            args.chunksNumber
        );
        assets[tokenId].assertionIds.push(args.assertionId);

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
 

    function getAssertionIds(uint256 tokenId) public view override returns (bytes32[] memory) {
        return assets[tokenId].assertionIds;
    }

    function _checkAssetOwner(uint256 tokenId) internal view virtual {
        require(msg.sender == ownerOf(tokenId), "Only asset owner can use this fn");
    }

}
