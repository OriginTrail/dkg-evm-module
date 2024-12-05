// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

library TokenLib {
    error TooLowAllowance(address tokenAddress, uint256 amount);
    error TooLowBalance(address tokenAddress, uint256 amount);
}
