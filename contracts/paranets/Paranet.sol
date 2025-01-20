// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {ParanetKnowledgeCollectionsRegistry} from "../storage/paranets/ParanetKnowledgeCollectionsRegistry.sol";
import {ParanetKnowledgeMinersRegistry} from "../storage/paranets/ParanetKnowledgeMinersRegistry.sol";
import {ParanetsRegistry} from "../storage/paranets/ParanetsRegistry.sol";
import {ParanetServicesRegistry} from "../storage/paranets/ParanetServicesRegistry.sol";
import {ProfileStorage} from "../storage/ProfileStorage.sol";
import {IdentityStorage} from "../storage/IdentityStorage.sol";
import {KnowledgeCollectionStorage} from "../storage/KnowledgeCollectionStorage.sol";
import {ContractStatus} from "../abstract/ContractStatus.sol";
import {IInitializable} from "../interfaces/IInitializable.sol";
import {INamed} from "../interfaces/INamed.sol";
import {IVersioned} from "../interfaces/IVersioned.sol";
import {ParanetLib} from "../libraries/ParanetLib.sol";
import {ProfileLib} from "../libraries/ProfileLib.sol";
import {KnowledgeCollectionLib} from "../libraries/KnowledgeCollectionLib.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract Paranet is INamed, IVersioned, ContractStatus, IInitializable {
    event ParanetRegistered(
        address indexed paranetKCStorageContract,
        uint256 indexed paranetKCTokenId,
        string paranetName,
        string paranetDescription,
        ParanetLib.NodesAccessPolicy nodesAccessPolicy,
        ParanetLib.MinersAccessPolicy minersAccessPolicy,
        ParanetLib.KnowledgeCollectionsAccessPolicy knowledgeCollectionsAccessPolicy
    );
    event ParanetCuratedNodeAdded(
        address indexed paranetKCStorageContract,
        uint256 indexed paranetKCTokenId,
        uint72 identityId
    );
    event ParanetCuratedNodeRemoved(
        address indexed paranetKCStorageContract,
        uint256 indexed paranetKCTokenId,
        uint72 identityId
    );
    event ParanetCuratedNodeJoinRequestCreated(
        address indexed paranetKCStorageContract,
        uint256 indexed paranetKCTokenId,
        uint72 identityId
    );
    event ParanetCuratedNodeJoinRequestAccepted(
        address indexed paranetKCStorageContract,
        uint256 indexed paranetKCTokenId,
        uint72 identityId
    );
    event ParanetCuratedNodeJoinRequestRejected(
        address indexed paranetKCStorageContract,
        uint256 indexed paranetKCTokenId,
        uint72 identityId
    );
    event ParanetIncetivesPoolDeployed(
        address indexed paranetKCStorageContract,
        uint256 indexed paranetKCTokenId,
        ParanetLib.IncentivesPool incentivesPool
    );
    event ParanetMetadataUpdated(
        address indexed paranetKCStorageContract,
        uint256 indexed paranetKCTokenId,
        string newParanetName,
        string newParanetDescription
    );
    event ParanetServiceAdded(
        address indexed paranetKCStorageContract,
        uint256 indexed paranetKCTokenId,
        address indexed paranetServiceKCStorageContract,
        uint256 paranetServiceKCTokenId
    );
    event ParanetServiceRegistered(
        address indexed paranetServiceKCStorageContract,
        uint256 indexed paranetServiceKCTokenId,
        string paranetServiceName,
        string paranetServiceDescription,
        address[] paranetServiceAddresses
    );
    event ParanetServiceMetadataUpdated(
        address indexed paranetServiceKCStorageContract,
        uint256 indexed paranetServiceKCTokenId,
        string newParanetServiceName,
        string newParanetServiceDescription,
        address[] newParanetServiceAddresses
    );
    event KnowledgeCollectionSubmittedToParanet(
        address indexed paranetKCStorageContract,
        uint256 indexed paranetKCTokenId,
        address indexed knowledgeCollectionStorageContract,
        uint256 knowledgeCollectionId
    );
    event ParanetCuratedMinerAdded(
        address indexed paranetKCStorageContract,
        uint256 indexed paranetKCTokenId,
        address minerAddress
    );
    event ParanetCuratedMinerRemoved(
        address indexed paranetKCStorageContract,
        uint256 indexed paranetKCTokenId,
        address minerAddress
    );
    event ParanetCuratedMinerAccessRequestCreated(
        address indexed paranetKCStorageContract,
        uint256 indexed paranetKCTokenId,
        address minerAddress
    );
    event ParanetCuratedMinerAccessRequestAccepted(
        address indexed paranetKCStorageContract,
        uint256 indexed paranetKCTokenId,
        address minerAddress
    );
    event ParanetCuratedMinerAccessRequestRejected(
        address indexed paranetKCStorageContract,
        uint256 indexed paranetKCTokenId,
        address minerAddress
    );

    string private constant _NAME = "Paranet";
    string private constant _VERSION = "1.0.0";

    ParanetsRegistry public paranetsRegistry;
    ParanetServicesRegistry public paranetServicesRegistry;
    ParanetKnowledgeMinersRegistry public paranetKnowledgeMinersRegistry;
    ParanetKnowledgeCollectionsRegistry public paranetKnowledgeCollectionsRegistry;
    ProfileStorage public profileStorage;
    IdentityStorage public identityStorage;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) ContractStatus(hubAddress) {}

    modifier onlyKnowledgeCollectionOwner(
        address knowledgeCollectionStorageContract,
        uint256 knowledgeCollectionTokenId
    ) {
        _checkKnowledgeCollectionOwner(knowledgeCollectionStorageContract, knowledgeCollectionTokenId);
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
        paranetKnowledgeCollectionsRegistry = ParanetKnowledgeCollectionsRegistry(
            hub.getContractAddress("ParanetKnowledgeCollectionsRegistry")
        );
    }

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function registerParanet(
        address paranetKCStorageContract,
        uint256 paranetKCTokenId,
        string calldata paranetName,
        string calldata paranetDescription,
        ParanetLib.NodesAccessPolicy nodesAccessPolicy,
        ParanetLib.MinersAccessPolicy minersAccessPolicy
    ) external onlyKnowledgeCollectionOwner(paranetKCStorageContract, paranetKCTokenId) returns (bytes32) {
        ParanetsRegistry pr = paranetsRegistry;

        bytes32 paranetId = keccak256(abi.encodePacked(paranetKCStorageContract, paranetKCTokenId));

        if (pr.paranetExists(paranetId)) {
            revert ParanetLib.ParanetHasAlreadyBeenRegistered(paranetKCStorageContract, paranetKCTokenId);
        }

        emit ParanetRegistered(
            paranetKCStorageContract,
            paranetKCTokenId,
            paranetName,
            paranetDescription,
            nodesAccessPolicy,
            minersAccessPolicy,
            ParanetLib.KnowledgeCollectionsAccessPolicy.OPEN
        );

        return
            pr.registerParanet(
                paranetKCStorageContract,
                paranetKCTokenId,
                paranetName,
                paranetDescription,
                nodesAccessPolicy,
                minersAccessPolicy,
                ParanetLib.KnowledgeCollectionsAccessPolicy.OPEN
            );
    }

    function updateParanetMetadata(
        address paranetKCStorageContract,
        uint256 paranetKCTokenId,
        string calldata paranetName,
        string calldata paranetDescription
    ) external onlyKnowledgeCollectionOwner(paranetKCStorageContract, paranetKCTokenId) {
        ParanetsRegistry pr = paranetsRegistry;

        bytes32 paranetId = keccak256(abi.encodePacked(paranetKCStorageContract, paranetKCTokenId));

        if (!pr.paranetExists(paranetId)) {
            revert ParanetLib.ParanetDoesntExist(paranetKCStorageContract, paranetKCTokenId);
        }

        pr.setName(paranetId, paranetName);
        pr.setDescription(paranetId, paranetDescription);

        emit ParanetMetadataUpdated(paranetKCStorageContract, paranetKCTokenId, paranetName, paranetDescription);
    }

    function addParanetCuratedNodes(
        address paranetKCStorageContract,
        uint256 paranetKCTokenId,
        uint72[] calldata identityIds
    ) external onlyKnowledgeCollectionOwner(paranetKCStorageContract, paranetKCTokenId) {
        ParanetsRegistry pr = paranetsRegistry;
        ProfileStorage ps = profileStorage;

        bytes32 paranetId = keccak256(abi.encodePacked(paranetKCStorageContract, paranetKCTokenId));

        if (!pr.paranetExists(paranetId)) {
            revert ParanetLib.ParanetDoesntExist(paranetKCStorageContract, paranetKCTokenId);
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

            emit ParanetCuratedNodeAdded(paranetKCStorageContract, paranetKCTokenId, identityIds[i]);

            unchecked {
                i++;
            }
        }
    }

    function removeParanetCuratedNodes(
        address paranetKCStorageContract,
        uint256 paranetKCTokenId,
        uint72[] calldata identityIds
    ) external onlyKnowledgeCollectionOwner(paranetKCStorageContract, paranetKCTokenId) {
        ParanetsRegistry pr = paranetsRegistry;

        bytes32 paranetId = keccak256(abi.encodePacked(paranetKCStorageContract, paranetKCTokenId));

        if (!pr.paranetExists(paranetId)) {
            revert ParanetLib.ParanetDoesntExist(paranetKCStorageContract, paranetKCTokenId);
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

            emit ParanetCuratedNodeRemoved(paranetKCStorageContract, paranetKCTokenId, identityIds[i]);

            unchecked {
                i++;
            }
        }
    }

    function requestParanetCuratedNodeAccess(address paranetKCStorageContract, uint256 paranetKCTokenId) external {
        ParanetsRegistry pr = paranetsRegistry;

        bytes32 paranetId = keccak256(abi.encodePacked(paranetKCStorageContract, paranetKCTokenId));

        if (!pr.paranetExists(paranetId)) {
            revert ParanetLib.ParanetDoesntExist(paranetKCStorageContract, paranetKCTokenId);
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

        emit ParanetCuratedNodeJoinRequestCreated(paranetKCStorageContract, paranetKCTokenId, identityId);
    }

    function approveCuratedNode(
        address paranetKCStorageContract,
        uint256 paranetKCTokenId,
        uint72 identityId
    ) external onlyKnowledgeCollectionOwner(paranetKCStorageContract, paranetKCTokenId) {
        ParanetsRegistry pr = paranetsRegistry;

        bytes32 paranetId = keccak256(abi.encodePacked(paranetKCStorageContract, paranetKCTokenId));

        if (!pr.paranetExists(paranetId)) {
            revert ParanetLib.ParanetDoesntExist(paranetKCStorageContract, paranetKCTokenId);
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

        emit ParanetCuratedNodeJoinRequestAccepted(paranetKCStorageContract, paranetKCTokenId, identityId);
        emit ParanetCuratedNodeAdded(paranetKCStorageContract, paranetKCTokenId, identityId);
    }

    function rejectCuratedNode(
        address paranetKCStorageContract,
        uint256 paranetKCTokenId,
        uint72 identityId
    ) external onlyKnowledgeCollectionOwner(paranetKCStorageContract, paranetKCTokenId) {
        ParanetsRegistry pr = paranetsRegistry;

        bytes32 paranetId = keccak256(abi.encodePacked(paranetKCStorageContract, paranetKCTokenId));

        if (!pr.paranetExists(paranetId)) {
            revert ParanetLib.ParanetDoesntExist(paranetKCStorageContract, paranetKCTokenId);
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

        emit ParanetCuratedNodeJoinRequestRejected(paranetKCStorageContract, paranetKCTokenId, identityId);
    }

    function addParanetServices(
        address paranetKCStorageContract,
        uint256 paranetKCTokenId,
        ParanetLib.UniversalCollectionLocator[] calldata services
    ) external onlyKnowledgeCollectionOwner(paranetKCStorageContract, paranetKCTokenId) {
        ParanetsRegistry pr = paranetsRegistry;
        ParanetServicesRegistry psr = paranetServicesRegistry;

        bytes32 paranetId = keccak256(abi.encodePacked(paranetKCStorageContract, paranetKCTokenId));

        if (!pr.paranetExists(paranetId)) {
            revert ParanetLib.ParanetDoesntExist(paranetKCStorageContract, paranetKCTokenId);
        }

        for (uint256 i; i < services.length; ) {
            if (
                !psr.paranetServiceExists(
                    keccak256(
                        abi.encodePacked(
                            services[i].knowledgeCollectionStorageContract,
                            services[i].knowledgeCollectionTokenId
                        )
                    )
                )
            ) {
                revert ParanetLib.ParanetServiceDoesntExist(
                    services[i].knowledgeCollectionStorageContract,
                    services[i].knowledgeCollectionTokenId
                );
            }

            _checkKnowledgeCollectionOwner(
                services[i].knowledgeCollectionStorageContract,
                services[i].knowledgeCollectionTokenId
            );

            if (
                pr.isServiceImplemented(
                    paranetId,
                    keccak256(
                        abi.encodePacked(
                            services[i].knowledgeCollectionStorageContract,
                            services[i].knowledgeCollectionTokenId
                        )
                    )
                )
            ) {
                revert ParanetLib.ParanetServiceHasAlreadyBeenAdded(
                    paranetId,
                    keccak256(
                        abi.encodePacked(
                            services[i].knowledgeCollectionStorageContract,
                            services[i].knowledgeCollectionTokenId
                        )
                    )
                );
            }

            pr.addService(
                paranetId,
                keccak256(
                    abi.encodePacked(
                        services[i].knowledgeCollectionStorageContract,
                        services[i].knowledgeCollectionTokenId
                    )
                )
            );

            emit ParanetServiceAdded(
                paranetKCStorageContract,
                paranetKCTokenId,
                services[i].knowledgeCollectionStorageContract,
                services[i].knowledgeCollectionTokenId
            );

            unchecked {
                i++;
            }
        }
    }

    function registerParanetService(
        address paranetServiceKCStorageContract,
        uint256 paranetServiceKCTokenId,
        string calldata paranetServiceName,
        string calldata paranetServiceDescription,
        address[] calldata paranetServiceAddresses
    )
        external
        onlyKnowledgeCollectionOwner(paranetServiceKCStorageContract, paranetServiceKCTokenId)
        returns (bytes32)
    {
        ParanetServicesRegistry psr = paranetServicesRegistry;

        bytes32 paranetServiceId = keccak256(
            abi.encodePacked(paranetServiceKCStorageContract, paranetServiceKCTokenId)
        );

        if (psr.paranetServiceExists(paranetServiceId)) {
            revert ParanetLib.ParanetServiceHasAlreadyBeenRegistered(
                paranetServiceKCStorageContract,
                paranetServiceKCTokenId
            );
        }

        emit ParanetServiceRegistered(
            paranetServiceKCStorageContract,
            paranetServiceKCTokenId,
            paranetServiceName,
            paranetServiceDescription,
            paranetServiceAddresses
        );

        return
            psr.registerParanetService(
                paranetServiceKCStorageContract,
                paranetServiceKCTokenId,
                paranetServiceName,
                paranetServiceDescription,
                paranetServiceAddresses
            );
    }

    function updateParanetServiceMetadata(
        address paranetServiceKCStorageContract,
        uint256 paranetServiceKCTokenId,
        string calldata paranetServiceName,
        string calldata paranetServiceDescription,
        address[] calldata paranetServiceAddresses
    ) external onlyKnowledgeCollectionOwner(paranetServiceKCStorageContract, paranetServiceKCTokenId) {
        ParanetServicesRegistry psr = paranetServicesRegistry;

        bytes32 paranetServiceId = keccak256(
            abi.encodePacked(paranetServiceKCStorageContract, paranetServiceKCTokenId)
        );

        if (!psr.paranetServiceExists(paranetServiceId)) {
            revert ParanetLib.ParanetServiceDoesntExist(paranetServiceKCStorageContract, paranetServiceKCTokenId);
        }

        psr.setName(paranetServiceId, paranetServiceName);
        psr.setDescription(paranetServiceId, paranetServiceDescription);
        psr.setParanetServiceAddresses(paranetServiceId, paranetServiceAddresses);

        emit ParanetServiceMetadataUpdated(
            paranetServiceKCStorageContract,
            paranetServiceKCTokenId,
            paranetServiceName,
            paranetServiceDescription,
            paranetServiceAddresses
        );
    }

    function addParanetCuratedMiners(
        address paranetKCStorageContract,
        uint256 paranetKCTokenId,
        address[] calldata minerAddresses
    ) external onlyKnowledgeCollectionOwner(paranetKCStorageContract, paranetKCTokenId) {
        ParanetsRegistry pr = paranetsRegistry;
        ParanetKnowledgeMinersRegistry pkmr = paranetKnowledgeMinersRegistry;

        bytes32 paranetId = keccak256(abi.encodePacked(paranetKCStorageContract, paranetKCTokenId));

        if (!pr.paranetExists(paranetId)) {
            revert ParanetLib.ParanetDoesntExist(paranetKCStorageContract, paranetKCTokenId);
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

            emit ParanetCuratedMinerAdded(paranetKCStorageContract, paranetKCTokenId, minerAddresses[i]);

            unchecked {
                i++;
            }
        }
    }

    function removeParanetCuratedMiners(
        address paranetKCStorageContract,
        uint256 paranetKCTokenId,
        address[] calldata minerAddresses
    ) external onlyKnowledgeCollectionOwner(paranetKCStorageContract, paranetKCTokenId) {
        ParanetsRegistry pr = paranetsRegistry;

        bytes32 paranetId = keccak256(abi.encodePacked(paranetKCStorageContract, paranetKCTokenId));

        if (!pr.paranetExists(paranetId)) {
            revert ParanetLib.ParanetDoesntExist(paranetKCStorageContract, paranetKCTokenId);
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

            emit ParanetCuratedMinerRemoved(paranetKCStorageContract, paranetKCTokenId, minerAddresses[i]);

            unchecked {
                i++;
            }
        }
    }

    function requestParanetCuratedMinerAccess(address paranetKCStorageContract, uint256 paranetKCTokenId) external {
        ParanetsRegistry pr = paranetsRegistry;

        bytes32 paranetId = keccak256(abi.encodePacked(paranetKCStorageContract, paranetKCTokenId));

        if (!pr.paranetExists(paranetId)) {
            revert ParanetLib.ParanetDoesntExist(paranetKCStorageContract, paranetKCTokenId);
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

        emit ParanetCuratedMinerAccessRequestCreated(paranetKCStorageContract, paranetKCTokenId, msg.sender);
    }

    function approveCuratedMiner(
        address paranetKCStorageContract,
        uint256 paranetKCTokenId,
        address minerAddress
    ) external onlyKnowledgeCollectionOwner(paranetKCStorageContract, paranetKCTokenId) {
        ParanetsRegistry pr = paranetsRegistry;

        bytes32 paranetId = keccak256(abi.encodePacked(paranetKCStorageContract, paranetKCTokenId));

        if (!pr.paranetExists(paranetId)) {
            revert ParanetLib.ParanetDoesntExist(paranetKCStorageContract, paranetKCTokenId);
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

        emit ParanetCuratedMinerAccessRequestAccepted(paranetKCStorageContract, paranetKCTokenId, minerAddress);
        emit ParanetCuratedMinerAdded(paranetKCStorageContract, paranetKCTokenId, minerAddress);
    }

    function rejectCuratedMiner(
        address paranetKCStorageContract,
        uint256 paranetKCTokenId,
        address minerAddress
    ) external onlyKnowledgeCollectionOwner(paranetKCStorageContract, paranetKCTokenId) {
        ParanetsRegistry pr = paranetsRegistry;

        bytes32 paranetId = keccak256(abi.encodePacked(paranetKCStorageContract, paranetKCTokenId));

        if (!pr.paranetExists(paranetId)) {
            revert ParanetLib.ParanetDoesntExist(paranetKCStorageContract, paranetKCTokenId);
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

        emit ParanetCuratedMinerAccessRequestRejected(paranetKCStorageContract, paranetKCTokenId, minerAddress);
    }

    function getKnowledgeCollectionLocatorsWithPagination(
        bytes32 paranetId,
        uint256 offset,
        uint256 limit
    ) external view returns (ParanetLib.UniversalCollectionLocator[] memory) {
        ParanetsRegistry pr = paranetsRegistry;

        bytes32[] memory knowledgeCollections = pr.getKnowledgeCollectionsWithPagination(paranetId, offset, limit);

        ParanetKnowledgeCollectionsRegistry pkcr = paranetKnowledgeCollectionsRegistry;

        return pkcr.getKnowledgeCollectionLocators(knowledgeCollections);
    }

    // function mintKnowledgeCollection(
    //     address paranetKCStorageContract,
    //     uint256 paranetKCTokenId,
    //     ContentCollectionStructs.CollectionInputArgs calldata knowledgeCollectionArgs
    // ) external returns (uint256) {
    //     ParanetsRegistry pr = paranetsRegistry;
    //     bytes32 paranetId = keccak256(abi.encodePacked(paranetKCStorageContract, paranetKCTokenId));

    //     // Check if Paranet exists
    //     // If not: Throw an error
    //     if (!pr.paranetExists(paranetId)) {
    //         revert ParanetLib.ParanetDoesntExist(paranetKCStorageContract, paranetKCTokenId);
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

    //     // Mint Knowledge Collection
    //     uint256 knowledgeCollectionTokenId = contentCollection.createCollectionFromContract(msg.sender, knowledgeCollectionArgs);

    //     _updateSubmittedKnowledgeCollectionMetadata(
    //         paranetKCStorageContract,
    //         paranetKCTokenId,
    //         address(contentCollectionStorage),
    //         knowledgeCollectionTokenId,
    //         knowledgeCollectionArgs.tokenAmount
    //     );

    //     emit KnowledgeCollectionSubmittedToParanet(
    //         paranetKCStorageContract,
    //         paranetKCTokenId,
    //         address(contentCollectionStorage),
    //         knowledgeCollectionTokenId
    //     );

    //     return knowledgeCollectionTokenId;
    // }

    // If asset has been updated there should be logic to update paranet kc states metadata with info about previouse state if posible

    function submitKnowledgeCollection(
        address paranetKCStorageContract,
        uint256 paranetKnowledgeCollectionId,
        address knowledgeCollectionStorageContract,
        uint256 knowledgeCollectionTokenId
    ) external onlyKnowledgeCollectionOwner(knowledgeCollectionStorageContract, knowledgeCollectionTokenId) {
        ParanetsRegistry pr = paranetsRegistry;
        bytes32 paranetId = keccak256(abi.encodePacked(paranetKCStorageContract, paranetKnowledgeCollectionId));

        if (!pr.paranetExists(paranetId)) {
            revert ParanetLib.ParanetDoesntExist(paranetKCStorageContract, paranetKnowledgeCollectionId);
        }

        ParanetLib.MinersAccessPolicy minersAccessPolicy = pr.getMinersAccessPolicy(paranetId);

        // Check if paranet is curated and if knowledge miner is whitelisted
        if (
            minersAccessPolicy == ParanetLib.MinersAccessPolicy.CURATED &&
            !pr.isKnowledgeMinerRegistered(paranetId, msg.sender)
        ) {
            revert ParanetLib.ParanetCuratedMinerDoesntExist(paranetId, msg.sender);
            // Should this be done in both cases why would OPEN have separeted logic ???
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
            paranetKnowledgeCollectionsRegistry.isParanetKnowledgeCollection(
                keccak256(abi.encodePacked(knowledgeCollectionStorageContract, knowledgeCollectionTokenId))
            )
        ) {
            revert ParanetLib.KnowledgeCollectionIsAPartOfOtherParanet(
                knowledgeCollectionStorageContract,
                knowledgeCollectionTokenId,
                paranetKnowledgeCollectionsRegistry.getParanetId(
                    keccak256(abi.encodePacked(knowledgeCollectionStorageContract, knowledgeCollectionTokenId))
                )
            );
        }
        // Is this correct way to do this ???
        KnowledgeCollectionStorage kcs = KnowledgeCollectionStorage(knowledgeCollectionStorageContract);
        uint96 remainingTokenAmount = kcs.getTokenAmount(knowledgeCollectionTokenId);
        KnowledgeCollectionLib.MerkleRoot[] memory merkleRoots = kcs.getMerkleRoots(knowledgeCollectionTokenId);

        // Update KnowledgeMiner metadata
        _updateSubmittedKnowledgeCollectionMetadata(
            paranetKCStorageContract,
            paranetKnowledgeCollectionId,
            knowledgeCollectionStorageContract,
            knowledgeCollectionTokenId,
            remainingTokenAmount,
            merkleRoots
        );

        emit KnowledgeCollectionSubmittedToParanet(
            paranetKCStorageContract,
            paranetKnowledgeCollectionId,
            knowledgeCollectionStorageContract,
            knowledgeCollectionTokenId
        );
    }

    // function processUpdatedKnowledgeCollectionStatesMetadata(
    //     address paranetKCStorageContract,
    //     uint256 paranetKCTokenId,
    //     uint256 start,
    //     uint256 end
    // ) external {
    //     bytes32 paranetId = keccak256(abi.encodePacked(paranetKCStorageContract, paranetKCTokenId));

    //     _processUpdatedKnowledgeCollectionStatesMetadata(
    //         paranetId,
    //         paranetKnowledgeMinersRegistry.getUpdatingKnowledgeCollectionStates(msg.sender, paranetId, start, end)
    //     );
    // }

    function _updateSubmittedKnowledgeCollectionMetadata(
        address paranetKCStorageContract,
        uint256 paranetKCTokenId,
        address knowledgeCollectionStorageContract,
        uint256 knowledgeCollectionTokenId,
        uint96 tokenAmount,
        KnowledgeCollectionLib.MerkleRoot[] memory merkleRoots
    ) internal {
        ParanetsRegistry pr = paranetsRegistry;
        ParanetKnowledgeMinersRegistry pkmr = paranetKnowledgeMinersRegistry;

        bytes32 paranetId = keccak256(abi.encodePacked(paranetKCStorageContract, paranetKCTokenId));
        bytes32 knowledgeCollectionId = keccak256(
            abi.encodePacked(knowledgeCollectionStorageContract, knowledgeCollectionTokenId)
        );

        // Add Knowledge Collection to the KnowledgeCollectionsRegistry
        paranetKnowledgeCollectionsRegistry.addKnowledgeCollection(
            paranetId,
            knowledgeCollectionStorageContract,
            knowledgeCollectionTokenId,
            msg.sender
        );

        // Add Knowledge Collection Metadata to the ParanetsRegistry
        pr.addKnowledgeCollecton(paranetId, knowledgeCollectionId);
        pr.addCumulativeKnowledgeValue(paranetId, tokenAmount);

        // Add Knowledge Collection Metadata to the KnowledgeMinersRegistry
        for (uint256 i = 0; i < merkleRoots.length - 1; i++) {
            pkmr.addUpdatingKnowledgeCollectionState(
                msg.sender,
                paranetId,
                knowledgeCollectionStorageContract,
                knowledgeCollectionTokenId,
                merkleRoots[i].merkleRoot,
                0
            );
        }
        pkmr.addUpdatingKnowledgeCollectionState(
            msg.sender,
            paranetId,
            knowledgeCollectionStorageContract,
            knowledgeCollectionTokenId,
            merkleRoots[merkleRoots.length - 1].merkleRoot,
            tokenAmount
        );
        pkmr.addSubmittedKnowledgeCollection(msg.sender, paranetId, knowledgeCollectionId);
        pkmr.addCumulativeTracSpent(msg.sender, paranetId, tokenAmount);
        pkmr.addUnrewardedTracSpent(msg.sender, paranetId, tokenAmount);
        pkmr.incrementTotalSubmittedKnowledgeCollectionsCount(msg.sender);
        pkmr.addTotalTracSpent(msg.sender, tokenAmount);
    }

    // function _processUpdatedKnowledgeCollectionStatesMetadata(
    //     bytes32 paranetId,
    //     ParanetLib.UpdatingKnowledgeCollectionState[] memory updatingKnowledgeCollectionStates
    // ) internal {
    //     ParanetKnowledgeMinersRegistry pkmr = paranetKnowledgeMinersRegistry;
    //     ParanetsRegistry pr = paranetsRegistry;
    //     ContentCollection ca = contentCollection;

    //     for (uint i; i < updatingKnowledgeCollectionStates.length; ) {
    //         _checkKnowledgeCollectionOwner(
    //             updatingKnowledgeCollectionStates[i].knowledgeCollectionStorageContract,
    //             updatingKnowledgeCollectionStates[i].tokenId
    //         );

    //         bool continueOuterLoop = false;

    //         bytes32[] memory assertionIds = ContentCollectionStorage(
    //             updatingKnowledgeCollectionStates[i].knowledgeCollectionStorageContract
    //         ).getAssertionIds(updatingKnowledgeCollectionStates[i].tokenId);

    //         for (uint j = assertionIds.length; j > 0; ) {
    //             if (assertionIds[j - 1] == updatingKnowledgeCollectionStates[i].assertionId) {
    //                 // Add Knowledge Collection Token Amount Metadata to the ParanetsRegistry
    //                 pr.addCumulativeKnowledgeValue(paranetId, updatingKnowledgeCollectionStates[i].updateTokenAmount);

    //                 // Add Knowledge Collection Token Amount Metadata to the KnowledgeMinersRegistry
    //                 pkmr.addCumulativeTracSpent(
    //                     msg.sender,
    //                     paranetId,
    //                     updatingKnowledgeCollectionStates[i].updateTokenAmount
    //                 );
    //                 pkmr.addUnrewardedTracSpent(
    //                     msg.sender,
    //                     paranetId,
    //                     updatingKnowledgeCollectionStates[i].updateTokenAmount
    //                 );
    //                 pkmr.addTotalTracSpent(msg.sender, updatingKnowledgeCollectionStates[i].updateTokenAmount);

    //                 pkmr.removeUpdatingKnowledgeCollectionState(
    //                     msg.sender,
    //                     paranetId,
    //                     keccak256(
    //                         abi.encodePacked(
    //                             updatingKnowledgeCollectionStates[i].knowledgeCollectionStorageContract,
    //                             updatingKnowledgeCollectionStates[i].tokenId,
    //                             updatingKnowledgeCollectionStates[i].assertionId
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

    //         try ca.cancelCollectionStateUpdateFromContract(updatingKnowledgeCollectionStates[i].tokenId) {
    //             pkmr.removeUpdatingKnowledgeCollectionState(
    //                 msg.sender,
    //                 paranetId,
    //                 keccak256(
    //                     abi.encodePacked(
    //                         updatingKnowledgeCollectionStates[i].knowledgeCollectionStorageContract,
    //                         updatingKnowledgeCollectionStates[i].tokenId,
    //                         updatingKnowledgeCollectionStates[i].assertionId
    //                     )
    //                 )
    //             );
    //             // solhint-disable-next-line no-empty-blocks
    //         } catch {}
    //     }
    // }

    function _checkParanetOperator(bytes32 paranetId) internal view virtual {
        (address paranetKCStorageContract, uint256 paranetKCTokenId) = paranetsRegistry
            .getParanetKnowledgeCollectionLocator(paranetId);
        _checkKnowledgeCollectionOwner(paranetKCStorageContract, paranetKCTokenId);
    }

    function _checkParanetServiceOperator(bytes32 paranetServiceId) internal view virtual {
        (address paranetServiceKCStorageContract, uint256 paranetServiceKCTokenId) = paranetServicesRegistry
            .getParanetServiceKnowledgeCollectionLocator(paranetServiceId);
        _checkKnowledgeCollectionOwner(paranetServiceKCStorageContract, paranetServiceKCTokenId);
    }

    function _checkKnowledgeCollectionOwner(
        address knowledgeCollectionStorageContractAddress,
        uint256 knowledgeCollectionId
    ) internal view virtual {
        require(hub.isAssetStorage(knowledgeCollectionStorageContractAddress), "Given address isn't KC Storage");

        KnowledgeCollectionStorage knowledgeCollectionStorage = KnowledgeCollectionStorage(
            knowledgeCollectionStorageContractAddress
        );

        uint256 minted = knowledgeCollectionStorage.getMinted(knowledgeCollectionId);
        uint256 burnedCount = knowledgeCollectionStorage.getBurnedAmount(knowledgeCollectionId);
        uint256 activeCount = minted - burnedCount;
        require(activeCount != 0, "No KCs in Collection");

        uint256 startTokenId = (knowledgeCollectionId - 1) *
            knowledgeCollectionStorage.knowledgeCollectionMaxSize() +
            1; // _startTokenId()

        uint256 ownedCountInRange = knowledgeCollectionStorage.balanceOf(
            msg.sender,
            startTokenId,
            minted + burnedCount
        );

        require(ownedCountInRange == activeCount, "Caller isn't the owner of the KC");
    }
}
