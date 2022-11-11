// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC734 } from "../interface/ERC734.sol";
import { HashingHub } from "../HashingHub.sol";
import { Hub } from "../Hub.sol";


contract ProfileStorage {
    event AskUpdated(bytes nodeId, uint96 ask);
    event StakeUpdated(bytes nodeId, uint96 stake);
    event RewardUpdated(bytes nodeId, uint96 reward);

    Hub public hub;

    struct ProfileDefinition{
        uint96 ask;
        uint96 stake;
        uint96 reward;
        uint96 stakeReserved;
        uint96 withdrawalAmount;
        bool withdrawalPending;
        uint256 withdrawalTimestamp;
        bytes nodeId;
        mapping(uint8 => bytes32) hashedNodeIds;
    }

    uint96 lastIdentityId;

    // operational/management wallet => identityId
    mapping(address => uint96) public identityIds;
    // identityId => identity contract address
    mapping(uint96 => address) public identityContractAddresses;

    mapping(uint96 => ProfileDefinition) public profiles;

    constructor(address hubAddress) {
        require(hubAddress != address(0));
        hub = Hub(hubAddress);

        lastIdentityId = 1;
    }

    modifier onlyContracts(){
        require(hub.isContract(msg.sender),
        "Function can only be called by contracts!");
        _;
    }

    /* ----------------GETTERS------------------ */
    function getAsk(uint96 identityId)
        public
        view
        returns (uint96)
    {
        return profiles[identityId].ask;
    }

    function getStake(uint96 identityId) 
        public
        view
        returns (uint96)
    {
        return profiles[identityId].stake;
    }

    function getReward(uint96 identityId)
        public
        view
        returns (uint96)
    {
        return profiles[identityId].reward;
    }

    function getStakeReserved(uint96 identityId) 
        public
        view
        returns (uint96)
    {
        return profiles[identityId].stakeReserved;
    }

    function getWithdrawalAmount(uint96 identityId) 
        public
        view
        returns (uint96)
    {
        return profiles[identityId].withdrawalAmount;
    }

    function getWithdrawalPending(uint96 identityId) 
        public
        view
        returns (bool)
    {
        return profiles[identityId].withdrawalPending;
    }

    function getWithdrawalTimestamp(uint96 identityId) 
        public
        view
        returns (uint256)
    {
        return profiles[identityId].withdrawalTimestamp;
    }

    function getNodeId(uint96 identityId) 
        public
        view
        returns (bytes memory)
    {
        return profiles[identityId].nodeId;
    }

    function getHashedNodeId(uint96 identityId, uint8 hashingAlgorithm)
        public
        view
        returns (bytes32)
    {
        return profiles[identityId].hashedNodeIds[hashingAlgorithm];
    }

    /* ----------------SETTERS------------------ */
    function setAsk(uint96 identityId, uint96 ask)
        public
        onlyContracts
    {
        profiles[identityId].ask = ask;

        emit AskUpdated(this.getNodeId(identityId), ask);
    }
    
    function setStake(uint96 identityId, uint96 stake)
        public
        onlyContracts
    {
        profiles[identityId].stake = stake;

        emit StakeUpdated(this.getNodeId(identityId), stake);
    }

    function setReward(uint96 identityId, uint96 reward)
        public
        onlyContracts
    {
        profiles[identityId].reward = reward;

        emit RewardUpdated(this.getNodeId(identityId), reward);
    }

    function setStakeReserved(uint96 identityId, uint96 stakeReserved) 
        public
        onlyContracts
    {
        profiles[identityId].stakeReserved = stakeReserved;
    }

    function setWithdrawalAmount(uint96 identityId, uint96 withdrawalAmount) 
        public
        onlyContracts
    {
        profiles[identityId].withdrawalAmount = withdrawalAmount;
    }

    function setWithdrawalPending(uint96 identityId, bool withdrawalPending) 
        public
        onlyContracts
    {
        profiles[identityId].withdrawalPending = withdrawalPending;
    }

    function setWithdrawalTimestamp(uint96 identityId, uint256 withdrawalTimestamp) 
        public
        onlyContracts
    {
        profiles[identityId].withdrawalTimestamp = withdrawalTimestamp;
    }

    function setIdentity(address sender, address identityContractAddress)
        public
        onlyContracts
    {
        identityIds[sender] = lastIdentityId;
        identityContractAddresses[lastIdentityId] = identityContractAddress;
        lastIdentityId++;
    }

    function attachWalletToIdentity(address sender, address newWallet)
        public
        onlyContracts
    {
        identityIds[newWallet] = identityIds[sender];
    }

    function setNodeId(uint96 identityId, bytes memory nodeId)
        public
        onlyContracts
    {
        profiles[identityId].nodeId = nodeId;
    }

    function setHashedNodeId(uint96 identityId, uint8 hashingAlgorithm)
        public
        onlyContract
    {
        HashingHub hashingHub = HashingHub(hub.getContractAddress("HashingHub"));
        profiles[identityId].hashedNodeIds[hashingAlgorithm] = hashingHub.callHashingFunction(
            hashingAlgorithm,
            profiles[identityId].nodeId
        );
    }

    function transferTokens(address wallet, uint256 amount)
    public onlyContracts {
        ERC20 token = ERC20(hub.getContractAddress("Token"));
        token.transfer(wallet, amount);
    }
}
