// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { HashingAlgorithm } from "./interface/HashingAlgorithm.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";


contract HashingHub is Ownable {
    // algorithmId => Contract address
    mapping(uint8 => address) algorithms;

    function callHashingFunction(uint8 hashingAlgorithmId, bytes memory data)
        public
        returns (bytes32)
    {
        HashingAlgorithm hashingAlgorithm = HashingAlgorithm(algorithms[hashingAlgorithmId]);
        return hashingAlgorithm.hash(data);
    }

    function setContractAddress(uint8 hashingAlgorithmId, address hashingContractAddress)
        public
        onlyOwner
    {
        algorithms[hashingAlgorithmId] = hashingContractAddress;
    }

}
