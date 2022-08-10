// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v4.6.0) (token/ERC721/ERC721.sol)

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./Hub.sol";

/**
 * @dev Implementation of https://eips.ethereum.org/EIPS/eip-721[ERC721] Non-Fungible Token Standard, including
 * the Metadata extension, but not including the Enumerable extension, which is available separately as
 * {ERC721Enumerable}.
 */
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
