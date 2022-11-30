// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { Hub } from "./Hub.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC20Burnable } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

contract Shares is ERC20, ERC20Burnable {

    Hub public hub;

    modifier onlyContracts(){
        require(
            hub.isContract(msg.sender),
            "Function can only be called by contracts!"
        );
        _;
    }

    constructor(uint256 initialSupply, address hubAddress, string memory name, string memory symbol)
        ERC20(name, symbol)
    {
        require(hubAddress != address(0));
        hub = Hub(hubAddress);

        _mint(msg.sender, initialSupply);
    }

    function mint(address to, uint256 amount)
        public
        onlyContracts
    {
        _mint(to, amount);
    }
}
