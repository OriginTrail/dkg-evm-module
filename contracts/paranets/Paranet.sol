// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {ParanetKnowledgeAssetsRegistry} from "../storage/paranets/ParanetKnowledgeAssetsRegistry.sol";
import {ParanetKnowledgeMinersRegistry} from "../storage/paranets/ParanetKnowledgeMinersRegistry.sol";
import {ParanetsRegistry} from "../storage/paranets/ParanetsRegistry.sol";
import {ParanetServicesRegistry} from "../storage/paranets/ParanetServicesRegistry.sol";
import {ProfileStorage} from "../storage/ProfileStorage.sol";
import {IdentityStorage} from "../storage/IdentityStorage.sol";
import {ContractStatus} from "../abstract/ContractStatus.sol";
import {IInitializable} from "../interfaces/IInitializable.sol";
import {INamed} from "../interfaces/INamed.sol";
import {IVersioned} from "../interfaces/IVersioned.sol";
import {ParanetLib} from "../libraries/ParanetLib.sol";
import {ProfileLib} from "../libraries/ProfileLib.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ERC1155Delta} from "../tokens/ERC1155Delta.sol";

contract Paranet is INamed, IVersioned, ContractStatus, IInitializable {
    event ParanetRegistered(
        address indexed paranetKAStorageContract,
        uint256 indexed paranetKATokenId,
        string paranetName,
        string paranetDescription,
        ParanetLib.NodesAccessPolicy nodesAccessPolicy,
        ParanetLib.MinersAccessPolicy minersAccessPolicy,
        ParanetLib.KnowledgeAssetsAccessPolicy knowledgeAssetsAccessPolicy
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
        ParanetLib.IncentivesPool incentivesPool
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
    string private constant _VERSION = "1.0.0";

    ParanetsRegistry public paranetsRegistry;
    ParanetServicesRegistry public paranetServicesRegistry;
    ParanetKnowledgeMinersRegistry public paranetKnowledgeMinersRegistry;
    ParanetKnowledgeAssetsRegistry public paranetKnowledgeAssetsRegistry;
    ProfileStorage public profileStorage;
    IdentityStorage public identityStorage;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) ContractStatus(hubAddress) {}

    modifier onlyKnowledgeAssetOwner(address knowledgeAssetStorageContract, uint256 knowledgeAssetTokenId) {
        _checkKnowledgeAssetOwner(knowledgeAssetStorageContract, knowledgeAssetTokenId);
        _;
    }

    function initialize() public onlyHub {
        profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        identityStorage = IdentityStorage(hub.getContractAddress("IdentityStorage"));
        paranetsRegistry = ParanetsRegistry(hub.getContractAddress("ParanetsRegistry"));
        paranetServicesRegistry = ParanetServicesRegistry(hub.getContractAddress("ParanetServicesRegistry"));
        paranetKnowledgeMinersRegistry = ParanetKnowledgeMinersRegistry(
            hub.getContractAddress("ParanetKnowledgeMinersRegistry")
        );
        paranetKnowledgeAssetsRegistry = ParanetKnowledgeAssetsRegistry(
            hub.getContractAddress("ParanetKnowledgeAssetsRegistry")
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
        ParanetLib.NodesAccessPolicy nodesAccessPolicy,
        ParanetLib.MinersAccessPolicy minersAccessPolicy
    ) external onlyKnowledgeAssetOwner(paranetKAStorageContract, paranetKATokenId) returns (bytes32) {
        ParanetsRegistry pr = paranetsRegistry;

        bytes32 paranetId = keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId));

        if (pr.paranetExists(paranetId)) {
            revert ParanetLib.ParanetHasAlreadyBeenRegistered(paranetKAStorageContract, paranetKATokenId);
        }

        emit ParanetRegistered(
            paranetKAStorageContract,
            paranetKATokenId,
            paranetName,
            paranetDescription,
            nodesAccessPolicy,
            minersAccessPolicy,
            ParanetLib.KnowledgeAssetsAccessPolicy.OPEN
        );

        return
            pr.registerParanet(
                paranetKAStorageContract,
                paranetKATokenId,
                paranetName,
                paranetDescription,
                nodesAccessPolicy,
                minersAccessPolicy,
                ParanetLib.KnowledgeAssetsAccessPolicy.OPEN
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
            revert ParanetLib.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
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
            revert ParanetLib.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        if (pr.getNodesAccessPolicy(paranetId) != ParanetLib.NodesAccessPolicy.CURATED) {
            ParanetLib.NodesAccessPolicy[] memory expectedAccessPolicies = new ParanetLib.NodesAccessPolicy[](1);
            expectedAccessPolicies[0] = ParanetLib.NodesAccessPolicy.CURATED;

            revert ParanetLib.InvalidParanetNodesAccessPolicy(
                expectedAccessPolicies,
                pr.getNodesAccessPolicy(paranetId)
            );
        }

        for (uint256 i; i < identityIds.length; ) {
            if (!ps.profileExists(identityIds[i])) {
                revert ProfileLib.ProfileDoesntExist(identityIds[i]);
            }

            if (pr.isCuratedNode(paranetId, identityIds[i])) {
                revert ParanetLib.ParanetCuratedNodeHasAlreadyBeenAdded(paranetId, identityIds[i]);
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
            revert ParanetLib.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        if (pr.getNodesAccessPolicy(paranetId) != ParanetLib.NodesAccessPolicy.CURATED) {
            ParanetLib.NodesAccessPolicy[] memory expectedAccessPolicies = new ParanetLib.NodesAccessPolicy[](1);
            expectedAccessPolicies[0] = ParanetLib.NodesAccessPolicy.CURATED;

            revert ParanetLib.InvalidParanetNodesAccessPolicy(
                expectedAccessPolicies,
                pr.getNodesAccessPolicy(paranetId)
            );
        }

        for (uint256 i; i < identityIds.length; ) {
            if (!pr.isCuratedNode(paranetId, identityIds[i])) {
                revert ParanetLib.ParanetCuratedNodeDoesntExist(paranetId, identityIds[i]);
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
            revert ParanetLib.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        if (pr.getNodesAccessPolicy(paranetId) != ParanetLib.NodesAccessPolicy.CURATED) {
            ParanetLib.NodesAccessPolicy[] memory expectedAccessPolicies = new ParanetLib.NodesAccessPolicy[](1);
            expectedAccessPolicies[0] = ParanetLib.NodesAccessPolicy.CURATED;

            revert ParanetLib.InvalidParanetNodesAccessPolicy(
                expectedAccessPolicies,
                pr.getNodesAccessPolicy(paranetId)
            );
        }

        uint72 identityId = identityStorage.getIdentityId(msg.sender);

        if (!profileStorage.profileExists(identityId)) {
            revert ProfileLib.ProfileDoesntExist(identityId);
        }

        ParanetLib.ParanetNodeJoinRequest[] memory paranetNodeJoinRequests = pr.getNodeJoinRequests(
            paranetId,
            identityId
        );

        if (
            paranetNodeJoinRequests.length > 0 &&
            paranetNodeJoinRequests[paranetNodeJoinRequests.length - 1].status == ParanetLib.RequestStatus.PENDING
        ) {
            revert ParanetLib.ParanetCuratedNodeJoinRequestInvalidStatus(
                paranetId,
                identityId,
                paranetNodeJoinRequests[paranetNodeJoinRequests.length - 1].status
            );
        }

        pr.addNodeJoinRequest(paranetId, identityId, ParanetLib.RequestStatus.PENDING);

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
            revert ParanetLib.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        if (pr.getNodesAccessPolicy(paranetId) != ParanetLib.NodesAccessPolicy.CURATED) {
            ParanetLib.NodesAccessPolicy[] memory expectedAccessPolicies = new ParanetLib.NodesAccessPolicy[](1);
            expectedAccessPolicies[0] = ParanetLib.NodesAccessPolicy.CURATED;

            revert ParanetLib.InvalidParanetNodesAccessPolicy(
                expectedAccessPolicies,
                pr.getNodesAccessPolicy(paranetId)
            );
        }

        ParanetLib.ParanetNodeJoinRequest[] memory paranetNodeJoinRequests = pr.getNodeJoinRequests(
            paranetId,
            identityId
        );

        if (paranetNodeJoinRequests.length == 0) {
            revert ParanetLib.ParanetCuratedNodeJoinRequestDoesntExist(paranetId, identityId);
        } else if (
            paranetNodeJoinRequests[paranetNodeJoinRequests.length - 1].status != ParanetLib.RequestStatus.PENDING
        ) {
            revert ParanetLib.ParanetCuratedNodeJoinRequestInvalidStatus(
                paranetId,
                identityId,
                paranetNodeJoinRequests[paranetNodeJoinRequests.length - 1].status
            );
        }

        pr.updateNodeJoinRequestStatus(
            paranetId,
            identityId,
            paranetNodeJoinRequests.length - 1,
            ParanetLib.RequestStatus.APPROVED
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
            revert ParanetLib.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        if (pr.getNodesAccessPolicy(paranetId) != ParanetLib.NodesAccessPolicy.CURATED) {
            ParanetLib.NodesAccessPolicy[] memory expectedAccessPolicies = new ParanetLib.NodesAccessPolicy[](1);
            expectedAccessPolicies[0] = ParanetLib.NodesAccessPolicy.CURATED;

            revert ParanetLib.InvalidParanetNodesAccessPolicy(
                expectedAccessPolicies,
                pr.getNodesAccessPolicy(paranetId)
            );
        }

        ParanetLib.ParanetNodeJoinRequest[] memory paranetNodeJoinRequests = pr.getNodeJoinRequests(
            paranetId,
            identityId
        );

        if (paranetNodeJoinRequests.length == 0) {
            revert ParanetLib.ParanetCuratedNodeJoinRequestDoesntExist(paranetId, identityId);
        } else if (
            paranetNodeJoinRequests[paranetNodeJoinRequests.length - 1].status != ParanetLib.RequestStatus.PENDING
        ) {
            revert ParanetLib.ParanetCuratedNodeJoinRequestInvalidStatus(
                paranetId,
                identityId,
                paranetNodeJoinRequests[paranetNodeJoinRequests.length - 1].status
            );
        }

        pr.updateNodeJoinRequestStatus(
            paranetId,
            identityId,
            paranetNodeJoinRequests.length - 1,
            ParanetLib.RequestStatus.REJECTED
        );

        emit ParanetCuratedNodeJoinRequestRejected(paranetKAStorageContract, paranetKATokenId, identityId);
    }

    function addParanetServices(
        address paranetKAStorageContract,
        uint256 paranetKATokenId,
        ParanetLib.UniversalAssetLocator[] calldata services
    ) external onlyKnowledgeAssetOwner(paranetKAStorageContract, paranetKATokenId) {
        ParanetsRegistry pr = paranetsRegistry;
        ParanetServicesRegistry psr = paranetServicesRegistry;

        bytes32 paranetId = keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId));

        if (!pr.paranetExists(paranetId)) {
            revert ParanetLib.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        for (uint256 i; i < services.length; ) {
            if (
                !psr.paranetServiceExists(
                    keccak256(abi.encodePacked(services[i].knowledgeAssetStorageContract, services[i].tokenId))
                )
            ) {
                revert ParanetLib.ParanetServiceDoesntExist(
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
                revert ParanetLib.ParanetServiceHasAlreadyBeenAdded(
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
            revert ParanetLib.ParanetServiceHasAlreadyBeenRegistered(
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
            revert ParanetLib.ParanetServiceDoesntExist(paranetServiceKAStorageContract, paranetServiceKATokenId);
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
            revert ParanetLib.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        if (pr.getMinersAccessPolicy(paranetId) != ParanetLib.MinersAccessPolicy.CURATED) {
            ParanetLib.MinersAccessPolicy[] memory expectedAccessPolicies = new ParanetLib.MinersAccessPolicy[](1);
            expectedAccessPolicies[0] = ParanetLib.MinersAccessPolicy.CURATED;

            revert ParanetLib.InvalidParanetMinersAccessPolicy(
                expectedAccessPolicies,
                pr.getMinersAccessPolicy(paranetId)
            );
        }

        for (uint256 i; i < minerAddresses.length; ) {
            if (!pkmr.knowledgeMinerExists(minerAddresses[i])) {
                pkmr.registerKnowledgeMiner(minerAddresses[i]);
            }

            if (pr.isKnowledgeMinerRegistered(paranetId, minerAddresses[i])) {
                revert ParanetLib.ParanetCuratedMinerHasAlreadyBeenAdded(paranetId, minerAddresses[i]);
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
            revert ParanetLib.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        if (pr.getMinersAccessPolicy(paranetId) != ParanetLib.MinersAccessPolicy.CURATED) {
            ParanetLib.MinersAccessPolicy[] memory expectedAccessPolicies = new ParanetLib.MinersAccessPolicy[](1);
            expectedAccessPolicies[0] = ParanetLib.MinersAccessPolicy.CURATED;

            revert ParanetLib.InvalidParanetMinersAccessPolicy(
                expectedAccessPolicies,
                pr.getMinersAccessPolicy(paranetId)
            );
        }

        for (uint256 i; i < minerAddresses.length; ) {
            if (!pr.isKnowledgeMinerRegistered(paranetId, minerAddresses[i])) {
                revert ParanetLib.ParanetCuratedMinerDoesntExist(paranetId, minerAddresses[i]);
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
            revert ParanetLib.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        if (pr.getMinersAccessPolicy(paranetId) != ParanetLib.MinersAccessPolicy.CURATED) {
            ParanetLib.MinersAccessPolicy[] memory expectedAccessPolicies = new ParanetLib.MinersAccessPolicy[](1);
            expectedAccessPolicies[0] = ParanetLib.MinersAccessPolicy.CURATED;

            revert ParanetLib.InvalidParanetMinersAccessPolicy(
                expectedAccessPolicies,
                pr.getMinersAccessPolicy(paranetId)
            );
        }

        ParanetLib.ParanetKnowledgeMinerAccessRequest[] memory paranetKnowledgeMinersAccessRequests = pr
            .getKnowledgeMinerAccessRequests(paranetId, msg.sender);

        if (
            paranetKnowledgeMinersAccessRequests.length > 0 &&
            paranetKnowledgeMinersAccessRequests[paranetKnowledgeMinersAccessRequests.length - 1].status ==
            ParanetLib.RequestStatus.PENDING
        ) {
            revert ParanetLib.ParanetCuratedMinerAccessRequestInvalidStatus(
                paranetId,
                msg.sender,
                paranetKnowledgeMinersAccessRequests[paranetKnowledgeMinersAccessRequests.length - 1].status
            );
        }

        pr.addKnowledgeMinerAccessRequest(paranetId, msg.sender, ParanetLib.RequestStatus.PENDING);

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
            revert ParanetLib.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        if (pr.getMinersAccessPolicy(paranetId) != ParanetLib.MinersAccessPolicy.CURATED) {
            ParanetLib.MinersAccessPolicy[] memory expectedAccessPolicies = new ParanetLib.MinersAccessPolicy[](1);
            expectedAccessPolicies[0] = ParanetLib.MinersAccessPolicy.CURATED;

            revert ParanetLib.InvalidParanetMinersAccessPolicy(
                expectedAccessPolicies,
                pr.getMinersAccessPolicy(paranetId)
            );
        }

        ParanetLib.ParanetKnowledgeMinerAccessRequest[] memory paranetKnowledgeMinersAccessRequests = pr
            .getKnowledgeMinerAccessRequests(paranetId, minerAddress);

        if (paranetKnowledgeMinersAccessRequests.length == 0) {
            revert ParanetLib.ParanetCuratedMinerAccessRequestDoesntExist(paranetId, minerAddress);
        } else if (
            paranetKnowledgeMinersAccessRequests[paranetKnowledgeMinersAccessRequests.length - 1].status !=
            ParanetLib.RequestStatus.PENDING
        ) {
            revert ParanetLib.ParanetCuratedMinerAccessRequestInvalidStatus(
                paranetId,
                minerAddress,
                paranetKnowledgeMinersAccessRequests[paranetKnowledgeMinersAccessRequests.length - 1].status
            );
        }

        pr.updateKnowledgeMinerAccessRequestStatus(
            paranetId,
            minerAddress,
            paranetKnowledgeMinersAccessRequests.length - 1,
            ParanetLib.RequestStatus.APPROVED
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
            revert ParanetLib.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        if (pr.getMinersAccessPolicy(paranetId) != ParanetLib.MinersAccessPolicy.CURATED) {
            ParanetLib.MinersAccessPolicy[] memory expectedAccessPolicies = new ParanetLib.MinersAccessPolicy[](1);
            expectedAccessPolicies[0] = ParanetLib.MinersAccessPolicy.CURATED;

            revert ParanetLib.InvalidParanetMinersAccessPolicy(
                expectedAccessPolicies,
                pr.getMinersAccessPolicy(paranetId)
            );
        }

        ParanetLib.ParanetKnowledgeMinerAccessRequest[] memory paranetKnowledgeMinerAccessRequests = pr
            .getKnowledgeMinerAccessRequests(paranetId, minerAddress);

        if (paranetKnowledgeMinerAccessRequests.length == 0) {
            revert ParanetLib.ParanetCuratedMinerAccessRequestDoesntExist(paranetId, minerAddress);
        } else if (
            paranetKnowledgeMinerAccessRequests[paranetKnowledgeMinerAccessRequests.length - 1].status !=
            ParanetLib.RequestStatus.PENDING
        ) {
            revert ParanetLib.ParanetCuratedMinerAccessRequestInvalidStatus(
                paranetId,
                minerAddress,
                paranetKnowledgeMinerAccessRequests[paranetKnowledgeMinerAccessRequests.length - 1].status
            );
        }

        pr.updateKnowledgeMinerAccessRequestStatus(
            paranetId,
            minerAddress,
            paranetKnowledgeMinerAccessRequests.length - 1,
            ParanetLib.RequestStatus.REJECTED
        );

        emit ParanetCuratedMinerAccessRequestRejected(paranetKAStorageContract, paranetKATokenId, minerAddress);
    }

    // function mintKnowledgeAsset(
    //     address paranetKAStorageContract,
    //     uint256 paranetKATokenId,
    //     ContentAssetStructs.AssetInputArgs calldata knowledgeAssetArgs
    // ) external returns (uint256) {
    //     ParanetsRegistry pr = paranetsRegistry;
    //     bytes32 paranetId = keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId));

    //     // Check if Paranet exists
    //     // If not: Throw an error
    //     if (!pr.paranetExists(paranetId)) {
    //         revert ParanetLib.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
    //     }

    //     ParanetLib.MinersAccessPolicy minersAccessPolicy = pr.getMinersAccessPolicy(paranetId);

    //     // Check if paranet is curated and if knowledge miner is whitelisted
    //     if (
    //         minersAccessPolicy == ParanetLib.MinersAccessPolicy.CURATED &&
    //         !pr.isKnowledgeMinerRegistered(paranetId, msg.sender)
    //     ) {
    //         revert ParanetLib.ParanetCuratedMinerDoesntExist(paranetId, msg.sender);
    //     } else if (minersAccessPolicy == ParanetLib.MinersAccessPolicy.OPEN) {
    //         // Check if Knowledge Miner has profile
    //         // If not: Create a profile
    //         if (!paranetKnowledgeMinersRegistry.knowledgeMinerExists(msg.sender)) {
    //             paranetKnowledgeMinersRegistry.registerKnowledgeMiner(msg.sender);
    //         }

    //         // Check if Knowledge Miner is registered on paranet
    //         if (!pr.isKnowledgeMinerRegistered(paranetId, msg.sender)) {
    //             pr.addKnowledgeMiner(paranetId, msg.sender);
    //         }
    //     }

    //     // Mint Knowledge Asset
    //     uint256 knowledgeAssetTokenId = contentAsset.createAssetFromContract(msg.sender, knowledgeAssetArgs);

    //     _updateSubmittedKnowledgeAssetMetadata(
    //         paranetKAStorageContract,
    //         paranetKATokenId,
    //         address(contentAssetStorage),
    //         knowledgeAssetTokenId,
    //         knowledgeAssetArgs.tokenAmount
    //     );

    //     emit KnowledgeAssetSubmittedToParanet(
    //         paranetKAStorageContract,
    //         paranetKATokenId,
    //         address(contentAssetStorage),
    //         knowledgeAssetTokenId
    //     );

    //     return knowledgeAssetTokenId;
    // }

    function submitKnowledgeAsset(
        address paranetKAStorageContract,
        uint256 paranetKATokenId,
        address knowledgeAssetStorageContract,
        uint256 knowledgeAssetTokenId
    ) external onlyKnowledgeAssetOwner(knowledgeAssetStorageContract, knowledgeAssetTokenId) {
        ParanetsRegistry pr = paranetsRegistry;
        bytes32 paranetId = keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId));

        if (!pr.paranetExists(paranetId)) {
            revert ParanetLib.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        ParanetLib.MinersAccessPolicy minersAccessPolicy = pr.getMinersAccessPolicy(paranetId);

        // Check if paranet is curated and if knowledge miner is whitelisted
        if (
            minersAccessPolicy == ParanetLib.MinersAccessPolicy.CURATED &&
            !pr.isKnowledgeMinerRegistered(paranetId, msg.sender)
        ) {
            revert ParanetLib.ParanetCuratedMinerDoesntExist(paranetId, msg.sender);
        } else if (minersAccessPolicy == ParanetLib.MinersAccessPolicy.OPEN) {
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
            revert ParanetLib.KnowledgeAssetIsAPartOfOtherParanet(
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

    // function processUpdatedKnowledgeAssetStatesMetadata(
    //     address paranetKAStorageContract,
    //     uint256 paranetKATokenId,
    //     uint256 start,
    //     uint256 end
    // ) external {
    //     bytes32 paranetId = keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId));

    //     _processUpdatedKnowledgeAssetStatesMetadata(
    //         paranetId,
    //         paranetKnowledgeMinersRegistry.getUpdatingKnowledgeAssetStates(msg.sender, paranetId, start, end)
    //     );
    // }

    // function _updateSubmittedKnowledgeAssetMetadata(
    //     address paranetKAStorageContract,
    //     uint256 paranetKATokenId,
    //     address knowledgeAssetStorageContract,
    //     uint256 knowledgeAssetTokenId,
    //     uint96 tokenAmount
    // ) internal {
    //     ParanetsRegistry pr = paranetsRegistry;
    //     ParanetKnowledgeMinersRegistry pkmr = paranetKnowledgeMinersRegistry;

    //     bytes32 paranetId = keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId));
    //     bytes32 knowledgeAssetId = keccak256(abi.encodePacked(knowledgeAssetStorageContract, knowledgeAssetTokenId));

    //     // Add Knowledge Asset to the KnowledgeAssetsRegistry
    //     paranetKnowledgeAssetsRegistry.addKnowledgeAsset(
    //         paranetId,
    //         knowledgeAssetStorageContract,
    //         knowledgeAssetTokenId,
    //         msg.sender
    //     );

    //     // Add Knowledge Asset Metadata to the ParanetsRegistry
    //     pr.addKnowledgeAsset(paranetId, knowledgeAssetId);
    //     pr.addCumulativeKnowledgeValue(paranetId, tokenAmount);

    //     // Add Knowledge Asset Metadata to the KnowledgeMinersRegistry
    //     pkmr.addSubmittedKnowledgeAsset(msg.sender, paranetId, knowledgeAssetId);
    //     pkmr.addCumulativeTracSpent(msg.sender, paranetId, tokenAmount);
    //     pkmr.addUnrewardedTracSpent(msg.sender, paranetId, tokenAmount);
    //     pkmr.incrementTotalSubmittedKnowledgeAssetsCount(msg.sender);
    //     pkmr.addTotalTracSpent(msg.sender, tokenAmount);
    // }

    // function _processUpdatedKnowledgeAssetStatesMetadata(
    //     bytes32 paranetId,
    //     ParanetLib.UpdatingKnowledgeAssetState[] memory updatingKnowledgeAssetStates
    // ) internal {
    //     ParanetKnowledgeMinersRegistry pkmr = paranetKnowledgeMinersRegistry;
    //     ParanetsRegistry pr = paranetsRegistry;
    //     ContentAsset ca = contentAsset;

    //     for (uint i; i < updatingKnowledgeAssetStates.length; ) {
    //         _checkKnowledgeAssetOwner(
    //             updatingKnowledgeAssetStates[i].knowledgeAssetStorageContract,
    //             updatingKnowledgeAssetStates[i].tokenId
    //         );

    //         bool continueOuterLoop = false;

    //         bytes32[] memory assertionIds = ContentAssetStorage(
    //             updatingKnowledgeAssetStates[i].knowledgeAssetStorageContract
    //         ).getAssertionIds(updatingKnowledgeAssetStates[i].tokenId);

    //         for (uint j = assertionIds.length; j > 0; ) {
    //             if (assertionIds[j - 1] == updatingKnowledgeAssetStates[i].assertionId) {
    //                 // Add Knowledge Asset Token Amount Metadata to the ParanetsRegistry
    //                 pr.addCumulativeKnowledgeValue(paranetId, updatingKnowledgeAssetStates[i].updateTokenAmount);

    //                 // Add Knowledge Asset Token Amount Metadata to the KnowledgeMinersRegistry
    //                 pkmr.addCumulativeTracSpent(
    //                     msg.sender,
    //                     paranetId,
    //                     updatingKnowledgeAssetStates[i].updateTokenAmount
    //                 );
    //                 pkmr.addUnrewardedTracSpent(
    //                     msg.sender,
    //                     paranetId,
    //                     updatingKnowledgeAssetStates[i].updateTokenAmount
    //                 );
    //                 pkmr.addTotalTracSpent(msg.sender, updatingKnowledgeAssetStates[i].updateTokenAmount);

    //                 pkmr.removeUpdatingKnowledgeAssetState(
    //                     msg.sender,
    //                     paranetId,
    //                     keccak256(
    //                         abi.encodePacked(
    //                             updatingKnowledgeAssetStates[i].knowledgeAssetStorageContract,
    //                             updatingKnowledgeAssetStates[i].tokenId,
    //                             updatingKnowledgeAssetStates[i].assertionId
    //                         )
    //                     )
    //                 );

    //                 continueOuterLoop = true;
    //                 break;
    //             }

    //             unchecked {
    //                 j--;
    //             }
    //         }

    //         unchecked {
    //             i++;
    //         }

    //         if (continueOuterLoop) {
    //             continue;
    //         }

    //         try ca.cancelAssetStateUpdateFromContract(updatingKnowledgeAssetStates[i].tokenId) {
    //             pkmr.removeUpdatingKnowledgeAssetState(
    //                 msg.sender,
    //                 paranetId,
    //                 keccak256(
    //                     abi.encodePacked(
    //                         updatingKnowledgeAssetStates[i].knowledgeAssetStorageContract,
    //                         updatingKnowledgeAssetStates[i].tokenId,
    //                         updatingKnowledgeAssetStates[i].assertionId
    //                     )
    //                 )
    //             );
    //             // solhint-disable-next-line no-empty-blocks
    //         } catch {}
    //     }
    // }

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
        try ERC1155Delta(knowledgeAssetStorageContract).isOwnerOf(msg.sender, knowledgeAssetTokenId) returns (
            bool isOwner
        ) {
            require(isOwner, "Caller isn't the owner of the KA");
            // TODO: Check for each KA in KC
        } catch {
            try IERC721(knowledgeAssetStorageContract).ownerOf(knowledgeAssetTokenId) returns (address owner) {
                require(owner == msg.sender, "Caller isn't the owner of the KA");
            } catch {
                revert("Caller isn't the owner of the KA");
            }
        }
    }
}
