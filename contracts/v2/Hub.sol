// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {Named} from "../v1/interface/Named.sol";
import {Versioned} from "../v1/interface/Versioned.sol";
import {UnorderedNamedContractDynamicSetLibV2} from "./utils/UnorderedNamedContractDynamicSet.sol";
import {UnorderedNamedContractDynamicSetStructs} from "./structs/UnorderedNamedContractDynamicSetStructs.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract HubV2 is Named, Versioned, Ownable {
    using UnorderedNamedContractDynamicSetLibV2 for UnorderedNamedContractDynamicSetStructs.Set;

    event NewContract(string contractName, address newContractAddress);
    event ContractChanged(string contractName, address newContractAddress);
    event NewAssetStorage(string contractName, address newContractAddress);
    event AssetStorageChanged(string contractName, address newContractAddress);

    string private constant _NAME = "Hub";
    string private constant _VERSION = "2.0.0";

    UnorderedNamedContractDynamicSetStructs.Set internal contractSet;
    UnorderedNamedContractDynamicSetStructs.Set internal assetStorageSet;

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function setContractAddress(string calldata contractName, address newContractAddress) external onlyOwner {
        if (contractSet.exists(contractName)) {
            emit ContractChanged(contractName, newContractAddress);
            contractSet.update(contractName, newContractAddress);
        } else {
            emit NewContract(contractName, newContractAddress);
            contractSet.append(contractName, newContractAddress);
        }
    }

    function setAssetStorageAddress(string calldata assetStorageName, address assetStorageAddress) external onlyOwner {
        if (assetStorageSet.exists(assetStorageName)) {
            emit AssetStorageChanged(assetStorageName, assetStorageAddress);
            assetStorageSet.update(assetStorageName, assetStorageAddress);
        } else {
            emit NewAssetStorage(assetStorageName, assetStorageAddress);
            assetStorageSet.append(assetStorageName, assetStorageAddress);
        }
    }

    function getContractAddress(string calldata contractName) external view returns (address) {
        return contractSet.get(contractName).addr;
    }

    function getAssetStorageAddress(string calldata assetStorageName) external view returns (address) {
        return assetStorageSet.get(assetStorageName).addr;
    }

    function getAllContracts() external view returns (UnorderedNamedContractDynamicSetStructs.Contract[] memory) {
        return contractSet.getAll();
    }

    function getAllAssetStorages() external view returns (UnorderedNamedContractDynamicSetStructs.Contract[] memory) {
        return assetStorageSet.getAll();
    }

    function isContract(string calldata contractName) external view returns (bool) {
        return contractSet.exists(contractName);
    }

    function isContract(address selectedContractAddress) external view returns (bool) {
        return contractSet.exists(selectedContractAddress);
    }

    function isAssetStorage(string calldata assetStorageName) external view returns (bool) {
        return assetStorageSet.exists(assetStorageName);
    }

    function isAssetStorage(address assetStorageAddress) external view returns (bool) {
        return assetStorageSet.exists(assetStorageAddress);
    }
}
