// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {HubDependent} from "./abstract/HubDependent.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

contract Shares is
    HubDependent,
    ERC20,
    ERC20Burnable // ok
{
    constructor(
        address hubAddress,
        string memory name,
        string memory symbol
    )
        HubDependent(hubAddress)
        ERC20(name, symbol) // solhint-disable-next-line no-empty-blocks
    {}

    function mint(address to, uint256 amount) external onlyContracts {
        _mint(to, amount);
    }
}
