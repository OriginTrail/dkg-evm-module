// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {Hub} from "../storage/Hub.sol";
import {ParanetsRegistry} from "../storage/paranets/ParanetsRegistry.sol";
import {ParanetNeuroIncentivesPool} from "./ParanetNeuroIncentivesPool.sol";
import {KnowledgeCollectionStorage} from "../storage/KnowledgeCollectionStorage.sol";
import {ContractStatus} from "../abstract/ContractStatus.sol";
import {IInitializable} from "../interfaces/IInitializable.sol";
import {INamed} from "../interfaces/INamed.sol";
import {IVersioned} from "../interfaces/IVersioned.sol";
import {ParanetLib} from "../libraries/ParanetLib.sol";

contract ParanetIncentivesPoolFactory is INamed, IVersioned, ContractStatus, IInitializable {
    event ParanetIncetivesPoolDeployed(
        address indexed paranetKCStorageContract,
        uint256 indexed paranetKCTokenId,
        ParanetLib.IncentivesPool incentivesPool
    );

    string private constant _NAME = "ParanetIncentivesPoolFactory";
    string private constant _VERSION = "1.0.0";

    ParanetsRegistry public paranetsRegistry;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) ContractStatus(hubAddress) {}

    modifier onlyKnowledgeAssetOwner(
        address knowledgeCollectionStorageContract,
        uint256 knowledgeCollectionTokenId,
        uint256 knowledgeAssetTokenId
    ) {
        _checkKnowledgeAssetOwner(
            knowledgeCollectionStorageContract,
            knowledgeCollectionTokenId,
            knowledgeAssetTokenId
        );
        _;
    }

    function initialize() public onlyHub {
        paranetsRegistry = ParanetsRegistry(hub.getContractAddress("ParanetsRegistry"));
    }

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function deployNeuroIncentivesPool(
        bool isNativeReward,
        address paranetKCStorageContract,
        uint256 paranetKCTokenId,
        uint256 paranetKATokenId,
        uint256 tracToNeuroEmissionMultiplier,
        uint16 paranetOperatorRewardPercentage,
        uint16 paranetIncentivizationProposalVotersRewardPercentage
    ) external onlyKnowledgeAssetOwner(paranetKCStorageContract, paranetKCTokenId, paranetKATokenId) returns (address) {
        Hub h = hub;
        ParanetsRegistry pr = paranetsRegistry;
        string memory incentivesPoolType = isNativeReward ? "Neuroweb" : "NeurowebERC20";

        if (
            pr.hasIncentivesPoolByType(
                keccak256(abi.encodePacked(paranetKCStorageContract, paranetKCTokenId, paranetKATokenId)),
                incentivesPoolType
            )
        ) {
            revert ParanetLib.ParanetIncentivesPoolAlreadyExists(
                paranetKCStorageContract,
                paranetKCTokenId,
                paranetKATokenId,
                incentivesPoolType,
                pr.getIncentivesPoolAddress(
                    keccak256(abi.encodePacked(paranetKCStorageContract, paranetKCTokenId, paranetKATokenId)),
                    incentivesPoolType
                )
            );
        }

        ParanetNeuroIncentivesPool incentivesPool = new ParanetNeuroIncentivesPool(
            address(h),
            isNativeReward ? address(0) : h.getContractAddress(incentivesPoolType),
            h.getContractAddress("ParanetsRegistry"),
            h.getContractAddress("ParanetKnowledgeMinersRegistry"),
            keccak256(abi.encodePacked(paranetKCStorageContract, paranetKCTokenId, paranetKATokenId)),
            tracToNeuroEmissionMultiplier,
            paranetOperatorRewardPercentage,
            paranetIncentivizationProposalVotersRewardPercentage
        );

        pr.setIncentivesPoolAddress(
            keccak256(abi.encodePacked(paranetKCStorageContract, paranetKCTokenId, paranetKATokenId)),
            incentivesPoolType,
            address(incentivesPool)
        );

        emit ParanetIncetivesPoolDeployed(
            paranetKCStorageContract,
            paranetKCTokenId,
            ParanetLib.IncentivesPool({poolType: incentivesPoolType, addr: address(incentivesPool)})
        );

        return address(incentivesPool);
    }

    function _checkKnowledgeAssetOwner(
        address knowledgeCollectionStorageContractAddress,
        uint256 knowledgeCollectionId,
        uint256 knowledgeAssetId
    ) internal virtual {
        require(hub.isAssetStorage(knowledgeCollectionStorageContractAddress), "Given address isn't KC Storage");

        KnowledgeCollectionStorage knowledgeCollectionStorage = KnowledgeCollectionStorage(
            knowledgeCollectionStorageContractAddress
        );

        uint256 startTokenId = (knowledgeCollectionId - 1) *
            knowledgeCollectionStorage.knowledgeCollectionMaxSize() +
            knowledgeAssetId;

        uint256 ownedCountInRange = knowledgeCollectionStorage.balanceOf(msg.sender, startTokenId, startTokenId + 1);
        require(ownedCountInRange == 1, "Caller isn't the owner of the KA");
    }
}
