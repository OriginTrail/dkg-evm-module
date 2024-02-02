// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

library StakingErrors {
    error ZeroSharesAmount();
    error WithdrawalWasntInitiated();
    error WithdrawalPeriodPending(uint256 nowTimestamp, uint256 endTimestamp);
    error InvalidOperatorFee();
    error OperatorFeeChangeDelayPending(uint256 nowTimestamp, uint256 endTimestamp);
    error MaximumStakeExceeded(uint256 amount);
}
