// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {Hub} from "../storage/Hub.sol";
import {ParanetsRegistry} from "../storage/paranets/ParanetsRegistry.sol";
import {ParanetNeuroIncentivesPool} from "./ParanetNeuroIncentivesPool.sol";
import {ContractStatus} from "../abstract/ContractStatus.sol";
import {IInitializable} from "../interfaces/IInitializable.sol";
import {INamed} from "../interfaces/INamed.sol";
import {IVersioned} from "../interfaces/IVersioned.sol";
import {ParanetLib} from "../libraries/ParanetLib.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract ParanetIncentivesPoolFactory is INamed, IVersioned, ContractStatus, IInitializable {
    event ParanetIncetivesPoolDeployed(
        address indexed paranetKAStorageContract,
        uint256 indexed paranetKATokenId,
        ParanetLib.IncentivesPool incentivesPool
    );

    string private constant _NAME = "ParanetIncentivesPoolFactory";
    string private constant _VERSION = "1.0.0";

    ParanetsRegistry public paranetsRegistry;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) ContractStatus(hubAddress) {}

    modifier onlyKnowledgeAssetOwner(address knowledgeAssetStorageContract, uint256 knowledgeAssetTokenId) {
        _checkKnowledgeAssetOwner(knowledgeAssetStorageContract, knowledgeAssetTokenId);
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
        address paranetKAStorageContract,
        uint256 paranetKATokenId,
        uint256 tracToNeuroEmissionMultiplier,
        uint16 paranetOperatorRewardPercentage,
        uint16 paranetIncentivizationProposalVotersRewardPercentage
    ) external onlyKnowledgeAssetOwner(paranetKAStorageContract, paranetKATokenId) returns (address) {
        Hub h = hub;
        ParanetsRegistry pr = paranetsRegistry;

        if (
            pr.hasIncentivesPoolByType(
                keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
                "Neuroweb"
            )
        ) {
            revert ParanetLib.ParanetIncentivesPoolAlreadyExists(
                paranetKAStorageContract,
                paranetKATokenId,
                "Neuroweb",
                pr.getIncentivesPoolAddress(
                    keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
                    "Neuroweb"
                )
            );
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

        pr.setIncentivesPoolAddress(
            keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
            "Neuroweb",
            address(incentivesPool)
        );

        emit ParanetIncetivesPoolDeployed(
            paranetKAStorageContract,
            paranetKATokenId,
            ParanetLib.IncentivesPool({poolType: "Neuroweb", addr: address(incentivesPool)})
        );

        return address(incentivesPool);
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
