// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { Named } from "../interface/Named.sol";

library UnorderedNamedContractDynamicSetLib {

    struct Contract {
        string name;
        address addr;
    }

    struct Set {
        mapping(string => uint256) indexPointers;
        Contract[] contractList;
    }

    function append(Set storage self, string calldata name, address addr) internal {
        require(
            keccak256(abi.encodePacked(name)) != keccak256(abi.encodePacked("")),
            "(NamedContractSet) Name cannot be empty"
        );
        require(addr != address(0), "(NamedContractSet) Address cannot be 0x0");
        require(!exists(self, name), "(NamedContractSet) Contract with given name already exists");
        self.indexPointers[name] = size(self);
        self.contractList.push(Contract(name, addr));
    }

    function update(Set storage self, string calldata name, address addr) internal {
        require(addr != address(0), "(NamedContractSet) Address cannot be 0x0");
        require(exists(self, name), "(NamedContractSet) Contract with given name doesn't exists");
        self.contractList[self.indexPointers[name]].addr = addr;
    }

    function remove(Set storage self, string calldata name) internal {
        require(exists(self, name), "(NamedContractSet) Contract with given name doesn't exists");
        uint256 contractToRemoveIndex = self.indexPointers[name];
        Contract memory contractToMove = self.contractList[size(self) - 1];
        string memory contractToMoveName = Named(contractToMove.addr).name();

        self.indexPointers[contractToMoveName] = contractToRemoveIndex;
        self.contractList[contractToRemoveIndex] = contractToMove;

        delete self.indexPointers[name];
        self.contractList.pop();
    }

    function get(Set storage self, string calldata name) internal view returns (Contract memory) {
        require(exists(self, name), "(NamedContractSet) Contract with given name doesn't exists");
        return self.contractList[self.indexPointers[name]];
    }

    function getAll(Set storage self) internal view returns (Contract[] memory) {
        return self.contractList;
    }

    function getIndex(Set storage self, string calldata name) internal view returns (uint256) {
        return self.indexPointers[name];
    }

    function getByIndex(Set storage self, uint256 index) internal view returns (Contract memory) {
        return self.contractList[index];
    }

    function exists(Set storage self, string calldata name) internal view returns (bool) {
        if (size(self) == 0) return false;
        return keccak256(
            abi.encodePacked(self.contractList[self.indexPointers[name]].name)
        ) == keccak256(abi.encodePacked(name));
    }

    function exists(Set storage self, address addr) internal view returns (bool) {
        if (size(self) == 0) return false;
        string memory name = Named(addr).name();
        return keccak256(
            abi.encodePacked(self.contractList[self.indexPointers[name]].name)
        ) == keccak256(abi.encodePacked(name)); 
    }

    function size(Set storage self) internal view returns (uint256) {
        return self.contractList.length;
    }

} 
