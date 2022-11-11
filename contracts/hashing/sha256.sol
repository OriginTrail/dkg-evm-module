// SPDX-License-Identifier: MIT

pragma solidity^0.8.0;


import { IHashingFunction } from "../interface/HashingFunction.sol";

contract SHA256 is IHashingFunction {
    string private _name;

    constructor(string memory name_) {
        _name = name_;
    }

    function name()
        public
        view
        virtual
        override
        returns (string memory)
    {
        return _name;
    }

    function hash(bytes memory data)
        public
        pure
        returns (bytes32)
    {
        return sha256(data);
    }
}
