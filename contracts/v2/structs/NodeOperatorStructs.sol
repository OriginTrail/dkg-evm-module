// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

library NodeOperatorStructs {
    struct OperatorFee {
        uint8 feePercentage;
        uint248 effectiveDate;
    }

    struct OperatorFees {
        uint72 identityId;
        OperatorFee[] fees;
    }
}
