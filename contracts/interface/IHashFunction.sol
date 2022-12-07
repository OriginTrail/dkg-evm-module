// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

interface IHashFunction {

    function hash(bytes calldata data) external pure returns (bytes32);

}
