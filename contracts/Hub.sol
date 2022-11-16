// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract Hub is Ownable{
    event NewContract(string indexed contractName, address newContractAddress);
    event ContractChanged(string indexed contractName, address newContractAddress);
    event NewAssetContract(string indexed contractName, address newContractAddress);
    event AssetContractChanged(string indexed contractName, address newContractAddress);

    mapping(bytes32 => address) contractAddress;
    mapping(address => bool) contractList;

    mapping(bytes32 => address) assetContractAdresses;
    mapping(address => bool) assetContractsList;

    function setContractAddress(string memory contractName, address newContractAddress)
        public
        onlyOwner
    {
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

    function setAssetContractAddress(string memory assetContractName, address newContractAddress)
        public
        onlyOwner
    {
        require(newContractAddress != address(0), "Contract address cannot be empty");

        bytes32 index = keccak256(abi.encodePacked(assetContractName));

        if(assetContractAdresses[index] != address(0)) {
            address oldContractAddress = assetContractAdresses[index];
            assetContractsList[oldContractAddress] = false;

            emit AssetContractChanged(assetContractName, newContractAddress);
        } else {
            emit NewAssetContract(assetContractName, newContractAddress);
        }

        assetContractAdresses[index] = newContractAddress;
        assetContractsList[newContractAddress] = true;
    }

    function getContractAddress(string memory contractName)
        public
        view
        returns (address)
    {
        bytes32 index = keccak256(abi.encodePacked(contractName));
        return contractAddress[index];
    }

    function getAssetContractAddress(string memory assetContractName)
        public
        view
        returns (address)
    {
        bytes32 index = keccak256(abi.encodePacked(assetContractName));
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
