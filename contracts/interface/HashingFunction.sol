// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IHashingFunction {
    function hash(bytes memory data) external returns (bytes32);
    function name() external view returns (string memory);
}
