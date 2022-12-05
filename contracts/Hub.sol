// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import { Named } from "./interface/Named.sol";
import { Versioned } from "./interface/Versioned.sol";
import { UnorderedNamedContractDynamicSetLib } from "./utils/UnorderedNamedContractDynamicSet.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract Hub is Named, Versioned, Ownable {

    using UnorderedNamedContractDynamicSetLib for UnorderedNamedContractDynamicSetLib.Set;

    event NewContract(string contractName, address newContractAddress);
    event ContractChanged(string contractName, address newContractAddress);
    event NewAssetContract(string contractName, address newContractAddress);
    event AssetContractChanged(string contractName, address newContractAddress);

    string constant private _NAME = "Hub";
    string constant private _VERSION = "1.0.0";

    UnorderedNamedContractDynamicSetLib.Set contractSet;
    UnorderedNamedContractDynamicSetLib.Set assetContractSet;

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function setContractAddress(string calldata contractName, address newContractAddress) external onlyOwner {
        if(contractSet.exists(contractName)) {
            emit ContractChanged(contractName, newContractAddress);
            contractSet.update(contractName, newContractAddress);
        } else {
            emit NewContract(contractName, newContractAddress);
            contractSet.append(contractName, newContractAddress);
        }
    }

    function setAssetContractAddress(string calldata assetContractName, address assetContractAddress)
        external
        onlyOwner
    {
        if(assetContractSet.exists(assetContractName)) {
            emit AssetContractChanged(assetContractName, assetContractAddress);
            assetContractSet.update(assetContractName, assetContractAddress);
        } else {
            emit NewAssetContract(assetContractName, assetContractAddress);
            assetContractSet.append(assetContractName, assetContractAddress);
        }
    }

    function getContractAddress(string calldata contractName) external view returns (address) {
        return contractSet.get(contractName).addr;
    }

    function getAssetContractAddress(string calldata assetContractName) external view returns (address) {
        return assetContractSet.get(assetContractName).addr;
    }

    function getAllContracts() external view returns (UnorderedNamedContractDynamicSetLib.Contract[] memory) {
        return contractSet.getAll();
    }

    function getAllAssetContracts() external view returns (UnorderedNamedContractDynamicSetLib.Contract[] memory) {
        return assetContractSet.getAll();
    }

    function isContract(string calldata contractName) external view returns (bool) {
        return contractSet.exists(contractName);
    }
    
    function isContract(address selectedContractAddress) external view returns (bool) {
        return contractSet.exists(selectedContractAddress);
    }

    function isAssetContract(string calldata assetContractName) external view returns (bool) {
        return assetContractSet.exists(assetContractName);
    }

    function isAssetContract(address assetContractAddress) external view returns (bool) {
        return assetContractSet.exists(assetContractAddress);
    }

}
