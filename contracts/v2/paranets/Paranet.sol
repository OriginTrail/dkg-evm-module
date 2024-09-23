// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {ContentAssetStorageV2} from "../storage/assets/ContentAssetStorage.sol";
import {ContentAssetV2} from "../assets/ContentAsset.sol";
import {HubV2} from "../Hub.sol";
import {ParanetKnowledgeAssetsRegistry} from "../storage/paranets/ParanetKnowledgeAssetsRegistry.sol";
import {ParanetKnowledgeMinersRegistry} from "../storage/paranets/ParanetKnowledgeMinersRegistry.sol";
import {ParanetsRegistry} from "../storage/paranets/ParanetsRegistry.sol";
import {ParanetServicesRegistry} from "../storage/paranets/ParanetServicesRegistry.sol";
import {ProfileStorage} from "../../v1/storage/ProfileStorage.sol";
import {ServiceAgreementStorageProxy} from "../../v1/storage/ServiceAgreementStorageProxy.sol";
import {HashingProxy} from "../../v1/HashingProxy.sol";
import {ContractStatusV2} from "../abstract/ContractStatus.sol";
import {Initializable} from "../../v1/interface/Initializable.sol";
import {Named} from "../../v1/interface/Named.sol";
import {Versioned} from "../../v1/interface/Versioned.sol";
import {ContentAssetStructs} from "../../v1/structs/assets/ContentAssetStructs.sol";
import {ParanetStructs} from "../structs/paranets/ParanetStructs.sol";
import {ParanetErrors} from "../errors/paranets/ParanetErrors.sol";
import {ProfileErrors} from "../../v1/errors/ProfileErrors.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {HASH_FUNCTION_ID} from "../../v1/constants/assets/ContentAssetConstants.sol";

