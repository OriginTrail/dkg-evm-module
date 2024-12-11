// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

library ProfileLib {
    struct OperatorFee {
        uint8 feePercentage;
        uint248 effectiveDate;
    }

    struct OperatorFees {
        uint72 identityId;
        OperatorFee[] fees;
    }

    struct ProfileInfo {
        bytes nodeId;
        uint96 ask;
        address sharesContractAddress;
        OperatorFee[] operatorFees;
    }

    error IdentityAlreadyExists(uint72 identityId, address wallet);
    error TooManyOperationalWallets(uint16 allowed, uint16 provided);
    error EmptyNodeId();
    error NodeIdAlreadyExists(bytes nodeId);
    error EmptySharesTokenName();
    error EmptySharesTokenSymbol();
    error SharesTokenNameAlreadyExists(string tokenName);
    error SharesTokenSymbolAlreadyExists(string tokenSymbol);
    error OperatorFeeOutOfRange(uint8 operatorFee);
    error ZeroAsk();
    error NoOperatorFees(uint72 identityId);
    error ProfileDoesntExist(uint72 identityId);
    error NoPendingOperatorFee();
}
