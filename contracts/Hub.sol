// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";


contract Hub is Ownable{
    mapping(bytes32 => address) contractAddress;
    mapping(address => bool) contractList;

    mapping(bytes32 => address) assetTypeContractAdresses;
    mapping(address => bool) assetTypeContractsList;

    event ContractsChanged();
    event AssetTypeContractsChanged();

    function setContractAddress(string memory contractName, address newContractAddress)
        public
        onlyOwner
    {
        bytes32 index = keccak256(abi.encodePacked(contractName));

        if(contractAddress[index] != address(0)) {
            address oldContractAddress = contractAddress[index];
            contractList[oldContractAddress] = false;
        }
        contractAddress[index] = newContractAddress;

        if(newContractAddress != address(0)){
            contractList[newContractAddress] = true;
        }

        emit ContractsChanged();
    }

    function setAssetTypeContractAddress(string memory assetTypeName, address newContractAddress)
        public
        onlyOwner
    {
        bytes32 index = keccak256(abi.encodePacked(assetTypeName));

        if(assetTypeContractAdresses[index] != address(0)) {
            address oldContractAddress = assetTypeContractAdresses[index];
            assetTypeContractsList[oldContractAddress] = false;
        }
        assetTypeContractAdresses[index] = newContractAddress;

        if(newContractAddress != address(0)){
            assetTypeContractsList[newContractAddress] = true;
        }

        emit AssetTypeContractsChanged();
    }

    function getContractAddress(string memory contractName)
        public
        view
        returns (address)
    {
        bytes32 index = keccak256(abi.encodePacked(contractName));
        return contractAddress[index];
    }

    function getAssetTypeContractAddress(string memory assetTypeName)
        public
        view
        returns (address)
    {
        bytes32 index = keccak256(abi.encodePacked(assetTypeName));
        return assetTypeContractAdresses[index];
    }
    
    function isContract(address selectedContractAddress)
        public
        view
        returns (bool)
    {
        return contractList[selectedContractAddress];
    }

    function isAssetTypeContract(address assetTypeContractAddress)
        public
        view
        returns (bool)
    {
        return assetTypeContractsList[assetTypeContractAddress];
    }
}