contract Paranet is Named, Versioned, ContractStatusV2, Initializable {
    event ParanetRegistered(
        address indexed paranetKAStorageContract,
        uint256 indexed paranetKATokenId,
        string paranetName,
        string paranetDescription,
        ParanetStructs.AccessPolicy nodesAccessPolicy,
        ParanetStructs.AccessPolicy minersAccessPolicy
    );
    event ParanetCuratedNodeAdded(
        address indexed paranetKAStorageContract,
        uint256 indexed paranetKATokenId,
        uint72 identityId
    );
    event ParanetCuratedNodeRemoved(
        address indexed paranetKAStorageContract,
        uint256 indexed paranetKATokenId,
        uint72 identityId
    );
    event ParanetIncetivesPoolDeployed(
        address indexed paranetKAStorageContract,
        uint256 indexed paranetKATokenId,
        ParanetStructs.IncentivesPool incentivesPool
    );
    event ParanetMetadataUpdated(
        address indexed paranetKAStorageContract,
        uint256 indexed paranetKATokenId,
        string newParanetName,
        string newParanetDescription,
        ParanetStructs.AccessPolicy minersPolicy
    );
    event ParanetServiceAdded(
        address indexed paranetKAStorageContract,
        uint256 indexed paranetKATokenId,
        address indexed paranetServiceKAStorageContract,
        uint256 paranetServiceKATokenId
    );
    event ParanetServiceRegistered(
        address indexed paranetServiceKAStorageContract,
        uint256 indexed paranetServiceKATokenId,
        string paranetServiceName,
        string paranetServiceDescription,
        address[] paranetServiceAddresses
    );
    event ParanetServiceMetadataUpdated(
        address indexed paranetServiceKAStorageContract,
        uint256 indexed paranetServiceKATokenId,
        string newParanetServiceName,
        string newParanetServiceDescription,
        address[] newParanetServiceAddresses
    );
    event KnowledgeAssetSubmittedToParanet(
        address indexed paranetKAStorageContract,
        uint256 indexed paranetKATokenId,
        address indexed knowledgeAssetStorageContract,
        uint256 knowledgeAssetTokenId
    );

    event KnowledgeMinersWhitelisted(
        address indexed paranetServiceKAStorageContract,
        uint256 indexed paranetServiceKATokenId,
        address[] knowledgeMinersAddresses
    );

    event ParanetKnowledgeMiningAccessRequsted(
        address indexed paranetServiceKAStorageContract,
        uint256 indexed paranetServiceKATokenId,
        address knowledgeMinerAddress
    );

    event ParanetKnowledgeMiningAccessRequestApproved(
        address indexed paranetServiceKAStorageContract,
        uint256 indexed paranetServiceKATokenId,
        address knowledgeMinerAddress,
        ParanetStructs.ParanetKnowledgeMinerAccessRequestStatus requestStatus
    );

    event ParanetKnowledgeMiningAccessRequestDenied(
        address indexed paranetServiceKAStorageContract,
        uint256 indexed paranetServiceKATokenId,
        address knowledgeMinerAddress,
        ParanetStructs.ParanetKnowledgeMinerAccessRequestStatus requestStatus
    );

    string private constant _NAME = "Paranet";
    string private constant _VERSION = "2.2.0";

    ParanetsRegistry public paranetsRegistry;
    ParanetServicesRegistry public paranetServicesRegistry;
    ParanetKnowledgeMinersRegistry public paranetKnowledgeMinersRegistry;
    ParanetKnowledgeAssetsRegistry public paranetKnowledgeAssetsRegistry;
    ProfileStorage public profileStorage;
    ContentAssetStorageV2 public contentAssetStorage;
    ContentAssetV2 public contentAsset;
    HashingProxy public hashingProxy;
    ServiceAgreementStorageProxy public serviceAgreementStorageProxy;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) ContractStatusV2(hubAddress) {}

    modifier onlyKnowledgeAssetOwner(address knowledgeAssetStorageContract, uint256 knowledgeAssetTokenId) {
        _checkKnowledgeAssetOwner(knowledgeAssetStorageContract, knowledgeAssetTokenId);
        _;
    }

    function initialize() public onlyHubOwner {
        profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
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
        ParanetStructs.AccessPolicy nodesAccessPolicy,
        ParanetStructs.AccessPolicy minersAccessPolicy
    ) external onlyKnowledgeAssetOwner(paranetKAStorageContract, paranetKATokenId) returns (bytes32) {
        ParanetsRegistry pr = paranetsRegistry;

        if (pr.paranetExists(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)))) {
            revert ParanetErrors.ParanetHasAlreadyBeenRegistered(paranetKAStorageContract, paranetKATokenId);
        }

        emit ParanetRegistered(
            paranetKAStorageContract,
            paranetKATokenId,
            paranetName,
            paranetDescription,
            nodesAccessPolicy,
            minersAccessPolicy
        );

        return
            pr.registerParanet(
                paranetKAStorageContract,
                paranetKATokenId,
                paranetName,
                paranetDescription,
                nodesAccessPolicy,
                minersAccessPolicy
            );
    }

    function updateParanetMetadata(
        address paranetKAStorageContract,
        uint256 paranetKATokenId,
        string calldata paranetName,
        string calldata paranetDescription,
        ParanetStructs.AccessPolicy minersAccessPolicy
    ) external onlyKnowledgeAssetOwner(paranetKAStorageContract, paranetKATokenId) {
        ParanetsRegistry pr = paranetsRegistry;

        if (!pr.paranetExists(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)))) {
            revert ParanetErrors.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        pr.setName(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)), paranetName);
        pr.setDescription(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)), paranetDescription);
        pr.setMinersAccessPolicy(
            keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
            minersAccessPolicy
        );

        emit ParanetMetadataUpdated(
            paranetKAStorageContract,
            paranetKATokenId,
            paranetName,
            paranetDescription,
            minersAccessPolicy
        );
    }

    function addParanetCuratedNodes(
        address paranetKAStorageContract,
        uint256 paranetKATokenId,
        uint72[] calldata identityIds
    ) external onlyKnowledgeAssetOwner(paranetKAStorageContract, paranetKATokenId) {
        ParanetsRegistry pr = paranetsRegistry;
        ProfileStorage ps = profileStorage;

        if (!pr.paranetExists(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)))) {
            revert ParanetErrors.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        if (
            pr.getNodesAccessPolicy(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId))) !=
            ParanetStructs.AccessPolicy.CURATED
        ) {
            ParanetStructs.AccessPolicy[] memory expectedAccessPolicies = new ParanetStructs.AccessPolicy[](1);
            expectedAccessPolicies[0] = ParanetStructs.AccessPolicy.CURATED;

            revert ParanetErrors.InvalidParanetNodesAccessPolicy(
                expectedAccessPolicies,
                pr.getNodesAccessPolicy(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)))
            );
        }

        for (uint256 i; i < identityIds.length; ) {
            if (!ps.profileExists(identityIds[i])) {
                revert ProfileErrors.ProfileDoesntExist(identityIds[i]);
            }

            if (
                pr.isCuratedNode(
                    keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
                    identityIds[i]
                )
            ) {
                revert ParanetErrors.ParanetCuratedNodeHasAlreadyBeenAdded(
                    keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
                    identityIds[i]
                );
            }

            pr.addCuratedNode(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)), identityIds[i]);

            emit ParanetCuratedNodeAdded(paranetKAStorageContract, paranetKATokenId, identityIds[i]);

            unchecked {
                i++;
            }
        }
    }

    function removeParanetCuratedNodes(
        address paranetKAStorageContract,
        uint256 paranetKATokenId,
        uint72[] calldata identityIds
    ) external onlyKnowledgeAssetOwner(paranetKAStorageContract, paranetKATokenId) {
        ParanetsRegistry pr = paranetsRegistry;

        if (!pr.paranetExists(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)))) {
            revert ParanetErrors.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        if (
            pr.getNodesAccessPolicy(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId))) !=
            ParanetStructs.AccessPolicy.CURATED
        ) {
            ParanetStructs.AccessPolicy[] memory expectedAccessPolicies = new ParanetStructs.AccessPolicy[](1);
            expectedAccessPolicies[0] = ParanetStructs.AccessPolicy.CURATED;

            revert ParanetErrors.InvalidParanetNodesAccessPolicy(
                expectedAccessPolicies,
                pr.getNodesAccessPolicy(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)))
            );
        }

        for (uint256 i; i < identityIds.length; ) {
            if (
                !pr.isCuratedNode(
                    keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
                    identityIds[i]
                )
            ) {
                revert ParanetErrors.ParanetCuratedNodeDoesntExist(
                    keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
                    identityIds[i]
                );
            }

            pr.removeCuratedNode(
                keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
                identityIds[i]
            );

            emit ParanetCuratedNodeRemoved(paranetKAStorageContract, paranetKATokenId, identityIds[i]);

            unchecked {
                i++;
            }
        }
    }

    function addParanetServices(
        address paranetKAStorageContract,
        uint256 paranetKATokenId,
        ParanetStructs.UniversalAssetLocator[] calldata services
    ) external onlyKnowledgeAssetOwner(paranetKAStorageContract, paranetKATokenId) {
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

            _checkKnowledgeAssetOwner(services[i].knowledgeAssetStorageContract, services[i].tokenId);

            if (
                pr.isServiceImplemented(
                    keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
                    keccak256(abi.encodePacked(services[i].knowledgeAssetStorageContract, services[i].tokenId))
                )
            ) {
                revert ParanetErrors.ParanetServiceHasAlreadyBeenAdded(
                    keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
                    keccak256(abi.encodePacked(services[i].knowledgeAssetStorageContract, services[i].tokenId))
                );
            }

            pr.addService(
                keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
                keccak256(abi.encodePacked(services[i].knowledgeAssetStorageContract, services[i].tokenId))
            );

            emit ParanetServiceAdded(
                paranetKAStorageContract,
                paranetKATokenId,
                services[i].knowledgeAssetStorageContract,
                services[i].tokenId
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
        address[] calldata paranetServiceAddresses
    ) external onlyKnowledgeAssetOwner(paranetServiceKAStorageContract, paranetServiceKATokenId) returns (bytes32) {
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

        emit ParanetServiceRegistered(
            paranetServiceKAStorageContract,
            paranetServiceKATokenId,
            paranetServiceName,
            paranetServiceDescription,
            paranetServiceAddresses
        );

        return
            psr.registerParanetService(
                paranetServiceKAStorageContract,
                paranetServiceKATokenId,
                paranetServiceName,
                paranetServiceDescription,
                paranetServiceAddresses
            );
    }

    function updateParanetServiceMetadata(
        address paranetServiceKAStorageContract,
        uint256 paranetServiceKATokenId,
        string calldata paranetServiceName,
        string calldata paranetServiceDescription,
        address[] calldata paranetServiceAddresses
    ) external onlyKnowledgeAssetOwner(paranetServiceKAStorageContract, paranetServiceKATokenId) {
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
        psr.setDescription(
            keccak256(abi.encodePacked(paranetServiceKAStorageContract, paranetServiceKATokenId)),
            paranetServiceDescription
        );
        psr.setParanetServiceAddresses(
            keccak256(abi.encodePacked(paranetServiceKAStorageContract, paranetServiceKATokenId)),
            paranetServiceAddresses
        );

        emit ParanetServiceMetadataUpdated(
            paranetServiceKAStorageContract,
            paranetServiceKATokenId,
            paranetServiceName,
            paranetServiceDescription,
            paranetServiceAddresses
        );
    }

    function requestParanetKnowledgeMiningAccess(address paranetKAStorageContract, uint256 paranetKATokenId) external {
        ParanetsRegistry pr = paranetsRegistry;
        bytes32 paranetId = keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId));
        ParanetKnowledgeMinersRegistry pkmr = paranetKnowledgeMinersRegistry;

        if (!pr.paranetExists(paranetId)) {
            revert ParanetErrors.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        if (!pkmr.knowledgeMinerExists(msg.sender)) {
            pkmr.registerKnowledgeMiner(msg.sender);
        }

        // revert if knowledge miner is already registered
        if (pr.isKnowledgeMinerRegistered(paranetId, msg.sender)) {
            revert ParanetErrors.KnowledgeMinerAlreadyRegistered(paranetId, msg.sender);
        }

        // Get the latest request status
        ParanetStructs.ParanetKnowledgeMinerAccessRequestStatus requestStatus = pr.getKnowledgeMinerAccessRequestStatus(
            paranetId,
            msg.sender
        );

        if (requestStatus == ParanetStructs.ParanetKnowledgeMinerAccessRequestStatus.PENDING) {
            revert ParanetErrors.ParanetKnowledgeMiningAccessRequestAlreadyExists(paranetId, msg.sender, requestStatus);
        }

        // Request knowledge minibg access
        pr.requestParanetKnowledgeMiningAccess(paranetId, msg.sender);

        emit ParanetKnowledgeMiningAccessRequsted(paranetKAStorageContract, paranetKATokenId, msg.sender);
    }

    function acceptParanetKnowledgeMiningAccessRequest(
        address paranetKAStorageContract,
        uint256 paranetKATokenId,
        address knowledgeMinerAddress
    ) external onlyKnowledgeAssetOwner(paranetKAStorageContract, paranetKATokenId) {
        ParanetsRegistry pr = paranetsRegistry;
        bytes32 paranetId = keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId));
        ParanetKnowledgeMinersRegistry pkmr = paranetKnowledgeMinersRegistry;

        if (!pr.paranetExists(paranetId)) {
            revert ParanetErrors.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        // Knowledge miner should exist
        if (!pkmr.knowledgeMinerExists(knowledgeMinerAddress)) {
            revert ParanetErrors.KnowledgeMinerDoesNotExistInParanet(paranetId, knowledgeMinerAddress);
        }

        // Revert if knowledge miner is already registered
        if (pr.isKnowledgeMinerRegistered(paranetId, knowledgeMinerAddress)) {
            revert ParanetErrors.KnowledgeMinerAlreadyRegistered(paranetId, knowledgeMinerAddress);
        }

        // Get the latest request status
        ParanetStructs.ParanetKnowledgeMinerAccessRequestStatus requestStatus = pr.getKnowledgeMinerAccessRequestStatus(
            paranetId,
            msg.sender
        );

        if (requestStatus == ParanetStructs.ParanetKnowledgeMinerAccessRequestStatus.NONE) {
            revert ParanetErrors.ParanetKnowledgeMiningAccessRequestDoesNotExists(
                paranetId,
                knowledgeMinerAddress,
                requestStatus
            );
        }

        // Accept knowledge mining access and add knowledge miner to paranet
        pr.acceptParanetKnowledgeMiningAccessRequest(paranetId, knowledgeMinerAddress);
        pr.addKnowledgeMiner(paranetId, knowledgeMinerAddress);

        emit ParanetKnowledgeMiningAccessRequestApproved(
            paranetKAStorageContract,
            paranetKATokenId,
            knowledgeMinerAddress,
            ParanetStructs.ParanetKnowledgeMinerAccessRequestStatus.APPROVED
        );
    }

    function denyParanetKnowledgeMiningAccessRequest(
        address paranetKAStorageContract,
        uint256 paranetKATokenId,
        address knowledgeMinerAddress
    ) external onlyKnowledgeAssetOwner(paranetKAStorageContract, paranetKATokenId) {
        ParanetsRegistry pr = paranetsRegistry;
        bytes32 paranetId = keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId));
        ParanetKnowledgeMinersRegistry pkmr = paranetKnowledgeMinersRegistry;

        if (!pr.paranetExists(paranetId)) {
            revert ParanetErrors.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        // Knowledge miner should exist
        if (!pkmr.knowledgeMinerExists(knowledgeMinerAddress)) {
            revert ParanetErrors.KnowledgeMinerDoesNotExistInParanet(paranetId, knowledgeMinerAddress);
        }

        // Revert if knowledge miner is already registered
        if (pr.isKnowledgeMinerRegistered(paranetId, knowledgeMinerAddress)) {
            revert ParanetErrors.KnowledgeMinerAlreadyRegistered(paranetId, knowledgeMinerAddress);
        }

        // Get the latest request status
        ParanetStructs.ParanetKnowledgeMinerAccessRequestStatus requestStatus = pr.getKnowledgeMinerAccessRequestStatus(
            paranetId,
            msg.sender
        );

        if (requestStatus == ParanetStructs.ParanetKnowledgeMinerAccessRequestStatus.NONE) {
            revert ParanetErrors.ParanetKnowledgeMiningAccessRequestDoesNotExists(
                paranetId,
                knowledgeMinerAddress,
                requestStatus
            );
        }

        // Deny knowledge mining access
        pr.denyParanetKnowledgeMiningAccessRequest(paranetId, knowledgeMinerAddress);

        emit ParanetKnowledgeMiningAccessRequestDenied(
            paranetKAStorageContract,
            paranetKATokenId,
            knowledgeMinerAddress,
            ParanetStructs.ParanetKnowledgeMinerAccessRequestStatus.DENIED
        );
    }

    function whitelistKnowledgeMiners(
        address paranetKAStorageContract,
        uint256 paranetKATokenId,
        address[] calldata knowledgeMinersAddresses
    ) external onlyKnowledgeAssetOwner(paranetKAStorageContract, paranetKATokenId) {
        ParanetsRegistry pr = paranetsRegistry;
        bytes32 paranetId = keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId));
        ParanetKnowledgeMinersRegistry pkmr = paranetKnowledgeMinersRegistry;

        if (!pr.paranetExists(paranetId)) {
            revert ParanetErrors.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        ParanetStructs.AccessPolicy paranetAccessPolicy = pr.getMinersAccessPolicy(paranetId);
        if (!(paranetAccessPolicy == ParanetStructs.AccessPolicy.CURATED)) {
            revert ParanetErrors.InvalidAccessPolicy(paranetId, paranetAccessPolicy);
        }

        for (uint256 i; i < knowledgeMinersAddresses.length; ) {
            address knowledgeMinerAddress = knowledgeMinersAddresses[i];

            if (!pkmr.knowledgeMinerExists(knowledgeMinerAddress)) {
                pkmr.registerKnowledgeMiner(knowledgeMinerAddress);
            }

            if (!pr.isKnowledgeMinerRegistered(paranetId, knowledgeMinerAddress)) {
                pr.addKnowledgeMiner(paranetId, knowledgeMinerAddress);
            }

            unchecked {
                ++i;
            }
        }

        emit KnowledgeMinersWhitelisted(paranetKAStorageContract, paranetKATokenId, knowledgeMinersAddresses);
    }

    function mintKnowledgeAsset(
        address paranetKAStorageContract,
        uint256 paranetKATokenId,
        ContentAssetStructs.AssetInputArgs calldata knowledgeAssetArgs
    ) external returns (uint256) {
        ParanetsRegistry pr = paranetsRegistry;
        bytes32 paranetId = keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId));

        // Check if Paranet exists
        // If not: Throw an error
        if (!pr.paranetExists(paranetId)) {
            revert ParanetErrors.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        bool knowledgeMinerExists = paranetKnowledgeMinersRegistry.knowledgeMinerExists(msg.sender);

        // Check if paranet is curated and if knowledge miner is whitelisted
        if (pr.getMinersAccessPolicy(paranetId) == ParanetStructs.AccessPolicy.CURATED && !knowledgeMinerExists) {
            revert ParanetErrors.KnowledgeMinerDoesNotExistInCuratedParanet(paranetId, msg.sender);
        }

        // Check if Knowledge Miner has profile
        // If not: Create a profile
        if (!knowledgeMinerExists) {
            paranetKnowledgeMinersRegistry.registerKnowledgeMiner(msg.sender);
        }

        // Check if Knowledge Miner is registert to paranet
        if (!pr.isKnowledgeMinerRegistered(paranetId, msg.sender)) {
            pr.addKnowledgeMiner(paranetId, msg.sender);
        }

        // Mint Knowledge Asset
        uint256 knowledgeAssetTokenId = contentAsset.createAssetFromContract(msg.sender, knowledgeAssetArgs);

        _updateSubmittedKnowledgeAssetMetadata(
            paranetKAStorageContract,
            paranetKATokenId,
            address(contentAssetStorage),
            knowledgeAssetTokenId,
            knowledgeAssetArgs.tokenAmount
        );

        emit KnowledgeAssetSubmittedToParanet(
            paranetKAStorageContract,
            paranetKATokenId,
            address(contentAssetStorage),
            knowledgeAssetTokenId
        );

        return knowledgeAssetTokenId;
    }

    function submitKnowledgeAsset(
        address paranetKAStorageContract,
        uint256 paranetKATokenId,
        address knowledgeAssetStorageContract,
        uint256 knowledgeAssetTokenId
    ) external onlyKnowledgeAssetOwner(knowledgeAssetStorageContract, knowledgeAssetTokenId) {
        ParanetsRegistry pr = paranetsRegistry;
        bytes32 paranetId = keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId));

        if (!pr.paranetExists(paranetId)) {
            revert ParanetErrors.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        bool knowledgeMinerExists = paranetKnowledgeMinersRegistry.knowledgeMinerExists(msg.sender);

        // Check if paranet is curated and if knowledge miner is whitelisted
        if (pr.getMinersAccessPolicy(paranetId) == ParanetStructs.AccessPolicy.CURATED && !knowledgeMinerExists) {
            revert ParanetErrors.KnowledgeMinerDoesNotExistInCuratedParanet(paranetId, msg.sender);
        }

        if (paranetKnowledgeAssetsRegistry.isParanetKnowledgeAsset(paranetId)) {
            revert ParanetErrors.KnowledgeAssetIsAPartOfOtherParanet(
                knowledgeAssetStorageContract,
                knowledgeAssetTokenId,
                paranetKnowledgeAssetsRegistry.getParanetId(
                    keccak256(abi.encodePacked(knowledgeAssetStorageContract, knowledgeAssetTokenId))
                )
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
        if (!knowledgeMinerExists) {
            paranetKnowledgeMinersRegistry.registerKnowledgeMiner(msg.sender);
        }

        // Check if Knowledge Miner is registert to paranet
        // If not: Register it
        if (!pr.isKnowledgeMinerRegistered(paranetId, msg.sender)) {
            pr.addKnowledgeMiner(paranetId, msg.sender);
        }

        _updateSubmittedKnowledgeAssetMetadata(
            paranetKAStorageContract,
            paranetKATokenId,
            knowledgeAssetStorageContract,
            knowledgeAssetTokenId,
            remainingTokenAmount
        );

        emit KnowledgeAssetSubmittedToParanet(
            paranetKAStorageContract,
            paranetKATokenId,
            knowledgeAssetStorageContract,
            knowledgeAssetTokenId
        );
    }

    function processUpdatedKnowledgeAssetStatesMetadata(
        address paranetKAStorageContract,
        uint256 paranetKATokenId,
        uint256 start,
        uint256 end
    ) external {
        _processUpdatedKnowledgeAssetStatesMetadata(
            keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
            paranetKnowledgeMinersRegistry.getUpdatingKnowledgeAssetStates(
                msg.sender,
                keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
                start,
                end
            )
        );
    }

    function _updateSubmittedKnowledgeAssetMetadata(
        address paranetKAStorageContract,
        uint256 paranetKATokenId,
        address knowledgeAssetStorageContract,
        uint256 knowledgeAssetTokenId,
        uint96 tokenAmount
    ) internal {
        ParanetsRegistry pr = paranetsRegistry;
        ParanetKnowledgeMinersRegistry pkmr = paranetKnowledgeMinersRegistry;

        // Add Knowledge Asset to the KnowledgeAssetsRegistry
        paranetKnowledgeAssetsRegistry.addKnowledgeAsset(
            keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
            knowledgeAssetStorageContract,
            knowledgeAssetTokenId,
            msg.sender
        );

        // Add Knowledge Asset Metadata to the ParanetsRegistry
        pr.addKnowledgeAsset(
            keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
            keccak256(abi.encodePacked(knowledgeAssetStorageContract, knowledgeAssetTokenId))
        );
        pr.addCumulativeKnowledgeValue(
            keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
            tokenAmount
        );

        // Add Knowledge Asset Metadata to the KnowledgeMinersRegistry
        pkmr.addSubmittedKnowledgeAsset(
            msg.sender,
            keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
            keccak256(abi.encodePacked(knowledgeAssetStorageContract, knowledgeAssetTokenId))
        );
        pkmr.addCumulativeTracSpent(
            msg.sender,
            keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
            tokenAmount
        );
        pkmr.addUnrewardedTracSpent(
            msg.sender,
            keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
            tokenAmount
        );
        pkmr.incrementTotalSubmittedKnowledgeAssetsCount(msg.sender);
        pkmr.addTotalTracSpent(msg.sender, tokenAmount);
    }

    function _processUpdatedKnowledgeAssetStatesMetadata(
        bytes32 paranetId,
        ParanetStructs.UpdatingKnowledgeAssetState[] memory updatingKnowledgeAssetStates
    ) internal {
        ParanetKnowledgeMinersRegistry pkmr = paranetKnowledgeMinersRegistry;
        ParanetsRegistry pr = paranetsRegistry;
        ContentAssetV2 ca = contentAsset;

        for (uint i; i < updatingKnowledgeAssetStates.length; ) {
            _checkKnowledgeAssetOwner(
                updatingKnowledgeAssetStates[i].knowledgeAssetStorageContract,
                updatingKnowledgeAssetStates[i].tokenId
            );

            bool continueOuterLoop = false;

            bytes32[] memory assertionIds = ContentAssetStorageV2(
                updatingKnowledgeAssetStates[i].knowledgeAssetStorageContract
            ).getAssertionIds(updatingKnowledgeAssetStates[i].tokenId);

            for (uint j = assertionIds.length; j > 0; ) {
                if (assertionIds[j - 1] == updatingKnowledgeAssetStates[i].assertionId) {
                    // Add Knowledge Asset Token Amount Metadata to the ParanetsRegistry
                    pr.addCumulativeKnowledgeValue(paranetId, updatingKnowledgeAssetStates[i].updateTokenAmount);

                    // Add Knowledge Asset Token Amount Metadata to the KnowledgeMinersRegistry
                    pkmr.addCumulativeTracSpent(
                        msg.sender,
                        paranetId,
                        updatingKnowledgeAssetStates[i].updateTokenAmount
                    );
                    pkmr.addUnrewardedTracSpent(
                        msg.sender,
                        paranetId,
                        updatingKnowledgeAssetStates[i].updateTokenAmount
                    );
                    pkmr.addTotalTracSpent(msg.sender, updatingKnowledgeAssetStates[i].updateTokenAmount);

                    pkmr.removeUpdatingKnowledgeAssetState(
                        msg.sender,
                        paranetId,
                        keccak256(
                            abi.encodePacked(
                                updatingKnowledgeAssetStates[i].knowledgeAssetStorageContract,
                                updatingKnowledgeAssetStates[i].tokenId,
                                updatingKnowledgeAssetStates[i].assertionId
                            )
                        )
                    );

                    continueOuterLoop = true;
                    break;
                }

                unchecked {
                    j--;
                }
            }

            unchecked {
                i++;
            }

            if (continueOuterLoop) {
                continue;
            }

            try ca.cancelAssetStateUpdateFromContract(updatingKnowledgeAssetStates[i].tokenId) {
                pkmr.removeUpdatingKnowledgeAssetState(
                    msg.sender,
                    paranetId,
                    keccak256(
                        abi.encodePacked(
                            updatingKnowledgeAssetStates[i].knowledgeAssetStorageContract,
                            updatingKnowledgeAssetStates[i].tokenId,
                            updatingKnowledgeAssetStates[i].assertionId
                        )
                    )
                );
                // solhint-disable-next-line no-empty-blocks
            } catch {}
        }
    }

    function _checkParanetOperator(bytes32 paranetId) internal view virtual {
        (address paranetKAStorageContract, uint256 paranetKATokenId) = paranetsRegistry.getParanetKnowledgeAssetLocator(
            paranetId
        );
        _checkKnowledgeAssetOwner(paranetKAStorageContract, paranetKATokenId);
    }

    function _checkParanetServiceOperator(bytes32 paranetServiceId) internal view virtual {
        (address paranetServiceKAStorageContract, uint256 paranetServiceKATokenId) = paranetServicesRegistry
            .getParanetServiceKnowledgeAssetLocator(paranetServiceId);
        _checkKnowledgeAssetOwner(paranetServiceKAStorageContract, paranetServiceKATokenId);
    }

    function _checkKnowledgeAssetOwner(
        address knowledgeAssetStorageContract,
        uint256 knowledgeAssetTokenId
    ) internal view virtual {
        require(hub.isAssetStorage(knowledgeAssetStorageContract), "Given address isn't KA Storage");
        require(
            IERC721(knowledgeAssetStorageContract).ownerOf(knowledgeAssetTokenId) == msg.sender,
            "Caller isn't the owner of the KA"
        );
    }
}
