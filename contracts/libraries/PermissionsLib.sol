// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

library PermissionsLib {
    error OnlyHubOwnerFunction(address caller);
    error OnlyHubContractsFunction(address caller);
    error OnlyProfileOperationalWalletFunction(address caller);
    error OnlyProfileAdminFunction(address caller);
    error OnlyProfileAdminOrOperationalAddressesFunction(address caller);
    error OnlyWhitelistedAddressesFunction(address caller);
}
