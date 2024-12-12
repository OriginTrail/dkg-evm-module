// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.16;

library IdentityLib {
    uint256 constant ADMIN_KEY = 1;
    uint256 constant OPERATIONAL_KEY = 2;
    uint256 constant ECDSA = 1;
    uint256 constant RSA = 2;

    error ZeroSharesAmount();
    error WithdrawalWasntInitiated();
    error WithdrawalPeriodPending(uint256 nowTimestamp, uint256 endTimestamp);
    error InvalidOperatorFee();
    error MaximumStakeExceeded(uint256 amount);
}
