// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {Hub} from "../storage/Hub.sol";
import {ParanetsRegistry} from "../storage/paranets/ParanetsRegistry.sol";
import {ParanetNeuroIncentivesPool} from "./ParanetNeuroIncentivesPool.sol";
import {ParanetNeuroIncentivesPoolStorage} from "./ParanetNeuroIncentivesPoolStorage.sol";
import {KnowledgeCollectionStorage} from "../storage/KnowledgeCollectionStorage.sol";
import {ContractStatus} from "../abstract/ContractStatus.sol";
import {IInitializable} from "../interfaces/IInitializable.sol";
import {INamed} from "../interfaces/INamed.sol";
import {IVersioned} from "../interfaces/IVersioned.sol";
import {ParanetLib} from "../libraries/ParanetLib.sol";

contract ParanetIncentivesPoolFactory is INamed, IVersioned, ContractStatus, IInitializable {
    event ParanetIncentivesPoolDeployed(
        address indexed paranetKCStorageContract,
        uint256 indexed paranetKCTokenId,
        uint256 indexed paranetKATokenId,
        address storageAddress,
        address poolAddress,
        string incentivesPoolName,
        address rewardTokenAddress
    );
    event ParanetIncentivesPoolRedeployed(
        address indexed paranetKCStorageContract,
        uint256 indexed paranetKCTokenId,
        uint256 indexed paranetKATokenId,
        address storageAddress,
        address oldPoolAddress,
        address newPoolAddress
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
        address paranetKCStorageContract,
        uint256 paranetKCTokenId,
        uint256 paranetKATokenId,
        uint256 tracToNeuroEmissionMultiplier,
        uint16 paranetOperatorRewardPercentage,
        uint16 paranetIncentivizationProposalVotersRewardPercentage,
        string calldata incentivesPoolName,
        address rewardTokenAddress
    )
        external
        onlyKnowledgeAssetOwner(paranetKCStorageContract, paranetKCTokenId, paranetKATokenId)
        returns (address poolAddress, address storageAddress)
    {
        Hub h = hub;
        ParanetsRegistry pr = paranetsRegistry;
        bytes32 paranetId = keccak256(abi.encodePacked(paranetKCStorageContract, paranetKCTokenId, paranetKATokenId));

        require(pr.paranetExists(paranetId), "Paranet doesn't exist");
        require(pr.hasIncentivesPoolByName(paranetId, incentivesPoolName), "Incentives pool already exists");

        ParanetNeuroIncentivesPoolStorage storage_ = new ParanetNeuroIncentivesPoolStorage(
            address(h),
            rewardTokenAddress,
            paranetId,
            paranetOperatorRewardPercentage,
            paranetIncentivizationProposalVotersRewardPercentage
        );
        storageAddress = address(storage_);

        ParanetNeuroIncentivesPool pool = new ParanetNeuroIncentivesPool(
            address(h),
            h.getContractAddress("ParanetKnowledgeMinersRegistry"),
            storageAddress,
            tracToNeuroEmissionMultiplier
        );
        poolAddress = address(pool);

        // Initialize storage contract
        storage_.initialize();
        storage_.setParanetNeuroIncentivesPool(poolAddress);
        pr.addIncentivesPool(
            paranetId,
            ParanetLib.IncentivesPool({name: incentivesPoolName, storageAddr: storageAddress})
        );

        emit ParanetIncentivesPoolDeployed(
            paranetKCStorageContract,
            paranetKCTokenId,
            paranetKATokenId,
            storageAddress,
            poolAddress,
            incentivesPoolName,
            rewardTokenAddress
        );

        return (poolAddress, storageAddress);
    }

    function redeployNeuroIncentivesPool(
        address paranetKCStorageContract,
        uint256 paranetKCTokenId,
        uint256 paranetKATokenId,
        address storageAddress
    )
        external
        onlyKnowledgeAssetOwner(paranetKCStorageContract, paranetKCTokenId, paranetKATokenId)
        returns (address newPoolAddress)
    {
        Hub h = hub;
        ParanetsRegistry pr = paranetsRegistry;
        bytes32 paranetId = keccak256(abi.encodePacked(paranetKCStorageContract, paranetKCTokenId, paranetKATokenId));

        require(pr.paranetExists(paranetId), "Paranet doesn't exist");
        require(pr.hasIncentivesPoolByStorageAddress(paranetId, storageAddress), "Incentives pool doesn't exist");

        ParanetNeuroIncentivesPoolStorage storage_ = ParanetNeuroIncentivesPoolStorage(payable(storageAddress));
        require(storage_.paranetId() == paranetId, "Storage paranet ID mismatch");

        address oldPoolAddress = storage_.paranetNeuroIncentivesPool();
        ParanetNeuroIncentivesPool oldPool = ParanetNeuroIncentivesPool(oldPoolAddress);
        uint256 tracToNeuroEmissionMultiplier = oldPool.getEffectiveNeuroEmissionMultiplier(block.timestamp);

        ParanetNeuroIncentivesPool newPool = new ParanetNeuroIncentivesPool(
            address(h),
            h.getContractAddress("ParanetKnowledgeMinersRegistry"),
            storageAddress,
            tracToNeuroEmissionMultiplier
        );
        newPoolAddress = address(newPool);

        storage_.setParanetNeuroIncentivesPool(newPoolAddress);

        emit ParanetIncentivesPoolRedeployed(
            paranetKCStorageContract,
            paranetKCTokenId,
            paranetKATokenId,
            storageAddress,
            oldPoolAddress,
            newPoolAddress
        );

        return (newPoolAddress, storageAddress);
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
