// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract Hub is Ownable{
    event ContractsChanged(string contractName, address newContractAddres);
    event AssetContractsChanged(string contractName, address newContractAddres);

    mapping(bytes32 => address) contractAddress;
    mapping(address => bool) contractList;

    mapping(bytes32 => address) assetContractAdresses;
    mapping(address => bool) assetContractsList;

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

        emit ContractsChanged(contractName, newContractAddress);
    }

    function setAssetContractAddress(string memory assetTypeName, address newContractAddress)
        public
        onlyOwner
    {
        bytes32 index = keccak256(abi.encodePacked(assetTypeName));

        if(assetContractAdresses[index] != address(0)) {
            address oldContractAddress = assetContractAdresses[index];
            assetContractsList[oldContractAddress] = false;
        }
        assetContractAdresses[index] = newContractAddress;

        if(newContractAddress != address(0)){
            assetContractsList[newContractAddress] = true;
        }

        emit AssetContractsChanged(assetTypeName, newContractAddress);
    }

    function getContractAddress(string memory contractName)
        public
        view
        returns (address)
    {
        bytes32 index = keccak256(abi.encodePacked(contractName));
        return contractAddress[index];
    }

    function getAssetContractAddress(string memory assetTypeName)
        public
        view
        returns (address)
    {
        bytes32 index = keccak256(abi.encodePacked(assetTypeName));
        return assetContractAdresses[index];
    }
    
    function isContract(address selectedContractAddress)
        public
        view
        returns (bool)
    {
        return contractList[selectedContractAddress];
    }

    function isAssetContract(address assetContractAddress)
        public
        view
        returns (bool)
    {
        return assetContractsList[assetContractAddress];
    }
}
