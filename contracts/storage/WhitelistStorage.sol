// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import {Hub} from "../Hub.sol";
import {Named} from "../interface/Named.sol";
import {Versioned} from "../interface/Versioned.sol";

contract WhitelistStorage is Named, Versioned {
    string private constant _NAME = "WhitelistStorage";
    string private constant _VERSION = "1.0.0";

    Hub public hub;

    bool public whitelistingEnabled;

    mapping(address => bool) public whitelisted;

    constructor(address hubAddress) {
        require(hubAddress != address(0), "Hub Address cannot be 0x0");

        hub = Hub(hubAddress);

        whitelistingEnabled = false;
    }

    modifier onlyHubOwner() {
        _checkHubOwner();
        _;
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

    function _checkHubOwner() internal view virtual {
        require(msg.sender == hub.owner(), "Fn can only be used by hub owner");
    }
}
