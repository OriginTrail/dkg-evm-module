// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {UnorderedNamedContractDynamicSetStructs} from "../structs/UnorderedNamedContractDynamicSetStructs.sol";

library UnorderedNamedContractDynamicSetLibV2 {
    function append(
        UnorderedNamedContractDynamicSetStructs.Set storage self,
        string calldata name,
        address addr
    ) internal {
        require(
            keccak256(abi.encodePacked(name)) != keccak256(abi.encodePacked("")),
            "NamedContractSet: Name cannot be empty"
        );
        require(addr != address(0), "NamedContractSet: Address cannot be 0x0");
        require(!exists(self, name), "NamedContractSet: Contract with given name already exists");
        require(
            (self.contractList.length == 0) ||
                ((self.addressIndexPointers[addr] == 0) && (self.contractList[0].addr != addr)),
            "NamedContractSet: Address already in the set"
        );
        self.stringIndexPointers[name] = size(self);
        self.addressIndexPointers[addr] = size(self);
        self.contractList.push(UnorderedNamedContractDynamicSetStructs.Contract(name, addr));
    }

    function update(
        UnorderedNamedContractDynamicSetStructs.Set storage self,
        string calldata name,
        address addr
    ) internal {
        require(addr != address(0), "NamedContractSet: Address cannot be 0x0");
        require(exists(self, name), "NamedContractSet: Contract with given name doesn't exists");
        require(
            (self.contractList.length == 0) ||
                ((self.addressIndexPointers[addr] == 0) && (self.contractList[0].addr != addr)),
            "NamedContractSet: Address already in the set"
        );
        delete self.addressIndexPointers[self.contractList[self.stringIndexPointers[name]].addr];
        self.addressIndexPointers[addr] = self.stringIndexPointers[name];
        self.contractList[self.stringIndexPointers[name]].addr = addr;
    }

    function remove(UnorderedNamedContractDynamicSetStructs.Set storage self, string calldata name) internal {
        require(exists(self, name), "NamedContractSet: Contract with given name doesn't exist");
        uint256 contractToRemoveIndex = self.stringIndexPointers[name];

        delete self.addressIndexPointers[self.contractList[contractToRemoveIndex].addr];

        UnorderedNamedContractDynamicSetStructs.Contract memory contractToMove = self.contractList[size(self) - 1];

        self.stringIndexPointers[contractToMove.name] = contractToRemoveIndex;
        self.addressIndexPointers[contractToMove.addr] = contractToRemoveIndex;
        self.contractList[contractToRemoveIndex] = contractToMove;

        delete self.stringIndexPointers[name];
        self.contractList.pop();
    }

    function remove(UnorderedNamedContractDynamicSetStructs.Set storage self, address addr) internal {
        require(exists(self, addr), "NamedContractSet: Contract with given address doesn't exist");
        uint256 contractToRemoveIndex = self.addressIndexPointers[addr];

        delete self.stringIndexPointers[self.contractList[contractToRemoveIndex].name];

        UnorderedNamedContractDynamicSetStructs.Contract memory contractToMove = self.contractList[size(self) - 1];

        self.stringIndexPointers[contractToMove.name] = contractToRemoveIndex;
        self.addressIndexPointers[contractToMove.addr] = contractToRemoveIndex;
        self.contractList[contractToRemoveIndex] = contractToMove;

        delete self.addressIndexPointers[addr];
        self.contractList.pop();
    }

    function get(
        UnorderedNamedContractDynamicSetStructs.Set storage self,
        string calldata name
    ) internal view returns (UnorderedNamedContractDynamicSetStructs.Contract memory) {
        require(exists(self, name), "NamedContractSet: Contract with given name doesn't exist");
        return self.contractList[self.stringIndexPointers[name]];
    }

    function get(
        UnorderedNamedContractDynamicSetStructs.Set storage self,
        address addr
    ) internal view returns (UnorderedNamedContractDynamicSetStructs.Contract memory) {
        require(exists(self, addr), "NamedContractSet: Contract with given address doesn't exist");
        return self.contractList[self.addressIndexPointers[addr]];
    }

    function get(
        UnorderedNamedContractDynamicSetStructs.Set storage self,
        uint256 index
    ) internal view returns (UnorderedNamedContractDynamicSetStructs.Contract memory) {
        return self.contractList[index];
    }

    function getAll(
        UnorderedNamedContractDynamicSetStructs.Set storage self
    ) internal view returns (UnorderedNamedContractDynamicSetStructs.Contract[] memory) {
        return self.contractList;
    }

    function getIndex(
        UnorderedNamedContractDynamicSetStructs.Set storage self,
        string calldata name
    ) internal view returns (uint256) {
        return self.stringIndexPointers[name];
    }

    function getIndex(
        UnorderedNamedContractDynamicSetStructs.Set storage self,
        address addr
    ) internal view returns (uint256) {
        return self.addressIndexPointers[addr];
    }

    function exists(
        UnorderedNamedContractDynamicSetStructs.Set storage self,
        string calldata name
    ) internal view returns (bool) {
        if (size(self) == 0) {
            return false;
        }
        return
            keccak256(abi.encodePacked(self.contractList[self.stringIndexPointers[name]].name)) ==
            keccak256(abi.encodePacked(name));
    }

    function exists(
        UnorderedNamedContractDynamicSetStructs.Set storage self,
        address addr
    ) internal view returns (bool) {
        if (size(self) == 0) {
            return false;
        }
        return addr == self.contractList[self.addressIndexPointers[addr]].addr;
    }

    function size(UnorderedNamedContractDynamicSetStructs.Set storage self) internal view returns (uint256) {
        return self.contractList.length;
    }
}
