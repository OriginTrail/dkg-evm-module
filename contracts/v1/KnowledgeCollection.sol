// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.16;

import {Chronos} from "./storage/Chronos.sol";
import {KnowledgeCollectionStorage} from "./storage/KnowledgeCollectionStorage.sol";
import {ShardingTableStorage} from "./storage/ShardingTableStorage.sol";
import {IdentityStorage} from "./storage/IdentityStorage.sol";
import {ParametersStorage} from "./storage/ParametersStorage.sol";
import {KnowledgeCollectionLib} from "./libraries/KnowledgeCollectionLib.sol";
import {TokenLib} from "./libraries/TokenLib.sol";
import {IdentityLib} from "./libraries/IdentityLib.sol";
import {Named} from "./interface/Named.sol";
import {Versioned} from "./interface/Versioned.sol";
import {HubDependent} from "./abstract/HubDependent.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ECDSA} from "solady/src/utils/ECDSA.sol";

contract KnowledgeCollection is Named, Versioned, HubDependent {
    string private constant _NAME = "KnowledgeCollection";
    string private constant _VERSION = "1.0.0";

    KnowledgeCollectionStorage public knowledgeCollectionStorage;
    Chronos public chronos;
    ShardingTableStorage public shardingTableStorage;
    IERC20 public tokenContract;
    ParametersStorage public parametersStorage;
    IdentityStorage public identityStorage;

    constructor(address hubAddress) HubDependent(hubAddress) {}

    function initialize() public onlyHubOwner {
        knowledgeCollectionStorage = KnowledgeCollectionStorage(
            hub.getAssetStorageAddress("KnowledgeCollectionStorage")
        );
        chronos = Chronos(hub.getContractAddress("Chronos"));
        shardingTableStorage = ShardingTableStorage(hub.getContractAddress("ShardingTableStorage"));
        tokenContract = IERC20(hub.getContractAddress("Token"));
        parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));
        identityStorage = IdentityStorage(hub.getContractAddress("IdentityStorage"));
    }

    function name() public pure virtual returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual returns (string memory) {
        return _VERSION;
    }

    function createKnowledgeCollection(
        string calldata publishOperationId,
        bytes32 merkleRoot,
        uint256 knowledgeAssetsAmount,
        uint256 byteSize,
        uint256 triplesAmount,
        uint256 chunksAmount,
        uint256 epochs,
        uint96 tokenAmount,
        address paymaster,
        uint72 publisherNodeIdentityId,
        bytes32 publisherNodeR,
        bytes32 publisherNodeVS,
        uint72[] calldata identityIds,
        bytes32[] calldata r,
        bytes32[] calldata vs
    ) external {
        _verifySignature(
            publisherNodeIdentityId,
            ECDSA.toEthSignedMessageHash(keccak256(abi.encodePacked(publisherNodeIdentityId, merkleRoot))),
            publisherNodeR,
            publisherNodeVS
        );

        _verifySignatures(identityIds, ECDSA.toEthSignedMessageHash(merkleRoot), r, vs);

        uint256 currentEpoch = chronos.getCurrentEpoch();
        KnowledgeCollectionStorage kcs = knowledgeCollectionStorage;

        uint256 id = kcs.createKnowledgeCollection(
            publishOperationId,
            merkleRoot,
            byteSize,
            triplesAmount,
            chunksAmount,
            currentEpoch + 1,
            currentEpoch + epochs + 1,
            tokenAmount
        );
        kcs.mintKnowledgeAssetsTokens(id, msg.sender, knowledgeAssetsAmount);

        // TODO: Update publisher node's epochs knowledge value

        _validateTokenAmount(byteSize, epochs, tokenAmount, true);
        _addTokens(tokenAmount, paymaster);
    }

    function updateKnowledgeCollection(
        uint256 id,
        string calldata updateOperationId,
        bytes32 merkleRoot,
        uint256 mintKnowledgeAssetsAmount,
        uint256[] calldata knowledgeAssetsToBurn,
        uint256 byteSize,
        uint256 triplesAmount,
        uint256 chunksAmount,
        uint96 tokenAmount,
        address paymaster,
        uint72 publisherNodeIdentityId,
        bytes32 publisherNodeR,
        bytes32 publisherNodeVS,
        uint72[] calldata identityIds,
        bytes32[] calldata r,
        bytes32[] calldata vs
    ) external {
        _verifySignature(
            publisherNodeIdentityId,
            ECDSA.toEthSignedMessageHash(keccak256(abi.encodePacked(publisherNodeIdentityId, merkleRoot))),
            publisherNodeR,
            publisherNodeVS
        );

        _verifySignatures(identityIds, ECDSA.toEthSignedMessageHash(merkleRoot), r, vs);

        uint256 currentEpoch = chronos.getCurrentEpoch();
        KnowledgeCollectionStorage kcs = knowledgeCollectionStorage;

        (
            ,
            ,
            ,
            ,
            ,
            uint256 oldByteSize,
            uint256 oldTriplesAmount,
            uint256 oldChunksAmount,
            ,
            uint256 endEpoch,
            uint96 oldTokenAmount
        ) = kcs.getKnowledgeCollectionMetadata(id);

        if (currentEpoch > endEpoch) {
            revert KnowledgeCollectionLib.KnowledgeCollectionExpired(id, currentEpoch, endEpoch);
        }

        kcs.updateKnowledgeCollection(
            id,
            updateOperationId,
            merkleRoot,
            oldByteSize + byteSize,
            oldTriplesAmount + triplesAmount,
            oldChunksAmount + chunksAmount,
            oldTokenAmount + tokenAmount
        );
        kcs.burnKnowledgeAssetsTokens(id, msg.sender, knowledgeAssetsToBurn);
        kcs.mintKnowledgeAssetsTokens(id, msg.sender, mintKnowledgeAssetsAmount);

        _validateTokenAmount(byteSize, currentEpoch - endEpoch, tokenAmount, true);
        _addTokens(tokenAmount, paymaster);
    }

    function extendKnowledgeCollectionLifetime(
        uint256 id,
        uint16 epochs,
        uint96 tokenAmount,
        address paymaster
    ) external {
        KnowledgeCollectionStorage kcs = knowledgeCollectionStorage;

        (, , , , , uint256 byteSize, , , , uint256 endEpoch, uint96 oldTokenAmount) = kcs
            .getKnowledgeCollectionMetadata(id);

        if (chronos.getCurrentEpoch() > endEpoch) {
            revert KnowledgeCollectionLib.KnowledgeCollectionExpired(id, chronos.getCurrentEpoch(), endEpoch);
        }

        kcs.setEndEpoch(id, endEpoch + epochs);
        kcs.setTokenAmount(id, oldTokenAmount + tokenAmount);

        _validateTokenAmount(byteSize, epochs, tokenAmount, false);
        _addTokens(tokenAmount, paymaster);
    }

    function increaseKnowledgeCollectionTokenAmount(uint256 id, uint96 tokenAmount, address paymaster) external {
        if (tokenAmount == 0) {
            revert TokenLib.ZeroTokenAmount();
        }

        KnowledgeCollectionStorage kcs = knowledgeCollectionStorage;

        (, , , , , , , , , uint256 endEpoch, uint96 oldTokenAmount) = kcs.getKnowledgeCollectionMetadata(id);

        if (chronos.getCurrentEpoch() > endEpoch) {
            revert KnowledgeCollectionLib.KnowledgeCollectionExpired(id, chronos.getCurrentEpoch(), endEpoch);
        }

        kcs.setTokenAmount(id, oldTokenAmount + tokenAmount);

        _addTokens(tokenAmount, paymaster);
    }

    function _verifySignatures(
        uint72[] calldata identityIds,
        bytes32 messageHash,
        bytes32[] calldata r,
        bytes32[] calldata vs
    ) internal {
        if (r.length != identityIds.length || r.length != vs.length) {
            revert KnowledgeCollectionLib.SignaturesSignersMismatch(r.length, vs.length, identityIds.length);
        }

        if (r.length < parametersStorage.minimumRequiredSignatures()) {
            revert KnowledgeCollectionLib.MinSignaturesRequirementNotMet(
                parametersStorage.minimumRequiredSignatures(),
                r.length
            );
        }

        for (uint256 i; i < identityIds.length; i++) {
            _verifySignature(identityIds[i], messageHash, r[i], vs[i]);
        }
    }

    function _verifySignature(uint72 identityId, bytes32 messageHash, bytes32 r, bytes32 vs) internal {
        address signer = ECDSA.tryRecover(messageHash, r, vs);

        if (signer == address(0)) {
            revert KnowledgeCollectionLib.InvalidSignature(identityId, messageHash, r, vs);
        }

        if (
            !identityStorage.keyHasPurpose(identityId, keccak256(abi.encodePacked(signer)), IdentityLib.OPERATIONAL_KEY)
        ) {
            revert KnowledgeCollectionLib.SignerIsNotNodeOperator(identityId, signer);
        }
    }

    function _validateTokenAmount(
        uint256 byteSize,
        uint256 epochs,
        uint96 tokenAmount,
        bool includeCurrentEpoch
    ) internal view {
        Chronos chron = chronos;

        uint256 stakeWeightedAverageAsk = 1;
        uint96 expectedTokenAmount;
        if (includeCurrentEpoch) {
            uint256 totalStorageTime = (epochs * 1e18) + (chron.timeUntilNextEpoch() * 1e18) / chron.epochLength();
            expectedTokenAmount = uint96((stakeWeightedAverageAsk * byteSize * totalStorageTime) / 1e18);
        } else {
            expectedTokenAmount = uint96(stakeWeightedAverageAsk * byteSize * epochs);
        }

        if (tokenAmount < expectedTokenAmount) {
            revert KnowledgeCollectionLib.InvalidTokenAmount(expectedTokenAmount, tokenAmount);
        }
    }

    function _addTokens(uint96 tokenAmount, address paymaster) internal {
        IERC20 token = tokenContract;

        if (token.allowance(msg.sender, address(this)) < tokenAmount) {
            revert TokenLib.TooLowAllowance(address(token), token.allowance(msg.sender, address(this)), tokenAmount);
        }

        if (token.balanceOf(msg.sender) < tokenAmount) {
            revert TokenLib.TooLowBalance(address(token), token.balanceOf(msg.sender), tokenAmount);
        }

        if (!token.transferFrom(msg.sender, address(this), tokenAmount)) {
            revert TokenLib.TransferFailed();
        }
    }
}
