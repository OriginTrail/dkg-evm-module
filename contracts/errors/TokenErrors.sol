// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

library TokenErrors {
    error TooLowAllowance(uint256 amount);
    error TooLowBalance(uint256 amount);
}
