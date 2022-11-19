// SPDX-License-Identifier: MIT

pragma solidity^0.8.0;

import { IHashFunction } from "../interface/IHashFunction.sol";

contract SHA256 is IHashFunction {
    string private _name;

    constructor() {
        _name = "sha256";
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
