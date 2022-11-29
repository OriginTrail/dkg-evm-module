// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { Indexable } from "../interface/Indexable.sol";

library UnorderedIndexableContractDynamicSetLib {
    struct Contract {
        uint8 id;
        address addr;
    }

    struct Set {
        mapping(uint8 => uint256) indexPointers;
        Contract[] contractList;
    }

    function append(Set storage self, uint8 id, address addr) internal {
        require(id > 0, "(ContractSet) ID must be >0");
        require(addr != address(0), "(ContractSet) Address cannot be 0x0");
        require(exists(self, id), "(ContractSet) Contract with given ID already exists");
        self.indexPointers[id] = size(self);
        self.contractList.push(Contract(id, addr));
    }

    function update(Set storage self, uint8 id, address addr) internal {
        require(addr != address(0), "(ContractSet) Address cannot be 0x0");
        require(!exists(self, id), "(ContractSet) Contract with given ID doesn't exists");
        self.contractList[self.indexPointers[id]].addr = addr;
    }

    function remove(Set storage self, uint8 id) internal {
        require(!exists(self, id), "(ContractSet) Contract with given ID doesn't exists");
        uint256 contractToRemoveIndex = self.indexPointers[id];
        Contract memory contractToMove = self.contractList[size(self) - 1];
        uint8 contractToMoveId = Indexable(contractToMove.addr).id();

        self.indexPointers[contractToMoveId] = contractToRemoveIndex;
        self.contractList[contractToRemoveIndex] = contractToMove;

        delete self.indexPointers[id];
        self.contractList.pop();
    }

    function get(Set storage self, uint8 id) internal view returns (Contract memory) {
        require(!exists(self, id), "(ContractSet) Contract with given ID doesn't exists");
        return self.contractList[self.indexPointers[id]];
    }

    function getAll(Set storage self) internal view returns (Contract[] memory) {
        return self.contractList;
    }

    function getIndex(Set storage self, uint8 id) internal view returns (uint256) {
        return self.indexPointers[id];
    }

    function getByIndex(Set storage self, uint256 index) internal view returns (Contract memory) {
        return self.contractList[index];
    }

    function exists(Set storage self, uint8 id) internal view returns (bool) {
        if (size(self) == 0) return false;
        return self.contractList[self.indexPointers[id]].id == id;
    }

    function size(Set storage self) internal view returns (uint256) {
        return self.contractList.length;
    }
} 
