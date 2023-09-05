// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {IdentityStorage} from "./storage/IdentityStorage.sol";
import {HubDependent} from "./abstract/HubDependent.sol";
import {ADMIN_KEY} from "./constants/IdentityConstants.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract SharesPoolToken is HubDependent, ERC20 {
    IdentityStorage public identityStorage;

    uint72 public poolAdminIdentityId;

    constructor(
        address hubAddress,
        uint72 identityId,
        string memory name,
        string memory symbol
    ) HubDependent(hubAddress) ERC20(name, symbol) {
        identityStorage = IdentityStorage(hub.getContractAddress("IdentityStorage"));
        poolAdminIdentityId = identityId;
    }

    modifier onlyPoolAdmin() {
        _checkPoolAdmin();
        _;
    }

    function poolMint(uint256 amount) external onlyContracts {
        _mint(address(this), amount);
    }

    function mint(address to, uint256 amount) external onlyContracts {
        _mint(to, amount);
    }

    function poolBurn(uint256 amount) external onlyContracts {
        _burn(address(this), amount);
    }

    function burn(address from, uint256 amount) external onlyContracts {
        _burn(from, amount);
    }

    function balanceOfPool() external view returns (uint256) {
        return balanceOf(address(this));
    }

    function poolTransfer(address to, uint256 amount) external onlyPoolAdmin returns (bool) {
        _transfer(address(this), to, amount);
        return true;
    }

    function increasePoolAllowance(address spender, uint256 addedValue) external onlyPoolAdmin returns (bool) {
        address pool = address(this);
        _approve(pool, spender, allowance(pool, spender) + addedValue);
        return true;
    }

    function decreasePoolAllowance(address spender, uint256 subtractedValue) external onlyPoolAdmin returns (bool) {
        address pool = address(this);
        uint256 currentAllowance = allowance(pool, spender);
        // solhint-disable-next-line reason-string
        require(currentAllowance >= subtractedValue, "ERC20: decreased allowance below zero");
        unchecked {
            _approve(pool, spender, currentAllowance - subtractedValue);
        }

        return true;
    }

    function _checkPoolAdmin() internal view virtual {
        require(
            identityStorage.keyHasPurpose(poolAdminIdentityId, keccak256(abi.encodePacked(msg.sender)), ADMIN_KEY),
            "Admin function"
        );
    }
}
