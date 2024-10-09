// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

library GeneralErrors {
    error OnlyHubOwnerFunction(address caller);
    error OnlyHubContractsFunction(address caller);
    error OnlyProfileOperationalWalletFunction(address caller);
    error OnlyProfileAdminFunction(address caller);
    error OnlyProfileAdminOrOperationalAddressesFunction(address caller);
    error OnlyWhitelistedAddressesFunction(address caller);
}
