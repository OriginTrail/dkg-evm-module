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
    event ParanetRegistered(
        address indexed paranetKAStorageContract,
        uint256 indexed paranetKATokenId,
        ParanetStructs.AccessPolicy minersAccessPolicy,
        ParanetStructs.AccessPolicy knowledgeAssetsInclusionPolicy,
        string paranetName,
        string paranetDescription,
        address incentivesPoolAddress,
        uint256 paranetTracToNeuroRewardRatio,
        uint96 paranetBootstrapTracTarget,
        uint16 paranetOperatorRewardPercentage
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
    event ParanetOwnershipTransferred(
        address indexed paranetKAStorageContract,
        uint256 indexed paranetKATokenId,
        address newParanetOwner
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
        address worker,
        bytes paranetServiceMetadata
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
    event ParanetServiceWorkerUpdated(
        address indexed paranetServiceKAStorageContract,
        uint256 indexed paranetServiceKATokenId,
        address newParanetServiceWorker
    );
    event ParanetServiceOwnershipTransferred(
        address indexed paranetServiceKAStorageContract,
        uint256 indexed paranetServiceKATokenId,
        address newParanetServiceOwner
    );
    event KnowledgeAssetSubmittedToParanet(
        address indexed paranetKAStorageContract,
        uint256 indexed paranetKATokenId,
        address indexed knowledgeAssetStorageContract,
        uint256 knowledgeAssetTokenId
    );

    event AssetMinted(address indexed assetContract, uint256 indexed tokenId, bytes32 indexed state);

    string private constant _NAME = "Paranet";
    string private constant _VERSION = "2.0.0";

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
            h.getContractAddress("ParanetKnowledgeMinersRegistry"),
            keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
            tracToNeuroRatio,
            tracTarget,
            operatorRewardPercentage
        );

        emit ParanetRegistered(
            paranetKAStorageContract,
            paranetKATokenId,
            ParanetStructs.AccessPolicy.OPEN,
            ParanetStructs.AccessPolicy.OPEN,
            paranetName,
            paranetDescription,
            address(incentivesPool),
            tracToNeuroRatio,
            tracTarget,
            operatorRewardPercentage
        );

        return
            pr.registerParanet(
                paranetKAStorageContract,
                paranetKATokenId,
                msg.sender,
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
        paranetsRegistry.setName(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)), paranetName);

        emit ParanetNameUpdated(paranetKAStorageContract, paranetKATokenId, paranetName);
    }

    function updateParanetDescription(
        address paranetKAStorageContract,
        uint256 paranetKATokenId,
        string calldata paranetDescription
    ) external onlyParanetOperator(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId))) {
        paranetsRegistry.setName(
            keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
            paranetDescription
        );

        emit ParanetDescriptionUpdated(paranetKAStorageContract, paranetKATokenId, paranetDescription);
    }

    function transferParanetOwnership(
        address paranetKAStorageContract,
        uint256 paranetKATokenId,
        address operator
    ) external onlyParanetOperator(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId))) {
        paranetsRegistry.setOperatorAddress(
            keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
            operator
        );

        emit ParanetOwnershipTransferred(paranetKAStorageContract, paranetKATokenId, operator);
    }

    function addParanetService(
        address paranetKAStorageContract,
        uint256 paranetKATokenId,
        address paranetServiceKAStorageContract,
        uint256 paranetServiceKATokenId
    ) external onlyParanetOperator(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId))) {
        ParanetServicesRegistry psr = paranetServicesRegistry;

        if (
            !psr.paranetServiceExists(
                keccak256(abi.encodePacked(paranetServiceKAStorageContract, paranetServiceKATokenId))
            )
        ) {
            revert ParanetErrors.ParanetServiceDoesntExist(paranetServiceKAStorageContract, paranetServiceKATokenId);
        }

        paranetsRegistry.addService(
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
    ) external onlyParanetOperator(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId))) {
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

        emit ParanetServiceRegistered(
            paranetServiceKAStorageContract,
            paranetServiceKATokenId,
            paranetServiceName,
            paranetServiceDescription,
            worker,
            paranetServiceMetadata
        );

        return
            psr.registerParanetService(
                paranetServiceKAStorageContract,
                paranetServiceKATokenId,
                paranetServiceName,
                paranetServiceDescription,
                msg.sender,
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
        paranetServicesRegistry.setOperatorAddress(
            keccak256(abi.encodePacked(paranetServiceKAStorageContract, paranetServiceKATokenId)),
            operator
        );

        emit ParanetServiceOwnershipTransferred(paranetServiceKAStorageContract, paranetServiceKATokenId, operator);
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
        paranetServicesRegistry.setWorkerAddress(
            keccak256(abi.encodePacked(paranetServiceKAStorageContract, paranetServiceKATokenId)),
            worker
        );

        emit ParanetServiceWorkerUpdated(paranetServiceKAStorageContract, paranetServiceKATokenId, worker);
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
    )
        external
        onlyParanetServiceOperator(
            keccak256(abi.encodePacked(paranetServiceKAStorageContract, paranetServiceKATokenId))
        )
    {
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
    ) external {
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
            pkmr.registerKnowledgeMiner(msg.sender, bytes(""));
            pr.addKnowledgeMiner(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)), msg.sender);
        }

        // Mint Knowledge Asset
        uint256 knowledgeAssetTokenId = ca.createAssetFromContract(msg.sender, knowledgeAssetArgs);

        // Add Knowledge Asset to the KnowledgeAssetsRegistry
        pkar.addKnowledgeAsset(
            keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
            address(contentAssetStorage),
            knowledgeAssetTokenId,
            msg.sender,
            bytes("")
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
    }

    function submitKnowledgeAsset(
        address paranetKAStorageContract,
        uint256 paranetKATokenId,
        address knowledgeAssetStorageContract,
        uint256 knowledgeAssetTokenId
    ) external {
        ParanetsRegistry pr = paranetsRegistry;
        ParanetKnowledgeMinersRegistry pkmr = paranetKnowledgeMinersRegistry;
        ParanetKnowledgeAssetsRegistry pkar = paranetKnowledgeAssetsRegistry;

        if (!pr.paranetExists(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)))) {
            revert ParanetErrors.ParanetDoesntExist(paranetKAStorageContract, paranetKATokenId);
        }

        if (IERC721(knowledgeAssetStorageContract).ownerOf(knowledgeAssetTokenId) != msg.sender) {
            revert ParanetErrors.KnowledgeAssetSubmitterIsntOwner(
                paranetKAStorageContract,
                paranetKATokenId,
                knowledgeAssetStorageContract,
                knowledgeAssetTokenId
            );
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
            pkmr.registerKnowledgeMiner(msg.sender, bytes(""));
            pr.addKnowledgeMiner(keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)), msg.sender);
        }

        // Add Knowledge Asset to the KnowledgeAssetsRegistry
        pkar.addKnowledgeAsset(
            keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
            knowledgeAssetStorageContract,
            knowledgeAssetTokenId,
            msg.sender,
            bytes("")
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

            try ca.cancelAssetStateUpdate(updatingKnowledgeAssetStates[i].tokenId) {
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
        require(paranetsRegistry.getOperatorAddress(paranetId) == msg.sender, "Fn can only be used by operator");
    }

    function _checkParanetServiceOperator(bytes32 paranetServiceId) internal view virtual {
        require(
            paranetServicesRegistry.getOperatorAddress(paranetServiceId) == msg.sender,
            "Fn can only be used by operator"
        );
    }
}
