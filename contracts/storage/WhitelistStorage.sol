// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {HubDependent} from "../abstract/HubDependent.sol";
import {INamed} from "../interfaces/INamed.sol";
import {IVersioned} from "../interfaces/IVersioned.sol";

contract WhitelistStorage is INamed, IVersioned, HubDependent {
    string private constant _NAME = "WhitelistStorage";
    string private constant _VERSION = "1.0.0";

    bool public whitelistingEnabled;

    mapping(address => bool) public whitelisted;

    constructor(address hubAddress) HubDependent(hubAddress) {
        whitelistingEnabled = false;
    }

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function whitelistAddress(address addr) external onlyHubOwner {
        whitelisted[addr] = true;
    }

    function blacklistAddress(address addr) external onlyHubOwner {
        whitelisted[addr] = false;
    }

    function enableWhitelist() external onlyHubOwner {
        whitelistingEnabled = true;
    }

    function disableWhitelist() external onlyHubOwner {
        whitelistingEnabled = false;
    }
}
