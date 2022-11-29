// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { Named } from "./interface/Named.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { UnorderedNamedContractDynamicSetLib } from "./utils/UnorderedNamedContractDynamicSet.sol";

contract Hub is Ownable{
    using UnorderedNamedContractDynamicSetLib for UnorderedNamedContractDynamicSetLib.Set;

    event NewContract(string contractName, address newContractAddress);
    event ContractChanged(string contractName, address newContractAddress);
    event NewAssetContract(string contractName, address newContractAddress);
    event AssetContractChanged(string contractName, address newContractAddress);

    mapping(bytes32 => address) contractAddress;
    mapping(address => bool) contractList;

    UnorderedNamedContractDynamicSetLib.Set assetContractSet;

    function setContractAddress(string memory contractName, address newContractAddress) public onlyOwner {
        require(newContractAddress != address(0), "Contract address cannot be empty");

        bytes32 index = keccak256(abi.encodePacked(contractName));

        if(contractAddress[index] != address(0)) {
            address oldContractAddress = contractAddress[index];
            contractList[oldContractAddress] = false;

            emit ContractChanged(contractName, newContractAddress);
        } else {
            emit NewContract(contractName, newContractAddress);
        }

        contractAddress[index] = newContractAddress;
        contractList[newContractAddress] = true;
    }

    function setAssetContractAddress(string memory assetContractName, address assetContractAddress) public onlyOwner {
        if(assetContractSet.exists(assetContractName)) {
            emit AssetContractChanged(assetContractName, assetContractAddress);
            assetContractSet.update(assetContractName, assetContractAddress);
        } else {
            emit NewAssetContract(assetContractName, assetContractAddress);
            assetContractSet.append(assetContractName, assetContractAddress);
        }
    }

    function getContractAddress(string memory contractName) public view returns (address) {
        bytes32 index = keccak256(abi.encodePacked(contractName));
        return contractAddress[index];
    }

    function getAssetContractAddress(string memory assetContractName) public view returns (address) {
        return assetContractSet.get(assetContractName).addr;
    }

    function getAllAssetContracts() public view returns (UnorderedNamedContractDynamicSetLib.Contract[] memory) {
        return assetContractSet.getAll();
    }
    
    function isContract(address selectedContractAddress) public view returns (bool) {
        return contractList[selectedContractAddress];
    }

    function isAssetContract(address assetContractAddress) public view returns (bool) {
        return assetContractSet.exists(Named(assetContractAddress).name());
    }
}
