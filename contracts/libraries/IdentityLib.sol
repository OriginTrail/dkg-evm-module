// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

library IdentityLib {
    uint256 public constant ADMIN_KEY = 1;
    uint256 public constant OPERATIONAL_KEY = 2;
    uint256 public constant ECDSA = 1;
    uint256 public constant RSA = 2;

    error WithdrawalWasntInitiated();
    error WithdrawalPeriodPending(uint256 nowTimestamp, uint256 endTimestamp);
    error InvalidOperatorFee();
    error MaximumStakeExceeded(uint256 amount);
}
