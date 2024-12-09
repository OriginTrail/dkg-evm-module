// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {Chronos} from "./storage/Chronos.sol";
import {KnowledgeCollectionStorage} from "./storage/KnowledgeCollectionStorage.sol";
import {ShardingTableStorage} from "./storage/ShardingTableStorage.sol";
import {IdentityStorage} from "./storage/IdentityStorage.sol";
import {ParametersStorage} from "./storage/ParametersStorage.sol";
import {KnowledgeCollectionLib} from "./libraries/KnowledgeCollectionLib.sol";
import {TokenLib} from "./libraries/TokenLib.sol";
import {IdentityLib} from "./libraries/IdentityLib.sol";
import {INamed} from "./interfaces/INamed.sol";
import {IVersioned} from "./interfaces/IVersioned.sol";
import {HubDependent} from "./abstract/HubDependent.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SignatureCheckerLib} from "solady/src/utils/SignatureCheckerLib.sol";

contract KnowledgeCollection is INamed, IVersioned, HubDependent {
    string private constant _NAME = "KnowledgeCollection";
    string private constant _VERSION = "1.0.0";

    KnowledgeCollectionStorage public knowledgeCollectionStorage;
    Chronos public chronos;
    ShardingTableStorage public shardingTableStorage;
    IERC20 public tokenContract;
    ParametersStorage public parametersStorage;
    IdentityStorage public identityStorage;

    constructor(address hubAddress) HubDependent(hubAddress) {}

    function initialize() public onlyHub {
        knowledgeCollectionStorage = KnowledgeCollectionStorage(hub.getContractAddress("KnowledgeCollectionStorage"));
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
        bytes32 merkleRoot,
        uint256 knowledgeAssetsAmount,
        uint256 byteSize,
        uint256 chunksAmount,
        uint256 epochs,
        uint96 tokenAmount,
        uint72[] calldata identityIds,
        address[] calldata signers,
        bytes[] calldata signatures
    ) external {
        bool validSignatures = _verifySignatures(
            identityIds,
            signers,
            signatures,
            keccak256(abi.encodePacked(merkleRoot))
        );

        if (!validSignatures) {
            revert KnowledgeCollectionLib.InvalidSignatures(
                identityIds,
                signers,
                signatures,
                keccak256(abi.encodePacked(merkleRoot))
            );
        }

        uint256 currentEpoch = chronos.getCurrentEpoch();
        KnowledgeCollectionStorage kcs = knowledgeCollectionStorage;

        uint256 id = kcs.createKnowledgeCollection(
            merkleRoot,
            0,
            byteSize,
            chunksAmount,
            currentEpoch + 1,
            currentEpoch + epochs + 1,
            tokenAmount
        );
        kcs.mintKnowledgeAssetsTokens(id, msg.sender, knowledgeAssetsAmount);

        _validateTokenAmount(byteSize, epochs, tokenAmount, true);
        _addTokens(tokenAmount);
    }

    function updateKnowledgeCollection(
        uint256 id,
        bytes32 merkleRoot,
        uint256 mintKnowledgeAssetsAmount,
        uint256[] calldata knowledgeAssetsToBurn,
        uint256 byteSize,
        uint256 chunksAmount,
        uint96 tokenAmount,
        uint72[] calldata identityIds,
        address[] calldata signers,
        bytes[] calldata signatures
    ) external {
        bool validSignatures = _verifySignatures(
            identityIds,
            signers,
            signatures,
            keccak256(abi.encodePacked(merkleRoot))
        );

        if (!validSignatures) {
            revert KnowledgeCollectionLib.InvalidSignatures(
                identityIds,
                signers,
                signatures,
                keccak256(abi.encodePacked(merkleRoot))
            );
        }

        uint256 currentEpoch = chronos.getCurrentEpoch();
        KnowledgeCollectionStorage kcs = knowledgeCollectionStorage;

        uint256 oldByteSize;
        uint256 oldChunksAmount;
        uint256 endEpoch;
        uint96 oldTokenAmount;
        (, , , , oldByteSize, oldChunksAmount, , endEpoch, oldTokenAmount) = kcs.getKnowledgeCollectionMetadata(id);

        if (currentEpoch > endEpoch) {
            revert KnowledgeCollectionLib.KnowledgeCollectionExpired(id, currentEpoch, endEpoch);
        }

        kcs.updateKnowledgeCollection(
            id,
            merkleRoot,
            byteSize,
            oldChunksAmount + chunksAmount,
            oldTokenAmount + tokenAmount
        );
        kcs.burnKnowledgeAssetsTokens(id, msg.sender, knowledgeAssetsToBurn);
        kcs.mintKnowledgeAssetsTokens(id, msg.sender, mintKnowledgeAssetsAmount);

        _validateTokenAmount(byteSize, currentEpoch - endEpoch, tokenAmount, true);
        _addTokens(tokenAmount);
    }

    function extendKnowledgeCollectionLifetime(uint256 id, uint16 epochs, uint96 tokenAmount) external {
        KnowledgeCollectionStorage kcs = knowledgeCollectionStorage;

        uint256 byteSize;
        uint256 endEpoch;
        uint96 oldTokenAmount;
        (, , , , byteSize, , , endEpoch, oldTokenAmount) = kcs.getKnowledgeCollectionMetadata(id);

        if (chronos.getCurrentEpoch() > endEpoch) {
            revert KnowledgeCollectionLib.KnowledgeCollectionExpired(id, chronos.getCurrentEpoch(), endEpoch);
        }

        kcs.setEndEpoch(id, endEpoch + epochs);
        kcs.setTokenAmount(id, oldTokenAmount + tokenAmount);

        _validateTokenAmount(byteSize, epochs, tokenAmount, false);
        _addTokens(tokenAmount);
    }

    function increaseKnowledgeCollectionTokenAmount(uint256 id, uint96 tokenAmount) external {
        KnowledgeCollectionStorage kcs = knowledgeCollectionStorage;

        uint256 endEpoch;
        uint96 oldTokenAmount;
        (, , , , , , , endEpoch, oldTokenAmount) = kcs.getKnowledgeCollectionMetadata(id);

        if (chronos.getCurrentEpoch() > endEpoch) {
            revert KnowledgeCollectionLib.KnowledgeCollectionExpired(id, chronos.getCurrentEpoch(), endEpoch);
        }

        kcs.setTokenAmount(id, oldTokenAmount + tokenAmount);

        _addTokens(tokenAmount);
    }

    function _verifySignatures(
        uint72[] calldata identityIds,
        address[] calldata signers,
        bytes[] calldata signatures,
        bytes32 message
    ) internal view returns (bool) {
        if (signatures.length != identityIds.length || signatures.length != signers.length) {
            revert KnowledgeCollectionLib.SignaturesSignersMismatch(
                signatures.length,
                identityIds.length,
                signers.length
            );
        }

        if (signatures.length < parametersStorage.minimumRequiredSignatures()) {
            revert KnowledgeCollectionLib.MinSignaturesRequirementNotMet(
                parametersStorage.minimumRequiredSignatures(),
                signatures.length
            );
        }

        IdentityStorage ids = identityStorage;

        for (uint256 i; i < identityIds.length; i++) {
            if (
                !ids.keyHasPurpose(identityIds[i], keccak256(abi.encodePacked(signers[i])), IdentityLib.OPERATIONAL_KEY)
            ) {
                return false;
            }

            if (!SignatureCheckerLib.isValidSignatureNowCalldata(signers[i], message, signatures[i])) {
                return false;
            }
        }

        return true;
    }

    function _validateTokenAmount(
        uint256 byteSize,
        uint256 epochs,
        uint96 tokenAmount,
        bool includeCurrentEpoch
    ) internal view {
        Chronos chron = chronos;

        uint256 stakeWeightedAverageAsk = shardingTableStorage.getStakeWeightedAverageAsk();
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

    function _addTokens(uint96 tokenAmount) internal {
        IERC20 token = tokenContract;

        if (token.allowance(msg.sender, address(this)) < tokenAmount) {
            revert TokenLib.TooLowAllowance(address(token), token.allowance(msg.sender, address(this)), tokenAmount);
        }

        if (token.balanceOf(msg.sender) < tokenAmount) {
            revert TokenLib.TooLowBalance(address(token), token.balanceOf(msg.sender), tokenAmount);
        }

        token.transferFrom(msg.sender, address(this), tokenAmount);
    }
}
