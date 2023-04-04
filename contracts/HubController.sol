// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {ContractStatus} from "./abstract/ContractStatus.sol";
import {Named} from "./interface/Named.sol";
import {Versioned} from "./interface/Versioned.sol";
import {Initializable} from "./interface/Initializable.sol";
import {GeneralStructs} from "./structs/GeneralStructs.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract HubController is Named, Versioned, ContractStatus, Ownable {
    string private constant _NAME = "HubController";
    string private constant _VERSION = "1.0.0";

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) ContractStatus(hubAddress) {}

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function forwardCall(address target, bytes calldata data) external onlyOwner returns (bytes memory) {
        require(hub.isContract(target), "Target contract isn't in the Hub");

        (bool success, bytes memory result) = target.call{value: 0}(data);

        if (!success) {
            revert(string(result));
        }

        return result;
    }

    function setAndReinitializeContracts(
        GeneralStructs.Contract[] calldata newContracts,
        GeneralStructs.Contract[] calldata newAssetStorageContracts,
        address[] calldata contractsToReinitialize
    ) external onlyOwner {
        for (uint i; i < newContracts.length; ) {
            hub.setContractAddress(newContracts[i].name, newContracts[i].addr);
        }

        for (uint i; i < newAssetStorageContracts.length; ) {
            hub.setAssetStorageAddress(newAssetStorageContracts[i].name, newAssetStorageContracts[i].addr);
        }

        for (uint i; i < contractsToReinitialize.length; ) {
            Initializable(contractsToReinitialize[i]).initialize();
        }
    }

    function setContractAddress(string calldata contractName, address newContractAddress) external onlyOwner {
        hub.setContractAddress(contractName, newContractAddress);
    }

    function setAssetStorageAddress(string calldata assetStorageName, address assetStorageAddress) external onlyOwner {
        hub.setAssetStorageAddress(assetStorageName, assetStorageAddress);
    }
}
