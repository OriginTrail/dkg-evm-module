// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

library ServiceAgreementErrorsV2 {
    error InvalidProximityScoreFunctionsPairId(
        bytes32 agreementId,
        uint16 epoch,
        uint8 agreementScoreFunctionId,
        uint256 timeNow
    );
}
