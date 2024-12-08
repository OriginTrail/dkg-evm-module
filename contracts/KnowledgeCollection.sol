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
        uint256 chunksNumber,
        uint256 epochs,
        uint96 tokenAmount,
        uint72[] calldata identityIds,
        address[] calldata signers,
        bytes[] calldata signatures
    ) external {
        IERC20 token = tokenContract;
        Chronos chron = chronos;

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

        uint256 currentEpoch = chron.getCurrentEpoch();

        knowledgeCollectionStorage.createKnowledgeCollection(
            merkleRoot,
            knowledgeAssetsAmount,
            byteSize,
            chunksNumber,
            currentEpoch + 1,
            currentEpoch + 1 + epochs,
            tokenAmount
        );

        uint256 stakeWeightedAverageAsk = shardingTableStorage.getStakeWeightedAverageAsk();
        uint256 totalStorageTime = (epochs * 1e18) + (chron.timeUntilNextEpoch() * 1e18) / chron.epochLength();
        uint96 expectedTokenAmount = uint96((stakeWeightedAverageAsk * byteSize * totalStorageTime) / 1e18);

        if (tokenAmount < expectedTokenAmount) {
            revert KnowledgeCollectionLib.InvalidTokenAmount(expectedTokenAmount, tokenAmount);
        }

        if (token.allowance(msg.sender, address(this)) < tokenAmount) {
            revert TokenLib.TooLowAllowance(address(token), token.allowance(msg.sender, address(this)), tokenAmount);
        }

        if (token.balanceOf(msg.sender) < tokenAmount) {
            revert TokenLib.TooLowBalance(address(token), token.balanceOf(msg.sender), tokenAmount);
        }

        token.transferFrom(msg.sender, address(this), tokenAmount);
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
}
