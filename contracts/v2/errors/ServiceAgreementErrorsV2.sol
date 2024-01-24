// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

library ServiceAgreementErrorsV2 {
    error WrongScoreFunctionId(
        bytes32 agreementId,
        uint16 epoch,
        uint8 agreementScoreFunctionId,
        uint8 expectedScoreFunctionId,
        uint256 timeNow
    );
}
