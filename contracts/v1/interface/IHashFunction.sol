// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

interface IHashFunction {
    function hash(bytes calldata data) external pure returns (bytes32);
}
