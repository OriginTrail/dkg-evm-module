// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {HubV2} from "../Hub.sol";
import {ParanetsRegistry} from "../storage/paranets/ParanetsRegistry.sol";
import {ParanetNeuroIncentivesPool} from "./ParanetNeuroIncentivesPool.sol";
import {ContractStatusV2} from "../abstract/ContractStatus.sol";
import {Initializable} from "../../v1/interface/Initializable.sol";
import {Named} from "../../v1/interface/Named.sol";
import {Versioned} from "../../v1/interface/Versioned.sol";
import {ParanetStructs} from "../structs/paranets/ParanetStructs.sol";
import {ParanetErrors} from "../errors/paranets/ParanetErrors.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract ParanetIncentivesPoolFactory is Named, Versioned, ContractStatusV2, Initializable {
    event ParanetIncetivesPoolDeployed(
        address indexed paranetKAStorageContract,
        uint256 indexed paranetKATokenId,
        ParanetStructs.IncentivesPool incentivesPool
    );

    string private constant _NAME = "ParanetIncentivesPoolFactory";
    string private constant _VERSION = "2.0.0";

    ParanetsRegistry public paranetsRegistry;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) ContractStatusV2(hubAddress) {}

    modifier onlyKnowledgeAssetOwner(address knowledgeAssetStorageContract, uint256 knowledgeAssetTokenId) {
        _checkKnowledgeAssetOwner(knowledgeAssetStorageContract, knowledgeAssetTokenId);
        _;
    }

    function initialize() public onlyHubOwner {
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
        address paranetKAStorageContract,
        uint256 paranetKATokenId,
        uint256 tracToNeuroEmissionMultiplier,
        uint16 paranetOperatorRewardPercentage,
        uint16 paranetIncentivizationProposalVotersRewardPercentage
    ) external onlyKnowledgeAssetOwner(paranetKAStorageContract, paranetKATokenId) returns (address) {
        HubV2 h = hub;
        ParanetsRegistry pr = paranetsRegistry;
        string memory incentivesPoolType = isNativeReward ? "Neuroweb" : "NeurowebERC20";

        if (
            pr.hasIncentivesPoolByType(
                keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
                incentivesPoolType
            )
        ) {
            revert ParanetErrors.ParanetIncentivesPoolAlreadyExists(
                paranetKAStorageContract,
                paranetKATokenId,
                incentivesPoolType,
                pr.getIncentivesPoolAddress(
                    keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
                    incentivesPoolType
                )
            );
        }

        ParanetNeuroIncentivesPool incentivesPool = new ParanetNeuroIncentivesPool(
            address(h),
            isNativeReward ? address(0) : h.getContractAddress(incentivesPoolType),
            h.getContractAddress("ParanetsRegistry"),
            h.getContractAddress("ParanetKnowledgeMinersRegistry"),
            keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
            tracToNeuroEmissionMultiplier,
            paranetOperatorRewardPercentage,
            paranetIncentivizationProposalVotersRewardPercentage
        );

        pr.setIncentivesPoolAddress(
            keccak256(abi.encodePacked(paranetKAStorageContract, paranetKATokenId)),
            incentivesPoolType,
            address(incentivesPool)
        );

        emit ParanetIncetivesPoolDeployed(
            paranetKAStorageContract,
            paranetKATokenId,
            ParanetStructs.IncentivesPool({poolType: incentivesPoolType, addr: address(incentivesPool)})
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
