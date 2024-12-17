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
import {KnowledgeCollectionStorage} from "../../v1/storage/KnowledgeCollectionStorage.sol";
import {IdentityStorage} from "../storage/IdentityStorage.sol";
import {HashingProxy} from "../../v1/HashingProxy.sol";
import {ContractStatusV2} from "../abstract/ContractStatus.sol";
import {Initializable} from "../../v1/interface/Initializable.sol";
import {Named} from "../../v1/interface/Named.sol";
import {Versioned} from "../../v1/interface/Versioned.sol";
import {ContentAssetStructsV2} from "../structs/assets/ContentAssetStructs.sol";
import {ParanetStructs} from "../structs/paranets/ParanetStructs.sol";
import {ParanetErrors} from "../errors/paranets/ParanetErrors.sol";
import {ProfileErrors} from "../../v1/errors/ProfileErrors.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ERC1155Delta} from "../../v1/tokens/ERC1155Delta.sol";
import {HASH_FUNCTION_ID} from "../../v1/constants/assets/ContentAssetConstants.sol";

contract Paranet is Named, Versioned, ContractStatusV2, Initializable {
    event ParanetRegistered(
        address indexed paranetKAStorageContract,
        uint256 indexed paranetKATokenId,
        string paranetName,
        string paranetDescription,
        ParanetStructs.NodesAccessPolicy nodesAccessPolicy,
        ParanetStructs.MinersAccessPolicy minersAccessPolicy,
        ParanetStructs.KnowledgeAssetsAccessPolicy knowledgeAssetsAccessPolicy
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
    event ParanetCuratedNodeJoinRequestCreated(
        address indexed paranetKAStorageContract,
        uint256 indexed paranetKATokenId,
        uint72 identityId
    );
    event ParanetCuratedNodeJoinRequestAccepted(
        address indexed paranetKAStorageContract,
        uint256 indexed paranetKATokenId,
        uint72 identityId
    );
    event ParanetCuratedNodeJoinRequestRejected(
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
        string newParanetDescription
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
    event ParanetCuratedMinerAdded(
        address indexed paranetKAStorageContract,
        uint256 indexed paranetKATokenId,
        address minerAddress
    );
    event ParanetCuratedMinerRemoved(
        address indexed paranetKAStorageContract,
        uint256 indexed paranetKATokenId,
        address minerAddress
    );
    event ParanetCuratedMinerAccessRequestCreated(
        address indexed paranetKAStorageContract,
        uint256 indexed paranetKATokenId,
        address minerAddress
    );
    event ParanetCuratedMinerAccessRequestAccepted(
        address indexed paranetKAStorageContract,
        uint256 indexed paranetKATokenId,
        address minerAddress
    );
    event ParanetCuratedMinerAccessRequestRejected(
        address indexed paranetKAStorageContract,
        uint256 indexed paranetKATokenId,
        address minerAddress
    );

    string private constant _NAME = "Paranet";
    string private constant _VERSION = "2.3.0";

    ParanetsRegistry public paranetsRegistry;
    ParanetServicesRegistry public paranetServicesRegistry;
    ParanetKnowledgeMinersRegistry public paranetKnowledgeMinersRegistry;
    ParanetKnowledgeAssetsRegistry public paranetKnowledgeAssetsRegistry;
    ProfileStorage public profileStorage;
    IdentityStorage public identityStorage;
    ContentAssetStorageV2 public contentAssetStorage;
    ContentAssetV2 public contentAsset;
    HashingProxy public hashingProxy;
    ServiceAgreementStorageProxy public serviceAgreementStorageProxy;
    KnowledgeCollectionStorage public knowledgeCollectionStorage;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) ContractStatusV2(hubAddress) {}

    modifier onlyKnowledgeAssetOwner(address knowledgeAssetStorageContract, uint256 knowledgeAssetTokenId) {
        _checkKnowledgeAssetOwner(knowledgeAssetStorageContract, knowledgeAssetTokenId);
        _;
    }

    function initialize() public onlyHubOwner {
        profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        identityStorage = IdentityStorage(hub.getContractAddress("IdentityStorage"));
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
        knowledgeCollectionStorage = KnowledgeCollectionStorage(
            hub.getAssetStorageAddress("KnowledgeCollectionStorage")
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
        ParanetStructs.NodesAccessPolicy nodesAccessPolicy,
        ParanetStructs.MinersAccessPolicy minersAccessPolicy
    ) external onlyKnowledgeAssetOwner(paranetKAStorageContract, paranetKATokenId) returns (bytes32) {
        ParanetsRegistry pr = paranetsRegistry;

        bytes32 paranetId = keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId));

        if (pr.paranetExists(paranetId)) {
            revert ParanetErrors.ParanetHasAlreadyBeenRegistered(paranetKAStorageContract, paranetKATokenId);
        }

        emit ParanetRegistered(
            paranetKAStorageContract,
            paranetKATokenId,
            paranetName,
            paranetDescription,
            nodesAccessPolicy,
            minersAccessPolicy,
            ParanetStructs.KnowledgeAssetsAccessPolicy.OPEN
        );

        return
            pr.registerParanet(
                paranetKAStorageContract,
                paranetKATokenId,
                paranetName,
                paranetDescription,
                nodesAccessPolicy,
                minersAccessPolicy,
                ParanetStructs.KnowledgeAssetsAccessPolicy.OPEN
            );
    }

    function updateParanetMetadata(
        address paranetKAStorageContract,
        uint256 paranetKATokenId,
        string calldata paranetName,
        string calldata paranetDescription
    ) external onlyKnowledgeAssetOwner(paranetKAStorageContract, paranetKATokenId) {
        ParanetsRegistry pr = paranetsRegistry;

        bytes32 paranetId = keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId));

        if (!pr.paranetExists(paranetId)) {
            revert ParanetErrors.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        pr.setName(paranetId, paranetName);
        pr.setDescription(paranetId, paranetDescription);

        emit ParanetMetadataUpdated(paranetKAStorageContract, paranetKATokenId, paranetName, paranetDescription);
    }

    function addParanetCuratedNodes(
        address paranetKAStorageContract,
        uint256 paranetKATokenId,
        uint72[] calldata identityIds
    ) external onlyKnowledgeAssetOwner(paranetKAStorageContract, paranetKATokenId) {
        ParanetsRegistry pr = paranetsRegistry;
        ProfileStorage ps = profileStorage;

        bytes32 paranetId = keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId));

        if (!pr.paranetExists(paranetId)) {
            revert ParanetErrors.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        if (pr.getNodesAccessPolicy(paranetId) != ParanetStructs.NodesAccessPolicy.CURATED) {
            ParanetStructs.NodesAccessPolicy[] memory expectedAccessPolicies = new ParanetStructs.NodesAccessPolicy[](
                1
            );
            expectedAccessPolicies[0] = ParanetStructs.NodesAccessPolicy.CURATED;

            revert ParanetErrors.InvalidParanetNodesAccessPolicy(
                expectedAccessPolicies,
                pr.getNodesAccessPolicy(paranetId)
            );
        }

        for (uint256 i; i < identityIds.length; ) {
            if (!ps.profileExists(identityIds[i])) {
                revert ProfileErrors.ProfileDoesntExist(identityIds[i]);
            }

            if (pr.isCuratedNode(paranetId, identityIds[i])) {
                revert ParanetErrors.ParanetCuratedNodeHasAlreadyBeenAdded(paranetId, identityIds[i]);
            }

            pr.addCuratedNode(paranetId, identityIds[i], ps.getNodeId(identityIds[i]));

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

        bytes32 paranetId = keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId));

        if (!pr.paranetExists(paranetId)) {
            revert ParanetErrors.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        if (pr.getNodesAccessPolicy(paranetId) != ParanetStructs.NodesAccessPolicy.CURATED) {
            ParanetStructs.NodesAccessPolicy[] memory expectedAccessPolicies = new ParanetStructs.NodesAccessPolicy[](
                1
            );
            expectedAccessPolicies[0] = ParanetStructs.NodesAccessPolicy.CURATED;

            revert ParanetErrors.InvalidParanetNodesAccessPolicy(
                expectedAccessPolicies,
                pr.getNodesAccessPolicy(paranetId)
            );
        }

        for (uint256 i; i < identityIds.length; ) {
            if (!pr.isCuratedNode(paranetId, identityIds[i])) {
                revert ParanetErrors.ParanetCuratedNodeDoesntExist(paranetId, identityIds[i]);
            }

            pr.removeCuratedNode(paranetId, identityIds[i]);

            emit ParanetCuratedNodeRemoved(paranetKAStorageContract, paranetKATokenId, identityIds[i]);

            unchecked {
                i++;
            }
        }
    }

    function requestParanetCuratedNodeAccess(address paranetKAStorageContract, uint256 paranetKATokenId) external {
        ParanetsRegistry pr = paranetsRegistry;

        bytes32 paranetId = keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId));

        if (!pr.paranetExists(paranetId)) {
            revert ParanetErrors.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        if (pr.getNodesAccessPolicy(paranetId) != ParanetStructs.NodesAccessPolicy.CURATED) {
            ParanetStructs.NodesAccessPolicy[] memory expectedAccessPolicies = new ParanetStructs.NodesAccessPolicy[](
                1
            );
            expectedAccessPolicies[0] = ParanetStructs.NodesAccessPolicy.CURATED;

            revert ParanetErrors.InvalidParanetNodesAccessPolicy(
                expectedAccessPolicies,
                pr.getNodesAccessPolicy(paranetId)
            );
        }

        uint72 identityId = identityStorage.getIdentityId(msg.sender);

        if (!profileStorage.profileExists(identityId)) {
            revert ProfileErrors.ProfileDoesntExist(identityId);
        }

        ParanetStructs.ParanetNodeJoinRequest[] memory paranetNodeJoinRequests = pr.getNodeJoinRequests(
            paranetId,
            identityId
        );

        if (
            paranetNodeJoinRequests.length > 0 &&
            paranetNodeJoinRequests[paranetNodeJoinRequests.length - 1].status == ParanetStructs.RequestStatus.PENDING
        ) {
            revert ParanetErrors.ParanetCuratedNodeJoinRequestInvalidStatus(
                paranetId,
                identityId,
                paranetNodeJoinRequests[paranetNodeJoinRequests.length - 1].status
            );
        }

        pr.addNodeJoinRequest(paranetId, identityId, ParanetStructs.RequestStatus.PENDING);

        emit ParanetCuratedNodeJoinRequestCreated(paranetKAStorageContract, paranetKATokenId, identityId);
    }

    function approveCuratedNode(
        address paranetKAStorageContract,
        uint256 paranetKATokenId,
        uint72 identityId
    ) external onlyKnowledgeAssetOwner(paranetKAStorageContract, paranetKATokenId) {
        ParanetsRegistry pr = paranetsRegistry;

        bytes32 paranetId = keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId));

        if (!pr.paranetExists(paranetId)) {
            revert ParanetErrors.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        if (pr.getNodesAccessPolicy(paranetId) != ParanetStructs.NodesAccessPolicy.CURATED) {
            ParanetStructs.NodesAccessPolicy[] memory expectedAccessPolicies = new ParanetStructs.NodesAccessPolicy[](
                1
            );
            expectedAccessPolicies[0] = ParanetStructs.NodesAccessPolicy.CURATED;

            revert ParanetErrors.InvalidParanetNodesAccessPolicy(
                expectedAccessPolicies,
                pr.getNodesAccessPolicy(paranetId)
            );
        }

        ParanetStructs.ParanetNodeJoinRequest[] memory paranetNodeJoinRequests = pr.getNodeJoinRequests(
            paranetId,
            identityId
        );

        if (paranetNodeJoinRequests.length == 0) {
            revert ParanetErrors.ParanetCuratedNodeJoinRequestDoesntExist(paranetId, identityId);
        } else if (
            paranetNodeJoinRequests[paranetNodeJoinRequests.length - 1].status != ParanetStructs.RequestStatus.PENDING
        ) {
            revert ParanetErrors.ParanetCuratedNodeJoinRequestInvalidStatus(
                paranetId,
                identityId,
                paranetNodeJoinRequests[paranetNodeJoinRequests.length - 1].status
            );
        }

        pr.updateNodeJoinRequestStatus(
            paranetId,
            identityId,
            paranetNodeJoinRequests.length - 1,
            ParanetStructs.RequestStatus.APPROVED
        );
        pr.addCuratedNode(paranetId, identityId, profileStorage.getNodeId(identityId));

        emit ParanetCuratedNodeJoinRequestAccepted(paranetKAStorageContract, paranetKATokenId, identityId);
        emit ParanetCuratedNodeAdded(paranetKAStorageContract, paranetKATokenId, identityId);
    }

    function rejectCuratedNode(
        address paranetKAStorageContract,
        uint256 paranetKATokenId,
        uint72 identityId
    ) external onlyKnowledgeAssetOwner(paranetKAStorageContract, paranetKATokenId) {
        ParanetsRegistry pr = paranetsRegistry;

        bytes32 paranetId = keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId));

        if (!pr.paranetExists(paranetId)) {
            revert ParanetErrors.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        if (pr.getNodesAccessPolicy(paranetId) != ParanetStructs.NodesAccessPolicy.CURATED) {
            ParanetStructs.NodesAccessPolicy[] memory expectedAccessPolicies = new ParanetStructs.NodesAccessPolicy[](
                1
            );
            expectedAccessPolicies[0] = ParanetStructs.NodesAccessPolicy.CURATED;

            revert ParanetErrors.InvalidParanetNodesAccessPolicy(
                expectedAccessPolicies,
                pr.getNodesAccessPolicy(paranetId)
            );
        }

        ParanetStructs.ParanetNodeJoinRequest[] memory paranetNodeJoinRequests = pr.getNodeJoinRequests(
            paranetId,
            identityId
        );

        if (paranetNodeJoinRequests.length == 0) {
            revert ParanetErrors.ParanetCuratedNodeJoinRequestDoesntExist(paranetId, identityId);
        } else if (
            paranetNodeJoinRequests[paranetNodeJoinRequests.length - 1].status != ParanetStructs.RequestStatus.PENDING
        ) {
            revert ParanetErrors.ParanetCuratedNodeJoinRequestInvalidStatus(
                paranetId,
                identityId,
                paranetNodeJoinRequests[paranetNodeJoinRequests.length - 1].status
            );
        }

        pr.updateNodeJoinRequestStatus(
            paranetId,
            identityId,
            paranetNodeJoinRequests.length - 1,
            ParanetStructs.RequestStatus.REJECTED
        );

        emit ParanetCuratedNodeJoinRequestRejected(paranetKAStorageContract, paranetKATokenId, identityId);
    }

    function addParanetServices(
        address paranetKAStorageContract,
        uint256 paranetKATokenId,
        ParanetStructs.UniversalAssetLocator[] calldata services
    ) external onlyKnowledgeAssetOwner(paranetKAStorageContract, paranetKATokenId) {
        ParanetsRegistry pr = paranetsRegistry;
        ParanetServicesRegistry psr = paranetServicesRegistry;

        bytes32 paranetId = keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId));

        if (!pr.paranetExists(paranetId)) {
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
                    paranetId,
                    keccak256(abi.encodePacked(services[i].knowledgeAssetStorageContract, services[i].tokenId))
                )
            ) {
                revert ParanetErrors.ParanetServiceHasAlreadyBeenAdded(
                    paranetId,
                    keccak256(abi.encodePacked(services[i].knowledgeAssetStorageContract, services[i].tokenId))
                );
            }

            pr.addService(
                paranetId,
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

        bytes32 paranetServiceId = keccak256(
            abi.encodePacked(paranetServiceKAStorageContract, paranetServiceKATokenId)
        );

        if (psr.paranetServiceExists(paranetServiceId)) {
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

        bytes32 paranetServiceId = keccak256(
            abi.encodePacked(paranetServiceKAStorageContract, paranetServiceKATokenId)
        );

        if (!psr.paranetServiceExists(paranetServiceId)) {
            revert ParanetErrors.ParanetServiceDoesntExist(paranetServiceKAStorageContract, paranetServiceKATokenId);
        }

        psr.setName(paranetServiceId, paranetServiceName);
        psr.setDescription(paranetServiceId, paranetServiceDescription);
        psr.setParanetServiceAddresses(paranetServiceId, paranetServiceAddresses);

        emit ParanetServiceMetadataUpdated(
            paranetServiceKAStorageContract,
            paranetServiceKATokenId,
            paranetServiceName,
            paranetServiceDescription,
            paranetServiceAddresses
        );
    }

    function addParanetCuratedMiners(
        address paranetKAStorageContract,
        uint256 paranetKATokenId,
        address[] calldata minerAddresses
    ) external onlyKnowledgeAssetOwner(paranetKAStorageContract, paranetKATokenId) {
        ParanetsRegistry pr = paranetsRegistry;
        ParanetKnowledgeMinersRegistry pkmr = paranetKnowledgeMinersRegistry;

        bytes32 paranetId = keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId));

        if (!pr.paranetExists(paranetId)) {
            revert ParanetErrors.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        if (pr.getMinersAccessPolicy(paranetId) != ParanetStructs.MinersAccessPolicy.CURATED) {
            ParanetStructs.MinersAccessPolicy[] memory expectedAccessPolicies = new ParanetStructs.MinersAccessPolicy[](
                1
            );
            expectedAccessPolicies[0] = ParanetStructs.MinersAccessPolicy.CURATED;

            revert ParanetErrors.InvalidParanetMinersAccessPolicy(
                expectedAccessPolicies,
                pr.getMinersAccessPolicy(paranetId)
            );
        }

        for (uint256 i; i < minerAddresses.length; ) {
            if (!pkmr.knowledgeMinerExists(minerAddresses[i])) {
                pkmr.registerKnowledgeMiner(minerAddresses[i]);
            }

            if (pr.isKnowledgeMinerRegistered(paranetId, minerAddresses[i])) {
                revert ParanetErrors.ParanetCuratedMinerHasAlreadyBeenAdded(paranetId, minerAddresses[i]);
            }

            pr.addKnowledgeMiner(paranetId, minerAddresses[i]);

            emit ParanetCuratedMinerAdded(paranetKAStorageContract, paranetKATokenId, minerAddresses[i]);

            unchecked {
                i++;
            }
        }
    }

    function removeParanetCuratedMiners(
        address paranetKAStorageContract,
        uint256 paranetKATokenId,
        address[] calldata minerAddresses
    ) external onlyKnowledgeAssetOwner(paranetKAStorageContract, paranetKATokenId) {
        ParanetsRegistry pr = paranetsRegistry;

        bytes32 paranetId = keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId));

        if (!pr.paranetExists(paranetId)) {
            revert ParanetErrors.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        if (pr.getMinersAccessPolicy(paranetId) != ParanetStructs.MinersAccessPolicy.CURATED) {
            ParanetStructs.MinersAccessPolicy[] memory expectedAccessPolicies = new ParanetStructs.MinersAccessPolicy[](
                1
            );
            expectedAccessPolicies[0] = ParanetStructs.MinersAccessPolicy.CURATED;

            revert ParanetErrors.InvalidParanetMinersAccessPolicy(
                expectedAccessPolicies,
                pr.getMinersAccessPolicy(paranetId)
            );
        }

        for (uint256 i; i < minerAddresses.length; ) {
            if (!pr.isKnowledgeMinerRegistered(paranetId, minerAddresses[i])) {
                revert ParanetErrors.ParanetCuratedMinerDoesntExist(paranetId, minerAddresses[i]);
            }

            pr.removeKnowledgeMiner(paranetId, minerAddresses[i]);

            emit ParanetCuratedMinerRemoved(paranetKAStorageContract, paranetKATokenId, minerAddresses[i]);

            unchecked {
                i++;
            }
        }
    }

    function requestParanetCuratedMinerAccess(address paranetKAStorageContract, uint256 paranetKATokenId) external {
        ParanetsRegistry pr = paranetsRegistry;

        bytes32 paranetId = keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId));

        if (!pr.paranetExists(paranetId)) {
            revert ParanetErrors.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        if (pr.getMinersAccessPolicy(paranetId) != ParanetStructs.MinersAccessPolicy.CURATED) {
            ParanetStructs.MinersAccessPolicy[] memory expectedAccessPolicies = new ParanetStructs.MinersAccessPolicy[](
                1
            );
            expectedAccessPolicies[0] = ParanetStructs.MinersAccessPolicy.CURATED;

            revert ParanetErrors.InvalidParanetMinersAccessPolicy(
                expectedAccessPolicies,
                pr.getMinersAccessPolicy(paranetId)
            );
        }

        ParanetStructs.ParanetKnowledgeMinerAccessRequest[] memory paranetKnowledgeMinersAccessRequests = pr
            .getKnowledgeMinerAccessRequests(paranetId, msg.sender);

        if (
            paranetKnowledgeMinersAccessRequests.length > 0 &&
            paranetKnowledgeMinersAccessRequests[paranetKnowledgeMinersAccessRequests.length - 1].status ==
            ParanetStructs.RequestStatus.PENDING
        ) {
            revert ParanetErrors.ParanetCuratedMinerAccessRequestInvalidStatus(
                paranetId,
                msg.sender,
                paranetKnowledgeMinersAccessRequests[paranetKnowledgeMinersAccessRequests.length - 1].status
            );
        }

        pr.addKnowledgeMinerAccessRequest(paranetId, msg.sender, ParanetStructs.RequestStatus.PENDING);

        emit ParanetCuratedMinerAccessRequestCreated(paranetKAStorageContract, paranetKATokenId, msg.sender);
    }

    function approveCuratedMiner(
        address paranetKAStorageContract,
        uint256 paranetKATokenId,
        address minerAddress
    ) external onlyKnowledgeAssetOwner(paranetKAStorageContract, paranetKATokenId) {
        ParanetsRegistry pr = paranetsRegistry;

        bytes32 paranetId = keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId));

        if (!pr.paranetExists(paranetId)) {
            revert ParanetErrors.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        if (pr.getMinersAccessPolicy(paranetId) != ParanetStructs.MinersAccessPolicy.CURATED) {
            ParanetStructs.MinersAccessPolicy[] memory expectedAccessPolicies = new ParanetStructs.MinersAccessPolicy[](
                1
            );
            expectedAccessPolicies[0] = ParanetStructs.MinersAccessPolicy.CURATED;

            revert ParanetErrors.InvalidParanetMinersAccessPolicy(
                expectedAccessPolicies,
                pr.getMinersAccessPolicy(paranetId)
            );
        }

        ParanetStructs.ParanetKnowledgeMinerAccessRequest[] memory paranetKnowledgeMinersAccessRequests = pr
            .getKnowledgeMinerAccessRequests(paranetId, minerAddress);

        if (paranetKnowledgeMinersAccessRequests.length == 0) {
            revert ParanetErrors.ParanetCuratedMinerAccessRequestDoesntExist(paranetId, minerAddress);
        } else if (
            paranetKnowledgeMinersAccessRequests[paranetKnowledgeMinersAccessRequests.length - 1].status !=
            ParanetStructs.RequestStatus.PENDING
        ) {
            revert ParanetErrors.ParanetCuratedMinerAccessRequestInvalidStatus(
                paranetId,
                minerAddress,
                paranetKnowledgeMinersAccessRequests[paranetKnowledgeMinersAccessRequests.length - 1].status
            );
        }

        pr.updateKnowledgeMinerAccessRequestStatus(
            paranetId,
            minerAddress,
            paranetKnowledgeMinersAccessRequests.length - 1,
            ParanetStructs.RequestStatus.APPROVED
        );
        pr.addKnowledgeMiner(paranetId, minerAddress);

        emit ParanetCuratedMinerAccessRequestAccepted(paranetKAStorageContract, paranetKATokenId, minerAddress);
        emit ParanetCuratedMinerAdded(paranetKAStorageContract, paranetKATokenId, minerAddress);
    }

    function rejectCuratedMiner(
        address paranetKAStorageContract,
        uint256 paranetKATokenId,
        address minerAddress
    ) external onlyKnowledgeAssetOwner(paranetKAStorageContract, paranetKATokenId) {
        ParanetsRegistry pr = paranetsRegistry;

        bytes32 paranetId = keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId));

        if (!pr.paranetExists(paranetId)) {
            revert ParanetErrors.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        if (pr.getMinersAccessPolicy(paranetId) != ParanetStructs.MinersAccessPolicy.CURATED) {
            ParanetStructs.MinersAccessPolicy[] memory expectedAccessPolicies = new ParanetStructs.MinersAccessPolicy[](
                1
            );
            expectedAccessPolicies[0] = ParanetStructs.MinersAccessPolicy.CURATED;

            revert ParanetErrors.InvalidParanetMinersAccessPolicy(
                expectedAccessPolicies,
                pr.getMinersAccessPolicy(paranetId)
            );
        }

        ParanetStructs.ParanetKnowledgeMinerAccessRequest[] memory paranetKnowledgeMinerAccessRequests = pr
            .getKnowledgeMinerAccessRequests(paranetId, minerAddress);

        if (paranetKnowledgeMinerAccessRequests.length == 0) {
            revert ParanetErrors.ParanetCuratedMinerAccessRequestDoesntExist(paranetId, minerAddress);
        } else if (
            paranetKnowledgeMinerAccessRequests[paranetKnowledgeMinerAccessRequests.length - 1].status !=
            ParanetStructs.RequestStatus.PENDING
        ) {
            revert ParanetErrors.ParanetCuratedMinerAccessRequestInvalidStatus(
                paranetId,
                minerAddress,
                paranetKnowledgeMinerAccessRequests[paranetKnowledgeMinerAccessRequests.length - 1].status
            );
        }

        pr.updateKnowledgeMinerAccessRequestStatus(
            paranetId,
            minerAddress,
            paranetKnowledgeMinerAccessRequests.length - 1,
            ParanetStructs.RequestStatus.REJECTED
        );

        emit ParanetCuratedMinerAccessRequestRejected(paranetKAStorageContract, paranetKATokenId, minerAddress);
    }

    function mintKnowledgeAsset(
        address paranetKAStorageContract,
        uint256 paranetKATokenId,
        ContentAssetStructsV2.AssetInputArgs calldata knowledgeAssetArgs
    ) external returns (uint256) {
        ParanetsRegistry pr = paranetsRegistry;
        bytes32 paranetId = keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId));

        // Check if Paranet exists
        // If not: Throw an error
        if (!pr.paranetExists(paranetId)) {
            revert ParanetErrors.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        ParanetStructs.MinersAccessPolicy minersAccessPolicy = pr.getMinersAccessPolicy(paranetId);

        // Check if paranet is curated and if knowledge miner is whitelisted
        if (
            minersAccessPolicy == ParanetStructs.MinersAccessPolicy.CURATED &&
            !pr.isKnowledgeMinerRegistered(paranetId, msg.sender)
        ) {
            revert ParanetErrors.ParanetCuratedMinerDoesntExist(paranetId, msg.sender);
        } else if (minersAccessPolicy == ParanetStructs.MinersAccessPolicy.OPEN) {
            // Check if Knowledge Miner has profile
            // If not: Create a profile
            if (!paranetKnowledgeMinersRegistry.knowledgeMinerExists(msg.sender)) {
                paranetKnowledgeMinersRegistry.registerKnowledgeMiner(msg.sender);
            }

            // Check if Knowledge Miner is registered on paranet
            if (!pr.isKnowledgeMinerRegistered(paranetId, msg.sender)) {
                pr.addKnowledgeMiner(paranetId, msg.sender);
            }
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

        ParanetStructs.MinersAccessPolicy minersAccessPolicy = pr.getMinersAccessPolicy(paranetId);

        // Check if paranet is curated and if knowledge miner is whitelisted
        if (
            minersAccessPolicy == ParanetStructs.MinersAccessPolicy.CURATED &&
            !pr.isKnowledgeMinerRegistered(paranetId, msg.sender)
        ) {
            revert ParanetErrors.ParanetCuratedMinerDoesntExist(paranetId, msg.sender);
        } else if (minersAccessPolicy == ParanetStructs.MinersAccessPolicy.OPEN) {
            // Check if Knowledge Miner has profile
            // If not: Create a profile
            if (!paranetKnowledgeMinersRegistry.knowledgeMinerExists(msg.sender)) {
                paranetKnowledgeMinersRegistry.registerKnowledgeMiner(msg.sender);
            }

            // Check if Knowledge Miner is registered on paranet
            if (!pr.isKnowledgeMinerRegistered(paranetId, msg.sender)) {
                pr.addKnowledgeMiner(paranetId, msg.sender);
            }
        }

        if (
            paranetKnowledgeAssetsRegistry.isParanetKnowledgeAsset(
                keccak256(abi.encodePacked(knowledgeAssetStorageContract, knowledgeAssetTokenId))
            )
        ) {
            revert ParanetErrors.KnowledgeAssetIsAPartOfOtherParanet(
                knowledgeAssetStorageContract,
                knowledgeAssetTokenId,
                paranetKnowledgeAssetsRegistry.getParanetId(
                    keccak256(abi.encodePacked(knowledgeAssetStorageContract, knowledgeAssetTokenId))
                )
            );
        }
        // This needs to have separet logiic for new and old assets
        uint96 remainingTokenAmount = 0;
        try ERC1155Delta(knowledgeAssetStorageContract).isOwnerOf(msg.sender, knowledgeAssetTokenId) returns (
            bool isOwner
        ) {
            KnowledgeCollectionStorage kcs = KnowledgeCollectionStorage(knowledgeAssetStorageContract);
            remainingTokenAmount = kcs.getTokenAmount(knowledgeAssetTokenId);
        } catch {
            remainingTokenAmount = serviceAgreementStorageProxy.getAgreementTokenAmount(
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
        bytes32 paranetId = keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId));

        _processUpdatedKnowledgeAssetStatesMetadata(
            paranetId,
            paranetKnowledgeMinersRegistry.getUpdatingKnowledgeAssetStates(msg.sender, paranetId, start, end)
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

        bytes32 paranetId = keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId));
        bytes32 knowledgeAssetId = keccak256(abi.encodePacked(knowledgeAssetStorageContract, knowledgeAssetTokenId));

        // Add Knowledge Asset to the KnowledgeAssetsRegistry
        paranetKnowledgeAssetsRegistry.addKnowledgeAsset(
            paranetId,
            knowledgeAssetStorageContract,
            knowledgeAssetTokenId,
            msg.sender
        );

        // Add Knowledge Asset Metadata to the ParanetsRegistry
        pr.addKnowledgeAsset(paranetId, knowledgeAssetId);
        pr.addCumulativeKnowledgeValue(paranetId, tokenAmount);

        // Add Knowledge Asset Metadata to the KnowledgeMinersRegistry
        pkmr.addSubmittedKnowledgeAsset(msg.sender, paranetId, knowledgeAssetId);
        pkmr.addCumulativeTracSpent(msg.sender, paranetId, tokenAmount);
        pkmr.addUnrewardedTracSpent(msg.sender, paranetId, tokenAmount);
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
