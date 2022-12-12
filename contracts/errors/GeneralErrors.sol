// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

library GeneralErrors {

    error OnlyHubOwnerFunction(address caller);
    error OnlyHubContractsFunction(address caller);

}
