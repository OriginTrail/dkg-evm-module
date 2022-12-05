// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import { Hub } from "../Hub.sol";
import { Named } from "../interface/Named.sol";
import { Versioned } from "../interface/Versioned.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract WhitelistStorage is Named, Versioned, Ownable {

    string constant private _NAME = "WhitelistStorage";
    string constant private _VERSION = "1.0.0";

    Hub public hub;

    bool public whitelistingEnabled;

    mapping(address => bool) public whitelisted;

    constructor(address hubAddress) {
        require(hubAddress != address(0));

        hub = Hub(hubAddress);

        whitelistingEnabled = true;
    }

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function whitelistAddress(address addr) external onlyOwner {
        whitelisted[addr] = true;
    }

    function blacklistAddress(address addr) external onlyOwner {
        whitelisted[addr] = false;
    }

    function enableWhitelist() external onlyOwner {
        whitelistingEnabled = true;
    }

    function disableWhitelist() external onlyOwner {
        whitelistingEnabled = false;
    }

}
