// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {Hub} from "../storage/Hub.sol";
import {ParanetsRegistry} from "../storage/paranets/ParanetsRegistry.sol";
import {ParanetNeuroIncentivesPool} from "./ParanetNeuroIncentivesPool.sol";
import {ParanetNeuroIncentivesPoolStorage} from "./ParanetNeuroIncentivesPoolStorage.sol";
import {ParanetIncentivesPoolFactoryHelper} from "./ParanetIncentivesPoolFactoryHelper.sol";
import {KnowledgeCollectionStorage} from "../storage/KnowledgeCollectionStorage.sol";
import {ContractStatus} from "../abstract/ContractStatus.sol";
import {IInitializable} from "../interfaces/IInitializable.sol";
import {INamed} from "../interfaces/INamed.sol";
import {IVersioned} from "../interfaces/IVersioned.sol";

contract ParanetIncentivesPoolFactory is INamed, IVersioned, ContractStatus, IInitializable {
    event ParanetIncentivesPoolDeployed(
        bytes32 indexed paranetId,
        address storageAddress,
        address poolAddress,
        address rewardTokenAddress
    );

    event ParanetIncentivesPoolRedeployed(bytes32 indexed paranetId, address storageAddress, address newPoolAddress);

    string private constant _NAME = "ParanetIncentivesPoolFactory";
    string private constant _VERSION = "1.0.0";

    ParanetsRegistry public paranetsRegistry;
    ParanetIncentivesPoolFactoryHelper public paranetIncentivesPoolFactoryHelper;

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
        paranetIncentivesPoolFactoryHelper = ParanetIncentivesPoolFactoryHelper(
            hub.getContractAddress("ParanetIncentivesPoolFactoryHelper")
        );
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
    ) external onlyKnowledgeAssetOwner(paranetKCStorageContract, paranetKCTokenId, paranetKATokenId) {
        bytes32 paranetId = _computeParanetId(paranetKCStorageContract, paranetKCTokenId, paranetKATokenId);
        ParanetsRegistry pr = paranetsRegistry;
        require(pr.paranetExists(paranetId));
        require(pr.hasIncentivesPoolByName(paranetId, incentivesPoolName));

        ParanetNeuroIncentivesPoolStorage storage_ = new ParanetNeuroIncentivesPoolStorage(
            address(hub),
            rewardTokenAddress,
            paranetId,
            paranetOperatorRewardPercentage,
            paranetIncentivizationProposalVotersRewardPercentage
        );
        address storageAddress = address(storage_);

        address poolAddress = paranetIncentivesPoolFactoryHelper.deployNeuroIncentivesPool(
            storageAddress,
            tracToNeuroEmissionMultiplier,
            address(storage_)
        );

        storage_.initialize();
        paranetsRegistry.addIncentivesPool(paranetId, incentivesPoolName, storageAddress, rewardTokenAddress);

        emit ParanetIncentivesPoolDeployed(paranetId, storageAddress, poolAddress, rewardTokenAddress);
    }

    function redeployNeuroIncentivesPool(
        address paranetKCStorageContract,
        uint256 paranetKCTokenId,
        uint256 paranetKATokenId,
        address storageAddress
    ) external onlyKnowledgeAssetOwner(paranetKCStorageContract, paranetKCTokenId, paranetKATokenId) {
        bytes32 paranetId = _computeParanetId(paranetKCStorageContract, paranetKCTokenId, paranetKATokenId);

        ParanetsRegistry pr = paranetsRegistry;
        require(pr.paranetExists(paranetId));
        require(pr.hasIncentivesPoolByStorageAddress(paranetId, storageAddress));

        ParanetNeuroIncentivesPoolStorage storage_ = ParanetNeuroIncentivesPoolStorage(payable(storageAddress));
        require(storage_.paranetId() == paranetId);

        address oldPoolAddress = storage_.paranetNeuroIncentivesPoolAddress();
        uint256 tracToNeuroEmissionMultiplier = ParanetNeuroIncentivesPool(oldPoolAddress)
            .getEffectiveNeuroEmissionMultiplier(block.timestamp);

        address newPoolAddress = paranetIncentivesPoolFactoryHelper.deployNeuroIncentivesPool(
            storageAddress,
            tracToNeuroEmissionMultiplier,
            address(storage_)
        );

        emit ParanetIncentivesPoolRedeployed(paranetId, storageAddress, newPoolAddress);
    }

    function _computeParanetId(
        address knowledgeCollectionStorageContract,
        uint256 knowledgeCollectionTokenId,
        uint256 knowledgeAssetTokenId
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(knowledgeCollectionStorageContract, knowledgeCollectionTokenId, knowledgeAssetTokenId)
            );
    }

    function _checkKnowledgeAssetOwner(
        address knowledgeCollectionStorageContractAddress,
        uint256 knowledgeCollectionId,
        uint256 knowledgeAssetId
    ) internal view {
        require(hub.isAssetStorage(knowledgeCollectionStorageContractAddress));

        KnowledgeCollectionStorage knowledgeCollectionStorage = KnowledgeCollectionStorage(
            knowledgeCollectionStorageContractAddress
        );

        uint256 startTokenId = (knowledgeCollectionId - 1) *
            knowledgeCollectionStorage.knowledgeCollectionMaxSize() +
            knowledgeAssetId;

        require(knowledgeCollectionStorage.balanceOf(msg.sender, startTokenId, startTokenId + 1) == 1);
    }
}
