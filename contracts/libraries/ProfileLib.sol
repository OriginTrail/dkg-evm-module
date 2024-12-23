// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

library ProfileLib {
    struct OperatorFee {
        uint8 feePercentage;
        uint256 effectiveDate;
    }

    struct ProfileInfo {
        string name;
        bytes nodeId;
        uint96 ask;
        OperatorFee[] operatorFees;
    }

    error IdentityAlreadyExists(uint72 identityId, address wallet);
    error TooManyOperationalWallets(uint16 allowed, uint16 provided);
    error EmptyNodeId();
    error NodeIdAlreadyExists(bytes nodeId);
    error OperatorFeeOutOfRange(uint8 operatorFee);
    error ZeroAsk();
    error AskUpdateOnCooldown(uint72 identityId, uint256 cooldownEnd);
    error NoOperatorFees(uint72 identityId);
    error ProfileDoesntExist(uint72 identityId);
    error NoPendingNodeAsk();
    error NoPendingOperatorFee();
    error InvalidOperatorFee();
}
