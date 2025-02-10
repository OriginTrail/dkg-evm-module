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
        ParanetLib.IncentivesPool incentivesPool
    );
    event ParanetIncentivesPoolRedeployed(
        address indexed paranetKCStorageContract,
        uint256 indexed paranetKCTokenId,
        uint256 indexed paranetKATokenId,
        address storageAddress,
        address oldPoolAddress,
        address newPoolAddress,
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
    )
        external
        onlyKnowledgeAssetOwner(paranetKCStorageContract, paranetKCTokenId, paranetKATokenId)
        returns (address poolAddress, address storageAddress)
    {
        Hub h = hub;
        ParanetsRegistry pr = paranetsRegistry;
        bytes32 paranetId = keccak256(abi.encodePacked(paranetKCStorageContract, paranetKCTokenId, paranetKATokenId));
        string memory incentivesPoolType = isNativeReward ? "Neuroweb" : "NeurowebERC20";

        // Check if pool already exists
        if (pr.hasIncentivesPoolByType(paranetId, incentivesPoolType)) {
            // Get existing addresses
            address existingPoolAddress = pr.getIncentivesPoolAddress(paranetId, incentivesPoolType);
            require(existingPoolAddress != address(0), "Invalid existing pool");

            ParanetNeuroIncentivesPool existingPool = ParanetNeuroIncentivesPool(existingPoolAddress);
            storageAddress = address(existingPool.paranetNeuroIncentivesPoolStorage());
            require(storageAddress != address(0), "Invalid existing storage");

            // Deploy new pool contract
            ParanetNeuroIncentivesPool newPool = new ParanetNeuroIncentivesPool(
                address(h),
                h.getContractAddress("ParanetKnowledgeMinersRegistry"),
                storageAddress,
                tracToNeuroEmissionMultiplier
            );

            // Update registry with new pool address
            pr.setIncentivesPoolAddress(paranetId, incentivesPoolType, address(newPool));

            // Update storage with new pool address
            ParanetNeuroIncentivesPoolStorage(payable(storageAddress)).setParanetNeuroIncentivesPool(address(newPool));

            poolAddress = address(newPool);
        } else {
            // Deploy new storage contract
            ParanetNeuroIncentivesPoolStorage storage_ = new ParanetNeuroIncentivesPoolStorage(
                address(h),
                isNativeReward ? address(0) : h.getContractAddress(incentivesPoolType),
                paranetId,
                paranetOperatorRewardPercentage,
                paranetIncentivizationProposalVotersRewardPercentage
            );

            // Deploy new pool contract
            ParanetNeuroIncentivesPool pool = new ParanetNeuroIncentivesPool(
                address(h),
                h.getContractAddress("ParanetKnowledgeMinersRegistry"),
                address(storage_),
                tracToNeuroEmissionMultiplier
            );

            // Initialize storage
            storage_.initialize();
            storage_.setParanetNeuroIncentivesPool(address(pool));

            // Register pool in registry
            pr.setIncentivesPoolAddress(paranetId, incentivesPoolType, address(pool));

            storageAddress = address(storage_);
            poolAddress = address(pool);
        }

        emit ParanetIncentivesPoolDeployed(
            paranetKCStorageContract,
            paranetKCTokenId,
            paranetKATokenId,
            storageAddress,
            poolAddress,
            ParanetLib.IncentivesPool({poolType: incentivesPoolType, addr: poolAddress})
        );

        return (poolAddress, storageAddress);
    }

    function redeployNeuroIncentivesPool(
        bool isNativeReward,
        address paranetKCStorageContract,
        uint256 paranetKCTokenId,
        uint256 paranetKATokenId
    )
        external
        onlyKnowledgeAssetOwner(paranetKCStorageContract, paranetKCTokenId, paranetKATokenId)
        returns (address newPoolAddress, address storageAddress)
    {
        Hub h = hub;
        ParanetsRegistry pr = paranetsRegistry;
        bytes32 paranetId = keccak256(abi.encodePacked(paranetKCStorageContract, paranetKCTokenId, paranetKATokenId));
        string memory incentivesPoolType = isNativeReward ? "Neuroweb" : "NeurowebERC20";

        // Verify existing pool and get addresses
        require(pr.hasIncentivesPoolByType(paranetId, incentivesPoolType), "Pool doesn't exist");
        address oldPoolAddress = pr.getIncentivesPoolAddress(paranetId, incentivesPoolType);
        require(oldPoolAddress != address(0), "Invalid existing pool");

        // Get storage address from existing pool
        ParanetNeuroIncentivesPool existingPool = ParanetNeuroIncentivesPool(oldPoolAddress);
        storageAddress = address(existingPool.paranetNeuroIncentivesPoolStorage());
        require(storageAddress != address(0), "Invalid storage address");

        // Verify storage contract is active
        ParanetNeuroIncentivesPoolStorage storage_ = ParanetNeuroIncentivesPoolStorage(payable(storageAddress));
        require(storage_.paranetId() == paranetId, "Storage paranet ID mismatch");

        address oldLogicContract = storage_.paranetNeuroIncentivesPoolAddress();
        ParanetNeuroIncentivesPool oldPool = ParanetNeuroIncentivesPool(oldLogicContract);
        uint256 tracToNeuroEmissionMultiplier = oldPool.getEffectiveNeuroEmissionMultiplier(block.timestamp);

        // Deploy new pool contract
        ParanetNeuroIncentivesPool newPool = new ParanetNeuroIncentivesPool(
            address(h),
            h.getContractAddress("ParanetKnowledgeMinersRegistry"),
            storageAddress,
            tracToNeuroEmissionMultiplier
        );
        newPoolAddress = address(newPool);

        // Update registry with new pool address
        pr.setIncentivesPoolAddress(paranetId, incentivesPoolType, newPoolAddress);

        // Update storage to point to new pool
        storage_.setParanetNeuroIncentivesPool(newPoolAddress);

        emit ParanetIncentivesPoolRedeployed(
            paranetKCStorageContract,
            paranetKCTokenId,
            paranetKATokenId,
            storageAddress,
            oldPoolAddress,
            newPoolAddress,
            ParanetLib.IncentivesPool({poolType: incentivesPoolType, addr: newPoolAddress})
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
