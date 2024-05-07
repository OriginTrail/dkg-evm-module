// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {ContentAssetStorageV2} from "../storage/assets/ContentAssetStorage.sol";
import {ContentAssetV2} from "../assets/ContentAsset.sol";
import {HubV2} from "../Hub.sol";
import {ParanetKnowledgeAssetsRegistry} from "../storage/paranets/ParanetKnowledgeAssetsRegistry.sol";
import {ParanetKnowledgeMinersRegistry} from "../storage/paranets/ParanetKnowledgeMinersRegistry.sol";
import {ParanetsRegistry} from "../storage/paranets/ParanetsRegistry.sol";
import {ParanetServicesRegistry} from "../storage/paranets/ParanetServicesRegistry.sol";
import {ParanetIncentivesPool} from "./ParanetIncentivesPool.sol";
import {ServiceAgreementStorageProxy} from "../../v1/storage/ServiceAgreementStorageProxy.sol";
import {HashingProxy} from "../../v1/HashingProxy.sol";
import {ContractStatusV2} from "../abstract/ContractStatus.sol";
import {Initializable} from "../../v1/interface/Initializable.sol";
import {Named} from "../../v1/interface/Named.sol";
import {Versioned} from "../../v1/interface/Versioned.sol";
import {ContentAssetStructs} from "../../v1/structs/assets/ContentAssetStructs.sol";
import {ParanetStructs} from "../structs/paranets/ParanetStructs.sol";
import {ParanetErrors} from "../errors/paranets/ParanetErrors.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {HASH_FUNCTION_ID} from "../../v1/constants/assets/ContentAssetConstants.sol";

