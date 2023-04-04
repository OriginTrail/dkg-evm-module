// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {Hub} from "./Hub.sol";
import {ICustodian} from "./interface/ICustodian.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Guardian {
    event TokenTransferred(address indexed custodian, uint256 amount);
    event MisplacedOTPWithdrawn(address indexed custodian, uint256 amount);
    event MisplacedTokensWithdrawn(address indexed custodian, address tokenContract, uint256 amount);

    Hub public hub;
    IERC20 public tokenContract;

    constructor(address hubAddress) {
        require(hubAddress != address(0), "Hub Address cannot be 0x0");

        hub = Hub(hubAddress);
        initialize();
    }

    modifier onlyHubOwner() {
        _checkHubOwner();
        _;
    }

    function initialize() public onlyHubOwner {
        tokenContract = IERC20(hub.getContractAddress("Token"));
    }

    function transferTokens(address payable custodian) external onlyHubOwner {
        require(custodian != address(0x0), "Custodian cannot be a zero address");
        uint contractSize;
        assembly {
            contractSize := extcodesize(custodian)
        }
        require(contractSize > 0, "Cannot transfer tokens to custodian that is not a contract!");

        ICustodian custodianContract = ICustodian(custodian);
        bool hasOwnersFunction = false;
        try custodianContract.getOwners() returns (address[] memory owners) {
            hasOwnersFunction = true;
            require(owners.length > 0, "Cannot transfer tokens to custodian without owners defined!");
        } catch {}
        require(hasOwnersFunction, "Cannot transfer tokens to custodian without getOwners function!");

        uint256 balanceTransferred = tokenContract.balanceOf(address(this));
        bool transactionResult = tokenContract.transfer(custodian, balanceTransferred);
        require(transactionResult, "Token transaction execution failed!");

        emit TokenTransferred(custodian, balanceTransferred);
    }

    function withdrawMisplacedOTP() external onlyHubOwner {
        uint256 balance = address(this).balance;
        if (balance > 0) {
            (bool success, ) = msg.sender.call{value: balance}("");
            require(success, "Transfer failed.");
        }
        emit MisplacedOTPWithdrawn(msg.sender, balance);
    }

    function withdrawMisplacedTokens(address tokenContractAddress) external onlyHubOwner {
        require(tokenContractAddress != address(tokenContract), "Cannot use this function with the TRAC contract");
        IERC20 misplacedTokensContract = IERC20(tokenContractAddress);

        uint256 balance = misplacedTokensContract.balanceOf(address(this));
        if (balance > 0) {
            bool transactionResult = misplacedTokensContract.transfer(msg.sender, balance);
            require(transactionResult, "Token transaction execution failed");
        }
        emit MisplacedTokensWithdrawn(msg.sender, tokenContractAddress, balance);
    }

    function _checkHubOwner() internal view virtual {
        require(msg.sender == hub.owner(), "Fn can only be used by hub owner");
    }
}
