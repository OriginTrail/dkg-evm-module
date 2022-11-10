// SPDX-License-Identifier: MIT

pragma solidity^0.8.0;


import { HashingAlgorithm } from "../interface/HashingAlgorithm.sol";

contract SHA256 is HashingAlgorithm {
    function hash(bytes memory data) public pure returns (bytes32) {
        return sha256(data);
    }
}
