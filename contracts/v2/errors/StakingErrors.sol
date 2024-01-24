// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

library StakingErrors {
    error ZeroSharesAmount();
    error WithdrawalWasntInitiated();
    error WithdrawalPeriodPending(uint256 endTimestamp);
    error InvalidOperatorFee();
    error MaximumStakeExceeded(uint256 amount);
}
