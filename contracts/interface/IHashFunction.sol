// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IHashFunction {

    function hash(bytes calldata data) external returns (bytes32);

}
