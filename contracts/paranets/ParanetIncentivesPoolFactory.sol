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
        address indexed paranetKCStorageContract,
        uint256 indexed paranetKCTokenId,
        ParanetLib.IncentivesPool incentivesPool
    );

    string private constant _NAME = "ParanetIncentivesPoolFactory";
    string private constant _VERSION = "1.0.0";

    ParanetsRegistry public paranetsRegistry;

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
        uint256 tracToNeuroEmissionMultiplier,
        uint16 paranetOperatorRewardPercentage,
        uint16 paranetIncentivizationProposalVotersRewardPercentage
    ) external onlyKnowledgeCollectionOwner(paranetKCStorageContract, paranetKCTokenId) returns (address) {
        Hub h = hub;
        ParanetsRegistry pr = paranetsRegistry;

        if (
            pr.hasIncentivesPoolByType(
                keccak256(abi.encodePacked(paranetKCStorageContract, paranetKCTokenId)),
                "Neuroweb"
            )
        ) {
            revert ParanetLib.ParanetIncentivesPoolAlreadyExists(
                paranetKCStorageContract,
                paranetKCTokenId,
                "Neuroweb",
                pr.getIncentivesPoolAddress(
                    keccak256(abi.encodePacked(paranetKCStorageContract, paranetKCTokenId)),
                    "Neuroweb"
                )
            );
        }

        ParanetNeuroIncentivesPool incentivesPool = new ParanetNeuroIncentivesPool(
            address(h),
            h.getContractAddress("ParanetsRegistry"),
            h.getContractAddress("ParanetKnowledgeMinersRegistry"),
            keccak256(abi.encodePacked(paranetKCStorageContract, paranetKCTokenId)),
            tracToNeuroEmissionMultiplier,
            paranetOperatorRewardPercentage,
            paranetIncentivizationProposalVotersRewardPercentage
        );

        pr.setIncentivesPoolAddress(
            keccak256(abi.encodePacked(paranetKCStorageContract, paranetKCTokenId)),
            "Neuroweb",
            address(incentivesPool)
        );

        emit ParanetIncetivesPoolDeployed(
            paranetKCStorageContract,
            paranetKCTokenId,
            ParanetLib.IncentivesPool({poolType: "Neuroweb", addr: address(incentivesPool)})
        );

        return address(incentivesPool);
    }

    function _checkKnowledgeCollectionOwner(
        address knowledgeCollectionStorageContract,
        uint256 knowledgeCollectionTokenId
    ) internal view virtual {
        require(hub.isCollectionStorage(knowledgeCollectionStorageContract), "Given address isn't KC Storage");
        require(
            IERC721(knowledgeCollectionStorageContract).ownerOf(knowledgeCollectionTokenId) == msg.sender,
            "Caller isn't the owner of the KC"
        );
    }
}
