// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { ParametersStorage } from "./storage/ParametersStorage.sol";
import {ProfileStorage} from "./storage/ProfileStorage.sol";
import {ShardingTable} from "./ShardingTable.sol";
import {Ownable, Hub} from "./Hub.sol";
import {Identity, ERC734} from "./Identity.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";


contract Profile {
    Hub public hub;

    uint256 public withdrawalTime = 5 minutes;

    constructor(address hubAddress) {
        require(hubAddress != address(0));
        hub = Hub(hubAddress);
    }

    modifier onlyHolding() {
        require(
            msg.sender == hub.getContractAddress("Holding"),
            "Function can only be called by Holding contract!"
        );
        _;
    }

    modifier onlyHubOwner() {
        require (
            msg.sender == hub.owner(),
            "Function can only be called by hub owner!"
        );
        _;
    }

    event ProfileCreated(address profile, uint256 initialBalance);
    event IdentityCreated(address profile, address newIdentity);
    event IdentityTransferred(bytes nodeId, address oldIdentity, address newIdentity);
    event TokenDeposit(address profile, uint256 amount);

    event TokensDeposited(address profile, uint256 amountDeposited, uint256 newBalance);
    event TokensReserved(address profile, uint256 amountReserved);

    event WithdrawalInitiated(address profile, uint256 amount, uint256 withdrawalDelayInSeconds);
    event TokenWithdrawalCancelled(address profile);
    event TokensWithdrawn(address profile, uint256 amountWithdrawn, uint256 newBalance);

    event TokensReleased(address profile, uint256 amount);
    event TokensTransferred(address sender, address receiver, uint256 amount);

    function createProfile(address managementWallet, bytes memory nodeId, uint256 initialAsk, uint256 initialBalance, address identity) public {
        require(managementWallet != address(0), "Management wallet can't be 0");
        require(identity != address(0), "Identity can't be 0");
        ERC20 tokenContract = ERC20(hub.getContractAddress("Token"));
        require(tokenContract.allowance(msg.sender, address(this)) >= initialBalance, "Sender allowance must be equal to or higher than initial balance");
        require(tokenContract.balanceOf(msg.sender) >= initialBalance, "Sender balance must be equal to or higher than initial balance!");
        require(nodeId.length != 0, "Cannot create a profile without a nodeId submitted");

        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        ShardingTable shardingTable = ShardingTable(hub.getContractAddress("ShardingTable"));

        tokenContract.transferFrom(msg.sender, hub.getContractAddress("ProfileStorage"), initialBalance);
        require(ERC734(identity).keyHasPurpose(keccak256(abi.encodePacked(msg.sender)), 2),  "Sender does not have action permission for identity!");

        profileStorage.setStake(identity, initialBalance);
        profileStorage.setAsk(identity, initialAsk);
        profileStorage.setNodeId(identity, nodeId);

        ParametersStorage parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));
        if (initialBalance >= parametersStorage.minimalStake()) {
            shardingTable.pushBack(identity);
        }

        emit ProfileCreated(identity, initialBalance);
    }

    function depositTokens(address identity, uint256 amount) public {
        require(ERC734(identity).keyHasPurpose(keccak256(abi.encodePacked(msg.sender)), 1),  "Sender does not have management permission for identity!");

        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        ERC20 tokenContract = ERC20(hub.getContractAddress("Token"));
        require(tokenContract.allowance(msg.sender, address(profileStorage)) >= amount, "Sender allowance must be equal to or higher than chosen amount");
        require(tokenContract.balanceOf(msg.sender) >= amount, "Sender balance must be equal to or higher than chosen amount!");

        tokenContract.transferFrom(msg.sender, address(profileStorage), amount);

        uint256 oldStake = profileStorage.getStake(identity);
        uint256 newStake = oldStake + amount;
        profileStorage.setStake(identity, newStake);

        ParametersStorage parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));
        uint96 minimalStake = parametersStorage.minimalStake();
        if (oldStake < minimalStake && newStake >= minimalStake) {
            ShardingTable shardingTable = ShardingTable(hub.getContractAddress("ShardingTable"));
            shardingTable.pushBack(identity);
        }

        emit TokensDeposited(identity, amount, profileStorage.getStake(identity));
    }

    function startTokenWithdrawal(address identity, uint256 amount) public {
        require(ERC734(identity).keyHasPurpose(keccak256(abi.encodePacked(msg.sender)), 1),  "Sender does not have management permission for identity!");

        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        require(profileStorage.getWithdrawalPending(identity) == false, "Withrdrawal process already pending!");

        uint256 availableBalance = profileStorage.getStake(identity) - (profileStorage.getStakeReserved(identity));

        profileStorage.setWithdrawalPending(identity, true);
        profileStorage.setWithdrawalTimestamp(identity, block.timestamp + withdrawalTime);
        if(availableBalance >= amount) {
            // Reserve chosen token amount
            profileStorage.setWithdrawalAmount(identity, amount);
            emit WithdrawalInitiated(identity, amount, withdrawalTime);
        }
        else {
            // Reserve only the available balance
            profileStorage.setWithdrawalAmount(identity, availableBalance);
            emit WithdrawalInitiated(identity, availableBalance, withdrawalTime);
        }
    }

    function withdrawTokens(address identity) public {
        // Verify sender
        require(ERC734(identity).keyHasPurpose(keccak256(abi.encodePacked(msg.sender)), 1),  "Sender does not have management permission for identity!");

        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        require(profileStorage.getWithdrawalPending(identity) == true, "Cannot withdraw tokens before starting token withdrawal!");
        require(profileStorage.getWithdrawalTimestamp(identity) < block.timestamp, "Cannot withdraw tokens before withdrawal timestamp!");

        // Transfer already reserved tokens to user identity
        profileStorage.transferTokens(msg.sender, profileStorage.getWithdrawalAmount(identity));

        uint256 oldStake = profileStorage.getStake(identity);
        uint256 newStake = oldStake - profileStorage.getWithdrawalAmount(identity);

        profileStorage.setStake(identity, newStake);
        profileStorage.setWithdrawalPending(identity, false);

        ParametersStorage parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));
        uint96 minimalStake = parametersStorage.minimalStake();
        if (oldStake >= minimalStake && newStake < minimalStake) {
            ShardingTable shardingTable = ShardingTable(hub.getContractAddress("ShardingTable"));
            shardingTable.removeNode(identity);
        }

        emit TokensWithdrawn(
            identity,
            profileStorage.getWithdrawalAmount(identity),
            profileStorage.getStake(identity)
        );
    }

    function releaseTokens(address profile, uint256 amount)
    public onlyHolding {
        require(profile!=address(0));
        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        require(profileStorage.getStakeReserved(profile) >= amount, "Cannot release more tokens than there are reserved");

        profileStorage.setStakeReserved(profile, profileStorage.getStakeReserved(profile) - (amount));

        emit TokensReleased(profile, amount);
    }

    function transferTokens(address sender, address receiver, uint256 amount)
    public onlyHolding {
        require(sender!=address(0) && receiver!=address(0));
        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        require(profileStorage.getStake(sender) >= amount, "Sender does not have enough tokens to transfer!");
        require(profileStorage.getStakeReserved(sender) >= amount, "Sender does not have enough tokens reserved to transfer!");

        profileStorage.setStakeReserved(sender, profileStorage.getStakeReserved(sender) - (amount));
        profileStorage.setStake(sender, profileStorage.getStake(sender) - (amount));
        profileStorage.setStake(receiver, profileStorage.getStake(receiver) + (amount));

        emit TokensTransferred(sender, receiver, amount);
    }

    function setWithdrawalTime(uint256 newWithdrawalTime)
        public
        onlyHubOwner
    {
        if(withdrawalTime != newWithdrawalTime) withdrawalTime = newWithdrawalTime;
    }
}
