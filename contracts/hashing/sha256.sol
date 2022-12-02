// SPDX-License-Identifier: MIT

pragma solidity^0.8.0;

import { IHashFunction } from "../interface/IHashFunction.sol";
import { Indexable } from "../interface/Indexable.sol";
import { Named } from "../interface/Named.sol";

contract SHA256 is IHashFunction, Indexable, Named {

    uint8 private constant _ID = 1;
    string private constant _NAME = "sha256";

    function id() external pure virtual override returns (uint8) {
        return _ID;
    }

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function hash(bytes calldata data) external pure returns (bytes32) {
        return sha256(data);
    }

}
