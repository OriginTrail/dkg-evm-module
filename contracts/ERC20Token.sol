// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import { Hub } from "./Hub.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract ERC20Token is ERC20, AccessControl, Ownable {

    Hub public hub;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    constructor(address hubAddress) ERC20("TEST TOKEN", "TEST"){
        require(hubAddress != address(0));
        hub = Hub(hubAddress);
    }

    function setupRole(address minter) public onlyOwner {
        _setupRole(MINTER_ROLE, minter);
    }

    function mint(address to, uint256 amount) public {
        require(hasRole(MINTER_ROLE, msg.sender), "Caller is not a minter");

        _mint(to, amount);
    }

}
