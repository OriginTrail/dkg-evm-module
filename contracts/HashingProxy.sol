// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IHashFunction } from "./interface/IHashFunction.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract HashingProxy is Ownable {
    event NewHashFunctionContract(uint8 indexed hashFunctionId, address newContractAddress);
    event HashFunctionContractChanged(uint8 indexed hashFunctionId, address newContractAddress);

    // hashFunctionId => Contract address
    mapping(uint8 => address) public functions;

    function callHashFunction(uint8 hashFunctionId, bytes memory data)
        public
        returns (bytes32)
    {
        require(functions[hashFunctionId] != address(0), "Hashing function doesn't exist!");

        IHashFunction hashFunction = IHashFunction(functions[hashFunctionId]);
        return hashFunction.hash(data);
    }

    function getHashFunctionName(uint8 hashFunctionId)
        public
        view
        returns (string memory)
    {
        require(functions[hashFunctionId] != address(0), "Hashing function doesn't exist!");

        IHashFunction hashFunction = IHashFunction(functions[hashFunctionId]);
        return hashFunction.name();
    }

    function setContractAddress(uint8 hashFunctionId, address hashingContractAddress)
        public
        onlyOwner
    {
        require(hashingContractAddress != address(0), "Contract address cannot be empty");

        if (functions[hashFunctionId] != address(0)) {
            emit HashFunctionContractChanged(
                hashFunctionId,
                hashingContractAddress
            );
        } else {
            emit NewHashFunctionContract(hashFunctionId, hashingContractAddress);
        }

        functions[hashFunctionId] = hashingContractAddress;
    }

}
