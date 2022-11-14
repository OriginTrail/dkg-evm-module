// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IHashingFunction } from "./interface/HashingFunction.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract HashingProxy is Ownable {
    // algorithmId => Contract address
    mapping(uint8 => address) functions;

    function callHashingFunction(uint8 hashingFunctionId, bytes memory data)
        public
        returns (bytes32)
    {
        address hashingContractAddress = functions[hashingFunctionId];

        require(hashingContractAddress != address(0), "Hashing function doesn't exist!");

        IHashingFunction hashingFunction = IHashingFunction(hashingContractAddress);
        return hashingFunction.hash(data);
    }

    function getHashingFunctionName(uint8 hashingFunctionId)
        public
        view
        returns (string memory)
    {
        address hashingContractAddress = functions[hashingFunctionId];

        require(hashingContractAddress != address(0), "Hashing function doesn't exist!");

        IHashingFunction hashingFunction = IHashingFunction(hashingContractAddress);
        return hashingFunction.name();
    }

    function setContractAddress(uint8 hashingFunctionId, address hashingContractAddress)
        public
        onlyOwner
    {
        functions[hashingFunctionId] = hashingContractAddress;
    }

}
