// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { HashingProxy } from "../HashingProxy.sol";
import { Hub } from "../Hub.sol";
import { Identity } from "../Identity.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ProfileStorage {
    event AskUpdated(uint72 indexed identityId, bytes nodeId, uint96 ask);
    event StakeUpdated(uint72 indexed identityId, bytes nodeId, uint96 stake);
    event RewardUpdated(uint72 indexed identityId, bytes nodeId, uint96 reward);

    Hub public hub;

    struct ProfileDefinition{
        uint96 ask;
        uint96 stake;
        uint96 reward;
        uint96 stakeWithdrawalAmount;
        uint96 rewardWithdrawalAmount;
        uint96 frozenAmount;  // TODO: Slashing mechanism
        uint256 stakeWithdrawalTimestamp;
        uint256 rewardWithdrawalTimestamp;
        uint256 freezeTimestamp;  // TODO: Slashing mechanism
        bytes nodeId;
        mapping(uint8 => bytes32) nodeAddresses;
    }

    // nodeId => isRegistered?
    mapping(bytes => bool) public nodeIdsList;
    // identityId => Profile
    mapping(uint72 => ProfileDefinition) profiles;

    constructor(address hubAddress) {
        require(hubAddress != address(0));
        hub = Hub(hubAddress);
    }

    modifier onlyContracts() {
        require(hub.isContract(msg.sender),
        "Function can only be called by contracts!");
        _;
    }

    function createProfile(
        address operationalWallet,
        address adminWallet,
        bytes memory nodeId,
        uint96 initialAsk,
        uint96 initialStake
    )
        public
        onlyContracts
        returns (uint72)
    {
        Identity identity = Identity(hub.getContractAddress("Identity"));

        require(identity.getIdentityId(operationalWallet) == 0, "Profile already exists");
        require(!nodeIdsList[nodeId], "Node ID connected with another profile");
        require(nodeId.length != 0, "Node ID can't be empty");
        require(initialAsk > 0, "Ask can't be 0");

        uint72 identityId = identity.createIdentity(operationalWallet, adminWallet);

        ProfileDefinition storage profile = profiles[identityId];
        profile.ask = initialAsk;
        profile.stake = initialStake;
        profile.nodeId = nodeId;
        setNodeAddress(identityId, 0);  // TODO: Add setters for all existing hashing functions

        nodeIdsList[nodeId] = true;

        return identityId;
    }

    /* ----------------GETTERS------------------ */
    function getProfile(uint72 identityId)
        public
        view
        returns (uint96[6] memory, uint256[3] memory, bytes memory)
    {
        ProfileDefinition storage profile = profiles[identityId];

        return (
            [
                profile.ask,
                profile.stake,
                profile.reward,
                profile.stakeWithdrawalAmount,
                profile.rewardWithdrawalAmount,
                profile.frozenAmount
            ],
            [profile.stakeWithdrawalTimestamp, profile.rewardWithdrawalTimestamp, profile.freezeTimestamp],
            profile.nodeId
        );
    }

    function getAsk(uint72 identityId)
        public
        view
        returns (uint96)
    {
        return profiles[identityId].ask;
    }

    function getStake(uint72 identityId)
        public
        view
        returns (uint96)
    {
        return profiles[identityId].stake;
    }

    function getReward(uint72 identityId)
        public
        view
        returns (uint96)
    {
        return profiles[identityId].reward;
    }

    function getStakeWithdrawalAmount(uint72 identityId)
        public
        view
        returns (uint96)
    {
        return profiles[identityId].stakeWithdrawalAmount;
    }

    function getRewardWithdrawalAmount(uint72 identityId)
        public
        view
        returns (uint96)
    {
        return profiles[identityId].rewardWithdrawalAmount;
    }

    function getFrozenAmount(uint72 identityId)
        public
        view
        returns (uint96)
    {
        return profiles[identityId].frozenAmount;
    }

    function getStakeWithdrawalTimestamp(uint72 identityId)
        public
        view
        returns (uint256)
    {
        return profiles[identityId].stakeWithdrawalTimestamp;
    }

    function getRewardWithdrawalTimestamp(uint72 identityId)
        public
        view
        returns (uint256)
    {
        return profiles[identityId].rewardWithdrawalTimestamp;
    }

    function getFreezeTimestamp(uint72 identityId)
        public
        view
        returns (uint256)
    {
        return profiles[identityId].freezeTimestamp;
    }

    function getNodeId(uint72 identityId)
        public
        view
        returns (bytes memory)
    {
        return profiles[identityId].nodeId;
    }

    function getNodeAddress(uint72 identityId, uint8 hashFunctionId)
        public
        view
        returns (bytes32)
    {
        return profiles[identityId].nodeAddresses[hashFunctionId];
    }

    /* ----------------SETTERS------------------ */
    function setAsk(uint72 identityId, uint96 ask)
        public
        onlyContracts
    {
        require(ask > 0, "Ask cannot be 0.");

        profiles[identityId].ask = ask;

        emit AskUpdated(identityId, getNodeId(identityId), ask);
    }

    function setStake(uint72 identityId, uint96 stake)
        public
        onlyContracts
    {
        profiles[identityId].stake = stake;

        emit StakeUpdated(identityId, getNodeId(identityId), stake);
    }

    function setReward(uint72 identityId, uint96 reward)
        public
        onlyContracts
    {
        profiles[identityId].reward = reward;

        emit RewardUpdated(identityId, getNodeId(identityId), reward);
    }

    function setStakeWithdrawalAmount(uint72 identityId, uint96 stakeWithdrawalAmount)
        public
        onlyContracts
    {
        profiles[identityId].stakeWithdrawalAmount = stakeWithdrawalAmount;
    }

    function setRewardWithdrawalAmount(uint72 identityId, uint96 rewardWithdrawalAmount)
        public
        onlyContracts
    {
        profiles[identityId].rewardWithdrawalAmount = rewardWithdrawalAmount;
    }

    function setFrozenAmount(uint72 identityId, uint96 frozenAmount)
        public
        onlyContracts
    {
        profiles[identityId].frozenAmount = frozenAmount;
    }

    function setStakeWithdrawalTimestamp(uint72 identityId, uint256 stakeWithdrawalTimestamp)
        public
        onlyContracts
    {
        profiles[identityId].stakeWithdrawalTimestamp = stakeWithdrawalTimestamp;
    }

    function setRewardWithdrawalTimestamp(uint72 identityId, uint256 rewardWithdrawalTimestamp)
        public
        onlyContracts
    {
        profiles[identityId].rewardWithdrawalTimestamp = rewardWithdrawalTimestamp;
    }

    function setFreezeTimestamp(uint72 identityId, uint256 freezeTimestamp)
        public
        onlyContracts
    {
        profiles[identityId].freezeTimestamp = freezeTimestamp;
    }

    function setNodeId(uint72 identityId, bytes memory nodeId)
        public
        onlyContracts
    {
        require(nodeId.length != 0, "Node ID can't be empty");

        profiles[identityId].nodeId = nodeId;

        nodeIdsList[profiles[identityId].nodeId] = false;
        nodeIdsList[nodeId] = true;
    }

    function setNodeAddress(uint72 identityId, uint8 hashFunctionId)
        public
        onlyContracts
    {
        HashingProxy hashingProxy = HashingProxy(hub.getContractAddress("HashingProxy"));
        profiles[identityId].nodeAddresses[hashFunctionId] = hashingProxy.callHashFunction(
            hashFunctionId,
            profiles[identityId].nodeId
        );
    }

    function transferTokens(address receiver, uint96 amount)
        public
        onlyContracts
    {
        require(receiver != address(0), "Receiver address can't be empty");

        IERC20 tokenContract = IERC20(hub.getContractAddress("Token"));
        tokenContract.transfer(receiver, amount);
    }
}
