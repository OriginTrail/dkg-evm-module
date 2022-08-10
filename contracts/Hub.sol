// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

contract Hub is Ownable{
    mapping(bytes32 => address) contractAddress;
    mapping(address => bool) contractList;

    event ContractsChanged();

    function setContractAddress(string memory contractName, address newContractAddress)
    public onlyOwner {
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

    function getContractAddress(string memory contractName)  public view returns(address selectedContractAddress) {
        bytes32 index = keccak256(abi.encodePacked(contractName));
        return contractAddress[index];
    }
    
    function isContract(address selectedContractAddress) public view returns (bool) {
        return contractList[selectedContractAddress];
    }
}

