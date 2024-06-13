// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {HubDependentV2} from "./HubDependent.sol";

abstract contract ContractStatusV2 is HubDependentV2 {
    bool public status;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) HubDependentV2(hubAddress) {}

    function setStatus(bool _status) external onlyHubOwner {
        status = _status;
    }
}
