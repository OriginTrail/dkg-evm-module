// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

library UnorderedNamedContractDynamicSetLib {
    struct Contract {
        string name;
        address addr;
    }

    struct Set {
        mapping(string => uint256) stringIndexPointers;
        mapping(address => uint256) addressIndexPointers;
        Contract[] contractList;
    }

    function append(Set storage self, string calldata name, address addr) internal {
        require(
            keccak256(abi.encodePacked(name)) != keccak256(abi.encodePacked("")),
            "NamedContractSet: Name cannot be empty"
        );
        require(addr != address(0), "NamedContractSet: Address cannot be 0x0");
        require(!exists(self, name), "NamedContractSet: Contract with given name already exists");
        self.stringIndexPointers[name] = size(self);
        self.addressIndexPointers[addr] = size(self);
        self.contractList.push(Contract(name, addr));
    }

    function update(Set storage self, string calldata name, address addr) internal {
        require(addr != address(0), "NamedContractSet: Address cannot be 0x0");
        require(exists(self, name), "NamedContractSet: Contract with given name doesn't exists");
        delete self.addressIndexPointers[self.contractList[self.stringIndexPointers[name]].addr];
        self.addressIndexPointers[addr] = self.stringIndexPointers[name];
        self.contractList[self.stringIndexPointers[name]].addr = addr;
    }

    function remove(Set storage self, string calldata name) internal {
        require(exists(self, name), "NamedContractSet: Contract with given name doesn't exist");
        uint256 contractToRemoveIndex = self.stringIndexPointers[name];

        delete self.addressIndexPointers[self.contractList[contractToRemoveIndex].addr];

        Contract memory contractToMove = self.contractList[size(self) - 1];

        self.stringIndexPointers[contractToMove.name] = contractToRemoveIndex;
        self.addressIndexPointers[contractToMove.addr] = contractToRemoveIndex;
        self.contractList[contractToRemoveIndex] = contractToMove;

        delete self.stringIndexPointers[name];
        self.contractList.pop();
    }

    function remove(Set storage self, address addr) internal {
        require(exists(self, addr), "NamedContractSet: Contract with given address doesn't exist");
        uint256 contractToRemoveIndex = self.addressIndexPointers[addr];

        delete self.stringIndexPointers[self.contractList[contractToRemoveIndex].name];

        Contract memory contractToMove = self.contractList[size(self) - 1];

        self.stringIndexPointers[contractToMove.name] = contractToRemoveIndex;
        self.addressIndexPointers[contractToMove.addr] = contractToRemoveIndex;
        self.contractList[contractToRemoveIndex] = contractToMove;

        delete self.addressIndexPointers[addr];
        self.contractList.pop();
    }

    function get(Set storage self, string calldata name) internal view returns (Contract memory) {
        require(exists(self, name), "NamedContractSet: Contract with given name doesn't exist");
        return self.contractList[self.stringIndexPointers[name]];
    }

    function get(Set storage self, address addr) internal view returns (Contract memory) {
        require(exists(self, addr), "NamedContractSet: Contract with given address doesn't exist");
        return self.contractList[self.addressIndexPointers[addr]];
    }

    function get(Set storage self, uint256 index) internal view returns (Contract memory) {
        return self.contractList[index];
    }

    function getAll(Set storage self) internal view returns (Contract[] memory) {
        return self.contractList;
    }

    function getIndex(Set storage self, string calldata name) internal view returns (uint256) {
        return self.stringIndexPointers[name];
    }

    function getIndex(Set storage self, address addr) internal view returns (uint256) {
        return self.addressIndexPointers[addr];
    }

    function exists(Set storage self, string calldata name) internal view returns (bool) {
        if (size(self) == 0) return false;
        return
            keccak256(abi.encodePacked(self.contractList[self.stringIndexPointers[name]].name)) ==
            keccak256(abi.encodePacked(name));
    }

    function exists(Set storage self, address addr) internal view returns (bool) {
        if (size(self) == 0) return false;
        return addr == self.contractList[self.addressIndexPointers[addr]].addr;
    }

    function size(Set storage self) internal view returns (uint256) {
        return self.contractList.length;
    }
}