contract Paranet is Named, Versioned, ContractStatusV2, Initializable {
    string private constant _NAME = "Paranet";
    string private constant _VERSION = "2.0.0";

    bytes32 public constant PARANET_OWNER_ROLE = keccak256("PARANET_OWNER");
    bytes32 public constant KNOWLEDGE_MINER_ROLE = keccak256("KNOWLEDGE_MINER");

    ParanetsRegistry public paranetsRegistry;
    ParanetServicesRegistry public paranetServicesRegistry;
    ParanetKnowledgeMinersRegistry public paranetKnowledgeMinersRegistry;
    ParanetKnowledgeAssetsRegistry public paranetKnowledgeAssetsRegistry;
    ContentAssetStorageV2 public contentAssetStorage;
    ContentAssetV2 public contentAsset;
    HashingProxy public hashingProxy;
    ServiceAgreementStorageProxy public serviceAgreementStorageProxy;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) ContractStatusV2(hubAddress) {}

    modifier onlyParanetOperator(bytes32 paranetId) {
        _checkParanetOperator(paranetId);
        _;
    }

    modifier onlyParanetServiceOperator(bytes32 paranetServiceId) {
        _checkParanetServiceOperator(paranetServiceId);
        _;
    }

    function initialize() public onlyHubOwner {
        contentAssetStorage = ContentAssetStorageV2(hub.getAssetStorageAddress("ContentAssetStorage"));
        contentAsset = ContentAssetV2(hub.getContractAddress("ContentAsset"));
        paranetsRegistry = ParanetsRegistry(hub.getContractAddress("ParanetsRegistry"));
        paranetServicesRegistry = ParanetServicesRegistry(hub.getContractAddress("ParanetServicesRegistry"));
        paranetKnowledgeMinersRegistry = ParanetKnowledgeMinersRegistry(
            hub.getContractAddress("ParanetKnowledgeMinersRegistry")
        );
        paranetKnowledgeAssetsRegistry = ParanetKnowledgeAssetsRegistry(
            hub.getContractAddress("ParanetKnowledgeAssetsRegistry")
        );
        hashingProxy = HashingProxy(hub.getContractAddress("HashingProxy"));
        serviceAgreementStorageProxy = ServiceAgreementStorageProxy(
            hub.getContractAddress("ServiceAgreementStorageProxy")
        );
    }

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function registerParanet(
        address paranetKAStorageContract,
        uint256 paranetKATokenId,
        string calldata paranetName,
        string calldata paranetDescription,
        uint256 tracToNeuroRatio,
        uint96 tracTarget,
        uint16 operatorRewardPercentage
    ) external returns (bytes32) {
        HubV2 h = hub;
        ParanetsRegistry pr = paranetsRegistry;

        if (pr.paranetExists(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)))) {
            revert ParanetErrors.ParanetHasAlreadyBeenRegistered(paranetKAStorageContract, paranetKATokenId);
        }

        ParanetIncentivesPool incentivesPool = new ParanetIncentivesPool(
            h.getContractAddress("ParanetsRegistry"),
            h.getContractAddress("KnowledgeMinersRegistry"),
            keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
            tracToNeuroRatio,
            tracTarget,
            operatorRewardPercentage
        );

        return
            pr.registerParanet(
                paranetKAStorageContract,
                paranetKATokenId,
                ParanetStructs.AccessPolicy.OPEN,
                ParanetStructs.AccessPolicy.OPEN,
                paranetName,
                paranetDescription,
                address(incentivesPool)
            );
    }

    function updateParanetName(
        address paranetKAStorageContract,
        uint256 paranetKATokenId,
        string calldata paranetName
    ) external onlyParanetOperator(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId))) {
        ParanetsRegistry pr = paranetsRegistry;

        if (!pr.paranetExists(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)))) {
            revert ParanetErrors.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        pr.setName(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)), paranetName);
    }

    function updateParanetDescription(
        address paranetKAStorageContract,
        uint256 paranetKATokenId,
        string calldata paranetDescription
    ) external onlyParanetOperator(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId))) {
        ParanetsRegistry pr = paranetsRegistry;

        if (!pr.paranetExists(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)))) {
            revert ParanetErrors.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        pr.setName(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)), paranetDescription);
    }

    function transferParanetOwnership(
        address paranetKAStorageContract,
        uint256 paranetKATokenId,
        address operator
    ) external onlyParanetOperator(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId))) {
        ParanetsRegistry pr = paranetsRegistry;

        if (!pr.paranetExists(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)))) {
            revert ParanetErrors.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        pr.setOperatorAddress(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)), operator);
    }

    function addParanetService(
        address paranetKAStorageContract,
        uint256 paranetKATokenId,
        address paranetServiceKAStorageContract,
        uint256 paranetServiceKATokenId
    ) external onlyParanetOperator(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId))) {
        ParanetsRegistry pr = paranetsRegistry;
        ParanetServicesRegistry psr = paranetServicesRegistry;

        if (!pr.paranetExists(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)))) {
            revert ParanetErrors.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        if (
            !psr.paranetServiceExists(
                keccak256(abi.encodePacked(paranetServiceKAStorageContract, paranetServiceKATokenId))
            )
        ) {
            revert ParanetErrors.ParanetServiceDoesntExist(paranetServiceKAStorageContract, paranetServiceKATokenId);
        }

        pr.addService(
            keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
            keccak256(abi.encodePacked(paranetServiceKAStorageContract, paranetServiceKATokenId))
        );
    }

    function addParanetServices(
        address paranetKAStorageContract,
        uint256 paranetKATokenId,
        ParanetStructs.UniversalAssetLocator[] calldata services
    ) external onlyParanetOperator(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId))) {
        ParanetsRegistry pr = paranetsRegistry;
        ParanetServicesRegistry psr = paranetServicesRegistry;

        if (!pr.paranetExists(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)))) {
            revert ParanetErrors.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        for (uint256 i; i < services.length; ) {
            if (
                !psr.paranetServiceExists(
                    keccak256(abi.encodePacked(services[i].knowledgeAssetStorageContract, services[i].tokenId))
                )
            ) {
                revert ParanetErrors.ParanetServiceDoesntExist(
                    services[i].knowledgeAssetStorageContract,
                    services[i].tokenId
                );
            }

            pr.addService(
                keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
                keccak256(abi.encodePacked(services[i].knowledgeAssetStorageContract, services[i].tokenId))
            );

            unchecked {
                i++;
            }
        }
    }

    function registerParanetService(
        address paranetServiceKAStorageContract,
        uint256 paranetServiceKATokenId,
        string calldata paranetServiceName,
        string calldata paranetServiceDescription,
        address worker,
        bytes calldata paranetServiceMetadata
    ) external returns (bytes32) {
        ParanetServicesRegistry psr = paranetServicesRegistry;

        if (
            psr.paranetServiceExists(
                keccak256(abi.encodePacked(paranetServiceKAStorageContract, paranetServiceKATokenId))
            )
        ) {
            revert ParanetErrors.ParanetServiceHasAlreadyBeenRegistered(
                paranetServiceKAStorageContract,
                paranetServiceKATokenId
            );
        }

        return
            psr.registerParanetService(
                paranetServiceKAStorageContract,
                paranetServiceKATokenId,
                paranetServiceName,
                paranetServiceDescription,
                worker,
                paranetServiceMetadata
            );
    }

    function transferParanetServiceOwnership(
        address paranetServiceKAStorageContract,
        uint256 paranetServiceKATokenId,
        address operator
    )
        external
        onlyParanetServiceOperator(
            keccak256(abi.encodePacked(paranetServiceKAStorageContract, paranetServiceKATokenId))
        )
    {
        ParanetServicesRegistry psr = paranetServicesRegistry;

        if (
            !psr.paranetServiceExists(
                keccak256(abi.encodePacked(paranetServiceKAStorageContract, paranetServiceKATokenId))
            )
        ) {
            revert ParanetErrors.ParanetServiceDoesntExist(paranetServiceKAStorageContract, paranetServiceKATokenId);
        }

        psr.setOperatorAddress(
            keccak256(abi.encodePacked(paranetServiceKAStorageContract, paranetServiceKATokenId)),
            operator
        );
    }

    function updateParanetServiceWorker(
        address paranetServiceKAStorageContract,
        uint256 paranetServiceKATokenId,
        address worker
    )
        external
        onlyParanetServiceOperator(
            keccak256(abi.encodePacked(paranetServiceKAStorageContract, paranetServiceKATokenId))
        )
    {
        ParanetServicesRegistry psr = paranetServicesRegistry;

        if (
            !psr.paranetServiceExists(
                keccak256(abi.encodePacked(paranetServiceKAStorageContract, paranetServiceKATokenId))
            )
        ) {
            revert ParanetErrors.ParanetServiceDoesntExist(paranetServiceKAStorageContract, paranetServiceKATokenId);
        }

        psr.setWorkerAddress(
            keccak256(abi.encodePacked(paranetServiceKAStorageContract, paranetServiceKATokenId)),
            worker
        );
    }

    function updateParanetServiceName(
        address paranetServiceKAStorageContract,
        uint256 paranetServiceKATokenId,
        string calldata paranetServiceName
    )
        external
        onlyParanetServiceOperator(
            keccak256(abi.encodePacked(paranetServiceKAStorageContract, paranetServiceKATokenId))
        )
    {
        ParanetServicesRegistry psr = paranetServicesRegistry;

        if (
            !psr.paranetServiceExists(
                keccak256(abi.encodePacked(paranetServiceKAStorageContract, paranetServiceKATokenId))
            )
        ) {
            revert ParanetErrors.ParanetServiceDoesntExist(paranetServiceKAStorageContract, paranetServiceKATokenId);
        }

        psr.setName(
            keccak256(abi.encodePacked(paranetServiceKAStorageContract, paranetServiceKATokenId)),
            paranetServiceName
        );
    }

    function updateParanetServiceDescription(
        address paranetServiceKAStorageContract,
        uint256 paranetServiceKATokenId,
        string calldata paranetServiceDescription
    )
        external
        onlyParanetServiceOperator(
            keccak256(abi.encodePacked(paranetServiceKAStorageContract, paranetServiceKATokenId))
        )
    {
        ParanetServicesRegistry psr = paranetServicesRegistry;

        if (
            !psr.paranetServiceExists(
                keccak256(abi.encodePacked(paranetServiceKAStorageContract, paranetServiceKATokenId))
            )
        ) {
            revert ParanetErrors.ParanetServiceDoesntExist(paranetServiceKAStorageContract, paranetServiceKATokenId);
        }

        psr.setDescription(
            keccak256(abi.encodePacked(paranetServiceKAStorageContract, paranetServiceKATokenId)),
            paranetServiceDescription
        );
    }

    function mintKnowledgeAsset(
        address paranetKnowledgeAssetStorageContract,
        uint256 paranetTokenId,
        ContentAssetStructs.AssetInputArgs calldata knowledgeAssetArgs
    ) external {
        ParanetsRegistry pr = paranetsRegistry;
        ParanetKnowledgeMinersRegistry pkmr = paranetKnowledgeMinersRegistry;
        ParanetKnowledgeAssetsRegistry pkar = paranetKnowledgeAssetsRegistry;
        ContentAssetV2 ca = contentAsset;

        // Check if Paranet exists
        // If not: Throw an error
        if (!pr.paranetExists(keccak256(abi.encodePacked(paranetKnowledgeAssetStorageContract, paranetTokenId)))) {
            revert ParanetErrors.ParanetDoesntExist(paranetKnowledgeAssetStorageContract, paranetTokenId);
        }

        // Check if Knowledge Miner has profile
        // If not: Create a profile
        if (!pkmr.knowledgeMinerExists()) {
            pkmr.registerKnowledgeMiner(bytes(""));
            pr.addKnowledgeMiner(
                keccak256(abi.encodePacked(paranetKnowledgeAssetStorageContract, paranetTokenId)),
                msg.sender
            );
        }

        // Mint Knowledge Asset
        uint256 knowledgeAssetTokenId = ca.createAsset(knowledgeAssetArgs);

        // Add Knowledge Asset to the KnowledgeAssetsRegistry
        pkar.addKnowledgeAsset(
            keccak256(abi.encodePacked(paranetKnowledgeAssetStorageContract, paranetTokenId)),
            address(contentAssetStorage),
            knowledgeAssetTokenId,
            bytes("")
        );

        // Add Knowledge Asset Metadata to the ParanetsRegistry
        pr.addKnowledgeAsset(
            keccak256(abi.encodePacked(paranetKnowledgeAssetStorageContract, paranetTokenId)),
            keccak256(abi.encodePacked(address(contentAssetStorage), knowledgeAssetTokenId))
        );
        pr.addCumulativeKnowledgeValue(
            keccak256(abi.encodePacked(paranetKnowledgeAssetStorageContract, paranetTokenId)),
            knowledgeAssetArgs.tokenAmount
        );

        // Add Knowledge Asset Metadata to the KnowledgeMinersRegistry
        pkmr.addSubmittedKnowledgeAsset(
            keccak256(abi.encodePacked(paranetKnowledgeAssetStorageContract, paranetTokenId)),
            keccak256(abi.encodePacked(address(contentAssetStorage), knowledgeAssetTokenId))
        );
        pkmr.addCumulativeTracSpent(
            keccak256(abi.encodePacked(paranetKnowledgeAssetStorageContract, paranetTokenId)),
            knowledgeAssetArgs.tokenAmount
        );
        pkmr.addUnrewardedTracSpent(
            keccak256(abi.encodePacked(paranetKnowledgeAssetStorageContract, paranetTokenId)),
            knowledgeAssetArgs.tokenAmount
        );
        pkmr.incrementTotalSubmittedKnowledgeAssetsCount();
        pkmr.addTotalTracSpent(knowledgeAssetArgs.tokenAmount);
    }

    function submitKnowledgeAsset(
        address paranetKnowledgeAssetStorageContract,
        uint256 paranetTokenId,
        address knowledgeAssetStorageContract,
        uint256 knowledgeAssetTokenId
    ) external {
        ParanetsRegistry pr = paranetsRegistry;
        ParanetKnowledgeMinersRegistry pkmr = paranetKnowledgeMinersRegistry;
        ParanetKnowledgeAssetsRegistry pkar = paranetKnowledgeAssetsRegistry;

        if (!pr.paranetExists(keccak256(abi.encodePacked(knowledgeAssetStorageContract, paranetTokenId)))) {
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

        uint96 remainingTokenAmount = serviceAgreementStorageProxy.getAgreementTokenAmount(
            hashingProxy.callHashFunction(
                HASH_FUNCTION_ID,
                abi.encodePacked(
                    address(contentAssetStorage),
                    knowledgeAssetTokenId,
                    abi.encodePacked(
                        address(contentAssetStorage),
                        contentAssetStorage.getAssertionIdByIndex(knowledgeAssetTokenId, 0)
                    )
                )
            )
        );

        // Check if Knowledge Miner has profile
        // If not: Create a profile
        if (!pkmr.knowledgeMinerExists()) {
            pkmr.registerKnowledgeMiner(bytes(""));
            pr.addKnowledgeMiner(
                keccak256(abi.encodePacked(paranetKnowledgeAssetStorageContract, paranetTokenId)),
                msg.sender
            );
        }

        // Add Knowledge Asset to the KnowledgeAssetsRegistry
        pkar.addKnowledgeAsset(
            keccak256(abi.encodePacked(paranetKnowledgeAssetStorageContract, paranetTokenId)),
            address(contentAssetStorage),
            knowledgeAssetTokenId,
            bytes("")
        );

        // Add Knowledge Asset Metadata to the ParanetsRegistry
        pr.addKnowledgeAsset(
            keccak256(abi.encodePacked(paranetKnowledgeAssetStorageContract, paranetTokenId)),
            keccak256(abi.encodePacked(address(contentAssetStorage), knowledgeAssetTokenId))
        );
        pr.addCumulativeKnowledgeValue(
            keccak256(abi.encodePacked(paranetKnowledgeAssetStorageContract, paranetTokenId)),
            remainingTokenAmount
        );

        // Add Knowledge Asset Metadata to the KnowledgeMinersRegistry
        pkmr.addSubmittedKnowledgeAsset(
            keccak256(abi.encodePacked(paranetKnowledgeAssetStorageContract, paranetTokenId)),
            keccak256(abi.encodePacked(address(contentAssetStorage), knowledgeAssetTokenId))
        );
        pkmr.addCumulativeTracSpent(
            keccak256(abi.encodePacked(paranetKnowledgeAssetStorageContract, paranetTokenId)),
            remainingTokenAmount
        );
        pkmr.incrementTotalSubmittedKnowledgeAssetsCount();
        pkmr.addTotalTracSpent(remainingTokenAmount);
    }

    function _checkParanetOperator(bytes32 paranetId) internal view virtual {
        require(paranetsRegistry.getOperatorAddress(paranetId) == msg.sender, "Fn can only be used by operator");
    }

    function _checkParanetServiceOperator(bytes32 paranetServiceId) internal view virtual {
        require(
            paranetServicesRegistry.getOperatorAddress(paranetServiceId) == msg.sender,
            "Fn can only be used by operator"
        );
    }
}
