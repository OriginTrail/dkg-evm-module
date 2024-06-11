// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {ContentAssetStorageV2} from "../storage/assets/ContentAssetStorage.sol";
import {ContentAssetV2} from "../assets/ContentAsset.sol";
import {HubV2} from "../Hub.sol";
import {ParanetKnowledgeAssetsRegistry} from "../storage/paranets/ParanetKnowledgeAssetsRegistry.sol";
import {ParanetKnowledgeMinersRegistry} from "../storage/paranets/ParanetKnowledgeMinersRegistry.sol";
import {ParanetsRegistry} from "../storage/paranets/ParanetsRegistry.sol";
import {ParanetServicesRegistry} from "../storage/paranets/ParanetServicesRegistry.sol";
import {ParanetNeuroIncentivesPool} from "./ParanetNeuroIncentivesPool.sol";
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
    event ParanetRegistered(
        address indexed paranetKAStorageContract,
        uint256 indexed paranetKATokenId,
        string paranetName,
        string paranetDescription,
        uint256 paranetTracToNeuroEmissionMultiplier,
        uint16 paranetOperatorRewardPercentage,
        uint16 paranetIncentivizationProposalVotersRewardPercentage,
        ParanetStructs.IncentivesPool[] incentivesPools
    );
    event ParanetNameUpdated(
        address indexed paranetKAStorageContract,
        uint256 indexed paranetKATokenId,
        string newParanetName
    );
    event ParanetDescriptionUpdated(
        address indexed paranetKAStorageContract,
        uint256 indexed paranetKATokenId,
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
    event ParanetServiceNameUpdated(
        address indexed paranetServiceKAStorageContract,
        uint256 indexed paranetServiceKATokenId,
        string newParanetServiceName
    );
    event ParanetServiceDescriptionUpdated(
        address indexed paranetServiceKAStorageContract,
        uint256 indexed paranetServiceKATokenId,
        string newParanetServiceDescription
    );
    event ParanetServiceAddressesUpdated(
        address indexed paranetServiceKAStorageContract,
        uint256 indexed paranetServiceKATokenId,
        address[] newParanetServiceAddresses
    );
    event KnowledgeAssetSubmittedToParanet(
        address indexed paranetKAStorageContract,
        uint256 indexed paranetKATokenId,
        address indexed knowledgeAssetStorageContract,
        uint256 knowledgeAssetTokenId
    );

    event AssetMinted(address indexed assetContract, uint256 indexed tokenId, bytes32 indexed state);

    string private constant _NAME = "Paranet";
    string private constant _VERSION = "2.1.0";

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

    modifier onlyKnowledgeAssetOwner(address knowledgeAssetStorageContract, uint256 knowledgeAssetTokenId) {
        _checkKnowledgeAssetOwner(knowledgeAssetStorageContract, knowledgeAssetTokenId);
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
        uint256 tracToNeuroEmissionMultiplier,
        uint16 paranetOperatorRewardPercentage,
        uint16 paranetIncentivizationProposalVotersRewardPercentage
    ) external onlyKnowledgeAssetOwner(paranetKAStorageContract, paranetKATokenId) returns (bytes32) {
        HubV2 h = hub;
        ParanetsRegistry pr = paranetsRegistry;

        if (pr.paranetExists(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)))) {
            revert ParanetErrors.ParanetHasAlreadyBeenRegistered(paranetKAStorageContract, paranetKATokenId);
        }

        ParanetNeuroIncentivesPool incentivesPool = new ParanetNeuroIncentivesPool(
            address(h),
            h.getContractAddress("ParanetsRegistry"),
            h.getContractAddress("ParanetKnowledgeMinersRegistry"),
            keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
            tracToNeuroEmissionMultiplier,
            paranetOperatorRewardPercentage,
            paranetIncentivizationProposalVotersRewardPercentage
        );

        ParanetStructs.IncentivesPool[] memory incentivesPools = new ParanetStructs.IncentivesPool[](1);
        incentivesPools[0] = ParanetStructs.IncentivesPool({poolType: "Neuroweb", addr: address(incentivesPool)});

        emit ParanetRegistered(
            paranetKAStorageContract,
            paranetKATokenId,
            paranetName,
            paranetDescription,
            tracToNeuroEmissionMultiplier,
            paranetOperatorRewardPercentage,
            paranetIncentivizationProposalVotersRewardPercentage,
            incentivesPools
        );

        return
            pr.registerParanet(
                paranetKAStorageContract,
                paranetKATokenId,
                paranetName,
                paranetDescription,
                incentivesPools
            );
    }

    function updateParanetName(
        address paranetKAStorageContract,
        uint256 paranetKATokenId,
        string calldata paranetName
    ) external onlyKnowledgeAssetOwner(paranetKAStorageContract, paranetKATokenId) {
        paranetsRegistry.setName(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)), paranetName);

        emit ParanetNameUpdated(paranetKAStorageContract, paranetKATokenId, paranetName);
    }

    function updateParanetDescription(
        address paranetKAStorageContract,
        uint256 paranetKATokenId,
        string calldata paranetDescription
    ) external onlyKnowledgeAssetOwner(paranetKAStorageContract, paranetKATokenId) {
        ParanetsRegistry pr = paranetsRegistry;

        if (!pr.paranetExists(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)))) {
            revert ParanetErrors.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        pr.setDescription(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)), paranetDescription);

        emit ParanetDescriptionUpdated(paranetKAStorageContract, paranetKATokenId, paranetDescription);
    }

    function addParanetService(
        address paranetKAStorageContract,
        uint256 paranetKATokenId,
        address paranetServiceKAStorageContract,
        uint256 paranetServiceKATokenId
    )
        external
        onlyKnowledgeAssetOwner(paranetKAStorageContract, paranetKATokenId)
        onlyKnowledgeAssetOwner(paranetServiceKAStorageContract, paranetServiceKATokenId)
    {
        ParanetServicesRegistry psr = paranetServicesRegistry;
        ParanetsRegistry pr = paranetsRegistry;

        if (
            !psr.paranetServiceExists(
                keccak256(abi.encodePacked(paranetServiceKAStorageContract, paranetServiceKATokenId))
            )
        ) {
            revert ParanetErrors.ParanetServiceDoesntExist(paranetServiceKAStorageContract, paranetServiceKATokenId);
        }

        if (
            pr.isServiceImplemented(
                keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
                keccak256(abi.encodePacked(paranetServiceKAStorageContract, paranetServiceKATokenId))
            )
        ) {
            revert ParanetErrors.ParanetServiceHasAlreadyBeenAdded(
                keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
                keccak256(abi.encodePacked(paranetServiceKAStorageContract, paranetServiceKATokenId))
            );
        }

        pr.addService(
            keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
            keccak256(abi.encodePacked(paranetServiceKAStorageContract, paranetServiceKATokenId))
        );

        emit ParanetServiceAdded(
            paranetKAStorageContract,
            paranetKATokenId,
            paranetServiceKAStorageContract,
            paranetServiceKATokenId
        );
    }

    function addParanetServices(
        address paranetKAStorageContract,
        uint256 paranetKATokenId,
        ParanetStructs.UniversalAssetLocator[] calldata services
    ) external onlyKnowledgeAssetOwner(paranetKAStorageContract, paranetKATokenId) {
        ParanetsRegistry pr = paranetsRegistry;
        ParanetServicesRegistry psr = paranetServicesRegistry;

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

    function updateParanetServiceAddresses(
        address paranetServiceKAStorageContract,
        uint256 paranetServiceKATokenId,
        address[] calldata paranetServiceAddresses
    ) external onlyKnowledgeAssetOwner(paranetServiceKAStorageContract, paranetServiceKATokenId) {
        paranetServicesRegistry.setParanetServiceAddresses(
            keccak256(abi.encodePacked(paranetServiceKAStorageContract, paranetServiceKATokenId)),
            paranetServiceAddresses
        );

        emit ParanetServiceAddressesUpdated(
            paranetServiceKAStorageContract,
            paranetServiceKATokenId,
            paranetServiceAddresses
        );
    }

    function updateParanetServiceName(
        address paranetServiceKAStorageContract,
        uint256 paranetServiceKATokenId,
        string calldata paranetServiceName
    ) external onlyKnowledgeAssetOwner(paranetServiceKAStorageContract, paranetServiceKATokenId) {
        paranetServicesRegistry.setName(
            keccak256(abi.encodePacked(paranetServiceKAStorageContract, paranetServiceKATokenId)),
            paranetServiceName
        );

        emit ParanetServiceNameUpdated(paranetServiceKAStorageContract, paranetServiceKATokenId, paranetServiceName);
    }

    function updateParanetServiceDescription(
        address paranetServiceKAStorageContract,
        uint256 paranetServiceKATokenId,
        string calldata paranetServiceDescription
    ) external onlyKnowledgeAssetOwner(paranetServiceKAStorageContract, paranetServiceKATokenId) {
        paranetServicesRegistry.setDescription(
            keccak256(abi.encodePacked(paranetServiceKAStorageContract, paranetServiceKATokenId)),
            paranetServiceDescription
        );

        emit ParanetServiceDescriptionUpdated(
            paranetServiceKAStorageContract,
            paranetServiceKATokenId,
            paranetServiceDescription
        );
    }

    function mintKnowledgeAsset(
        address paranetKAStorageContract,
        uint256 paranetKATokenId,
        ContentAssetStructs.AssetInputArgs calldata knowledgeAssetArgs
    ) external returns (uint256) {
        ParanetsRegistry pr = paranetsRegistry;
        ParanetKnowledgeMinersRegistry pkmr = paranetKnowledgeMinersRegistry;
        ParanetKnowledgeAssetsRegistry pkar = paranetKnowledgeAssetsRegistry;
        ContentAssetV2 ca = contentAsset;

        // Check if Paranet exists
        // If not: Throw an error
        if (!pr.paranetExists(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)))) {
            revert ParanetErrors.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        // Check if Knowledge Miner has profile
        // If not: Create a profile
        if (!pkmr.knowledgeMinerExists(msg.sender)) {
            pkmr.registerKnowledgeMiner(msg.sender);
        }

        // Check if Knowledge Miner is registert to paranet
        // If not: Register it
        if (
            !pr.isKnowledgeMinerRegistered(
                keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
                msg.sender
            )
        ) {
            pr.addKnowledgeMiner(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)), msg.sender);
        }

        // Mint Knowledge Asset
        uint256 knowledgeAssetTokenId = ca.createAssetFromContract(msg.sender, knowledgeAssetArgs);

        // Add Knowledge Asset to the KnowledgeAssetsRegistry
        pkar.addKnowledgeAsset(
            keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
            address(contentAssetStorage),
            knowledgeAssetTokenId,
            msg.sender
        );

        // Add Knowledge Asset Metadata to the ParanetsRegistry
        pr.addKnowledgeAsset(
            keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
            keccak256(abi.encodePacked(address(contentAssetStorage), knowledgeAssetTokenId))
        );
        pr.addCumulativeKnowledgeValue(
            keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
            knowledgeAssetArgs.tokenAmount
        );

        // Add Knowledge Asset Metadata to the KnowledgeMinersRegistry
        pkmr.addSubmittedKnowledgeAsset(
            msg.sender,
            keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
            keccak256(abi.encodePacked(address(contentAssetStorage), knowledgeAssetTokenId))
        );
        pkmr.addCumulativeTracSpent(
            msg.sender,
            keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
            knowledgeAssetArgs.tokenAmount
        );
        pkmr.addUnrewardedTracSpent(
            msg.sender,
            keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
            knowledgeAssetArgs.tokenAmount
        );
        pkmr.incrementTotalSubmittedKnowledgeAssetsCount(msg.sender);
        pkmr.addTotalTracSpent(msg.sender, knowledgeAssetArgs.tokenAmount);

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
        ParanetKnowledgeMinersRegistry pkmr = paranetKnowledgeMinersRegistry;
        ParanetKnowledgeAssetsRegistry pkar = paranetKnowledgeAssetsRegistry;

        if (!pr.paranetExists(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)))) {
            revert ParanetErrors.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        if (
            pkar.isParanetKnowledgeAsset(
                keccak256(abi.encodePacked(knowledgeAssetStorageContract, knowledgeAssetTokenId))
            )
        ) {
            revert ParanetErrors.KnowledgeAssetIsAPartOfOtherParanet(
                knowledgeAssetStorageContract,
                knowledgeAssetTokenId,
                pkar.getParanetId(keccak256(abi.encodePacked(knowledgeAssetStorageContract, knowledgeAssetTokenId)))
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
        if (!pkmr.knowledgeMinerExists(msg.sender)) {
            pkmr.registerKnowledgeMiner(msg.sender);
        }

        // Check if Knowledge Miner is registert to paranet
        // If not: Register it
        if (
            !pr.isKnowledgeMinerRegistered(
                keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
                msg.sender
            )
        ) {
            pr.addKnowledgeMiner(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)), msg.sender);
        }

        // Add Knowledge Asset to the KnowledgeAssetsRegistry
        pkar.addKnowledgeAsset(
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
            remainingTokenAmount
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
            remainingTokenAmount
        );
        pkmr.incrementTotalSubmittedKnowledgeAssetsCount(msg.sender);
        pkmr.addTotalTracSpent(msg.sender, remainingTokenAmount);

        emit KnowledgeAssetSubmittedToParanet(
            paranetKAStorageContract,
            paranetKATokenId,
            knowledgeAssetStorageContract,
            knowledgeAssetTokenId
        );
    }

    function processUpdatedKnowledgeAssetStatesMetadata(
        address paranetKAStorageContract,
        uint256 paranetKATokenId
    ) external {
        _processUpdatedKnowledgeAssetStatesMetadata(
            keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
            paranetKnowledgeMinersRegistry.getUpdatingKnowledgeAssetStates(
                msg.sender,
                keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId))
            )
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
