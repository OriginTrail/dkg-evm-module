// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import {Hub} from "./Hub.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

contract Shares is ERC20, ERC20Burnable {
    Hub public hub;

    modifier onlyContracts() {
        _checkHub();
        _;
    }

    constructor(address hubAddress, string memory name, string memory symbol) ERC20(name, symbol) {
        require(hubAddress != address(0), "Hub Address cannot be 0x0");

        hub = Hub(hubAddress);
    }

    function mint(address to, uint256 amount) external onlyContracts {
        _mint(to, amount);
    }

    function _checkHub() internal view virtual {
        require(hub.isContract(msg.sender), "Fn can only be called by the hub");
    }
}
