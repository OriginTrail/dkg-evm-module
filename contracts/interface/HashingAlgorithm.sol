// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;


interface HashingAlgorithm {
    function hash(bytes memory data) external returns (bytes32);
}
