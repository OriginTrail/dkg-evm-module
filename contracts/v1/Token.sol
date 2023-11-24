// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Token is Ownable, ERC20, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    // solhint-disable-next-line no-empty-blocks
    constructor(string memory tokenName, string memory tokenSymbol) ERC20(tokenName, tokenSymbol) {}

    function setupRole(address minter) public onlyOwner {
        _setupRole(MINTER_ROLE, minter);
    }

    function mint(address to, uint256 amount) public {
        require(hasRole(MINTER_ROLE, msg.sender), "Caller is not a minter");

        _mint(to, amount);
    }
}
