// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {Hub} from "../storage/Hub.sol";
import {ParanetNeuroIncentivesPool} from "./ParanetNeuroIncentivesPool.sol";
import {ParanetNeuroIncentivesPoolStorage} from "./ParanetNeuroIncentivesPoolStorage.sol";
import {KnowledgeCollectionStorage} from "../storage/KnowledgeCollectionStorage.sol";
import {ContractStatus} from "../abstract/ContractStatus.sol";
import {IInitializable} from "../interfaces/IInitializable.sol";
import {INamed} from "../interfaces/INamed.sol";
import {IVersioned} from "../interfaces/IVersioned.sol";

contract ParanetIncentivesPoolFactoryHelper is INamed, IVersioned, ContractStatus {
    string private constant _NAME = "ParanetIncentivesPoolFactoryHelper";
    string private constant _VERSION = "1.0.0";

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) ContractStatus(hubAddress) {}

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function deployNeuroIncentivesPool(
        address storageAddress,
        uint256 tracToNeuroEmissionMultiplier,
        address poolStorageAddress
    ) external onlyContracts returns (address) {
        address addr = address(
            new ParanetNeuroIncentivesPool(
                address(hub),
                hub.getContractAddress("ParanetKnowledgeMinersRegistry"),
                storageAddress,
                tracToNeuroEmissionMultiplier
            )
        );
        ParanetNeuroIncentivesPoolStorage(payable(poolStorageAddress)).setParanetNeuroIncentivesPool(addr);

        return addr;
    }
}
