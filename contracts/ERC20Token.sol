// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import {Hub} from "./Hub.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ERC20Token is ERC20, AccessControl {
    Hub public hub;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    constructor(address hubAddress) ERC20("TEST TOKEN", "TEST") {
        require(hubAddress != address(0), "Hub Address cannot be 0x0");

        hub = Hub(hubAddress);
    }

    modifier onlyHubOwner() {
        _checkHubOwner();
        _;
    }

    function setupRole(address minter) public onlyHubOwner {
        _setupRole(MINTER_ROLE, minter);
    }

    function mint(address to, uint256 amount) public {
        require(hasRole(MINTER_ROLE, msg.sender), "Caller is not a minter");

        _mint(to, amount);
    }

    function _checkHubOwner() internal view virtual {
        require(msg.sender == hub.owner(), "Fn can only be used by hub owner");
    }
}
