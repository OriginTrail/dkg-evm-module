// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IHashingFunction } from "./interface/HashingFunction.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract HashingProxy is Ownable {
    event NewHashingFunctionContract(uint8 indexed hashingFunctionId, address newContractAddress);
    event HashingFunctionContractChanged(uint8 indexed hashingFunctionId, address newContractAddress);

    // hashingFunctionId => Contract address
    mapping(uint8 => address) public functions;

    function callHashingFunction(uint8 hashingFunctionId, bytes memory data)
        public
        returns (bytes32)
    {
        require(functions[hashingFunctionId] != address(0), "Hashing function doesn't exist!");

        IHashingFunction hashingFunction = IHashingFunction(functions[hashingFunctionId]);
        return hashingFunction.hash(data);
    }

    function getHashingFunctionName(uint8 hashingFunctionId)
        public
        view
        returns (string memory)
    {
        require(functions[hashingFunctionId] != address(0), "Hashing function doesn't exist!");

        IHashingFunction hashingFunction = IHashingFunction(functions[hashingFunctionId]);
        return hashingFunction.name();
    }

    function setContractAddress(uint8 hashingFunctionId, address hashingContractAddress)
        public
        onlyOwner
    {
        require(hashingContractAddress != address(0), "Contract address cannot be empty");

        if (functions[hashingFunctionId] != address(0)) {
            emit HashingFunctionContractChanged(
                hashingFunctionId,
                hashingContractAddress
            );
        } else {
            emit NewHashingFunctionContract(hashingFunctionId, hashingContractAddress);
        }

        functions[hashingFunctionId] = hashingContractAddress;
    }

}
