// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {ContentAsset} from "../assets/ContentAsset.sol";
import {ParanetsRegistry} from "../storage/paranets/ParanetsRegistry.sol";
import {ParanetIncentivesPool} from "./ParanetIncentivesPool.sol";
import {ContractStatus} from "../abstract/ContractStatus.sol";
import {Initializable} from "../interface/Initializable.sol";
import {Named} from "../interface/Named.sol";
import {Versioned} from "../interface/Versioned.sol";
import {ContentAssetStructs} from "../structs/assets/ContentAssetStructs.sol";
import {ParanetStructs} from "../structs/paranets/ParanetStructs.sol";
import {ParanetErrors} from "../errors/paranets/ParanetErrors.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract Paranet is Named, Versioned, ContractStatus, Initializable {
    string private constant _NAME = "Paranet";
    string private constant _VERSION = "1.0.0";

    bytes32 public constant PARANET_OWNER_ROLE = keccak256("PARANET_OWNER");
    bytes32 public constant KNOWLEDGE_MINER_ROLE = keccak256("KNOWLEDGE_MINER");

    ParanetsRegistry public paranetsRegistry;
    ContentAsset public contentAsset;

    address public contentAssetStorageAddress;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) ContractStatus(hubAddress) {}

    function initialize() public onlyHubOwner {
        contentAsset = ContentAsset(hub.getContractAddress("ContentAsset"));
        paranetsRegistry = ParanetsRegistry(hub.getContractAddress("ParanetsRegistry"));

        contentAssetStorageAddress = hub.getAssetStorageAddress("ContentAssetStorage");
    }

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function registerParanet(
        address knowledgeAssetStorageContract,
        uint256 tokenId,
        string calldata paranetName,
        string calldata paranetDescription
    ) external {
        ParanetsRegistry pr = paranetsRegistry;

        if (pr.exists(keccak256(abi.encodePacked(knowledgeAssetStorageContract, tokenId)))) {
            revert ParanetErrors.ParanetHasAlreadyBeenRegistered(knowledgeAssetStorageContract, tokenId);
        }

        ParanetIncentivesPool incentivesPool = new ParanetIncentivesPool(address(hub));

        pr.register(
            knowledgeAssetStorageContract,
            tokenId,
            ParanetStructs.AccessPolicy.OPEN,
            ParanetStructs.AccessPolicy.OPEN,
            paranetName,
            paranetDescription,
            address(incentivesPool)
        );
    }

    // function addParanetService() {

    // }

    // function addParanetServices() {

    // }

    function updateParanetName(
        address knowledgeAssetStorageContract,
        uint256 tokenId,
        string calldata paranetName
    ) external {
        ParanetsRegistry pr = paranetsRegistry;

        if (!pr.exists(keccak256(abi.encodePacked(knowledgeAssetStorageContract, tokenId)))) {
            revert ParanetErrors.ParanetDoesntExist(knowledgeAssetStorageContract, tokenId);
        }

        pr.setName(keccak256(abi.encodePacked(knowledgeAssetStorageContract, tokenId)), paranetName);
    }

    function updateParanetDescription(
        address knowledgeAssetStorageContract,
        uint256 tokenId,
        string calldata paranetDescription
    ) external {
        ParanetsRegistry pr = paranetsRegistry;

        if (!pr.exists(keccak256(abi.encodePacked(knowledgeAssetStorageContract, tokenId)))) {
            revert ParanetErrors.ParanetDoesntExist(knowledgeAssetStorageContract, tokenId);
        }

        pr.setName(keccak256(abi.encodePacked(knowledgeAssetStorageContract, tokenId)), paranetDescription);
    }

    function mintKnowledgeAsset(
        address paranetKnowledgeAssetStorageContract,
        uint256 paranetTokenId,
        ContentAssetStructs.AssetInputArgs calldata knowledgeAssetArgs
    ) external {
        ParanetsRegistry pr = paranetsRegistry;
        ContentAsset ca = contentAsset;

        if (!pr.exists(keccak256(abi.encodePacked(paranetKnowledgeAssetStorageContract, paranetTokenId)))) {
            revert ParanetErrors.ParanetDoesntExist(paranetKnowledgeAssetStorageContract, paranetTokenId);
        }

        // TODO: Add check if Knowledge Miner Profile exists

        uint256 knowledgeAssetTokenId = ca.createAsset(knowledgeAssetArgs);

        pr.addKnowledgeAsset(
            keccak256(abi.encodePacked(paranetKnowledgeAssetStorageContract, paranetTokenId)),
            keccak256(abi.encodePacked(contentAssetStorageAddress, knowledgeAssetTokenId))
        );

        pr.setCumulativeKnowledgeValue(
            keccak256(abi.encodePacked(paranetKnowledgeAssetStorageContract, paranetTokenId)),
            pr.getCumulativeKnowledgeValue(
                keccak256(abi.encodePacked(paranetKnowledgeAssetStorageContract, paranetTokenId))
            ) + knowledgeAssetArgs.tokenAmount
        );

        // TODO: Add miner stats update
    }

    function submitKnowledgeAsset(
        address paranetKnowledgeAssetStorageContract,
        uint256 paranetTokenId,
        address knowledgeAssetStorageContract,
        uint256 knowledgeAssetTokenId
    ) external {
        ParanetsRegistry pr = paranetsRegistry;

        if (!pr.exists(keccak256(abi.encodePacked(knowledgeAssetStorageContract, paranetTokenId)))) {
            revert ParanetErrors.ParanetDoesntExist(knowledgeAssetStorageContract, paranetTokenId);
        }

        if (IERC721(knowledgeAssetStorageContract).ownerOf(knowledgeAssetTokenId) != msg.sender) {
            revert ParanetErrors.KnowledgeAssetSubmitterIsntOwner(
                paranetKnowledgeAssetStorageContract,
                paranetTokenId,
                knowledgeAssetStorageContract,
                knowledgeAssetTokenId
            );
        }

        // TODO: Add check if Knowledge Miner Profile exists

        pr.addKnowledgeAsset(
            keccak256(abi.encodePacked(paranetKnowledgeAssetStorageContract, paranetTokenId)),
            keccak256(abi.encodePacked(knowledgeAssetStorageContract, knowledgeAssetTokenId))
        );

        // TODO: Add miner stats update
    }
}
