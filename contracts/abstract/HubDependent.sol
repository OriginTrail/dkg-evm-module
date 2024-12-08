// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {Hub} from "../Hub.sol";

abstract contract HubDependent {
    Hub public hub;

    constructor(address hubAddress) {
        require(hubAddress != address(0), "Hub Address cannot be 0x0");

        hub = Hub(hubAddress);
    }

    modifier onlyHub() {
        _checkHub();
        _;
    }

    modifier onlyContracts() {
        _checkHubContract();
        _;
    }

    function _checkHub() internal view virtual {
        require(msg.sender == address(hub), "Fn can only be used by hub owner");
    }

    function _checkHubContract() internal view virtual {
        require(hub.isContract(msg.sender), "Fn can only be called by the hub");
    }
}
