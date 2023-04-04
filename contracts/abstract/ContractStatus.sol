// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {HubDependent} from "./HubDependent.sol";

abstract contract ContractStatus is HubDependent {
    bool public status;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) HubDependent(hubAddress) {}

    function setStatus(bool _status) external onlyHubOwner {
        status = _status;
    }
}
