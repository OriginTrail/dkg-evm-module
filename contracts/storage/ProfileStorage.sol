// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import { HashingProxy } from "../HashingProxy.sol";
import { Hub } from "../Hub.sol";
import { Named } from "../interface/Named.sol";
import { Versioned } from "../interface/Versioned.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ProfileStorage is Named, Versioned {

    string constant private _NAME = "ProfileStorage";
    string constant private _VERSION = "1.0.0";

    Hub public hub;
    HashingProxy public hashingProxy;
    IERC20 public tokenContract;

    struct ProfileDefinition{
        bytes nodeId;
        uint96 ask;
        uint96 accumulatedOperatorFee;
        uint96 accumulatedOperatorFeeWithdrawalAmount;
        uint256 operatorFeeWithdrawalTimestamp;
        address sharesContractAddress;
        mapping(uint8 => bytes32) nodeAddresses;
    }

    // nodeId => isRegistered?
    mapping(bytes => bool) public nodeIdsList;
    // identityId => Profile
    mapping(uint72 => ProfileDefinition) profiles;

    constructor(address hubAddress) {
        require(hubAddress != address(0));

        hub = Hub(hubAddress);
        hashingProxy = HashingProxy(hub.getContractAddress("HashingProxy"));
        tokenContract = IERC20(hub.getContractAddress("Token"));
    }

    modifier onlyContracts() {
        _checkHub();
        _;
    }

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function createProfile(uint72 identityId, bytes calldata nodeId, address sharesContractAddress)
        external
        onlyContracts
    {
        ProfileDefinition storage profile = profiles[identityId];
        profile.nodeId = nodeId;
        profile.sharesContractAddress = sharesContractAddress;

        nodeIdsList[nodeId] = true;
    }

    function getProfile(uint72 identityId) external view returns (bytes memory, uint96[2] memory, address) {
        ProfileDefinition storage profile = profiles[identityId];
        return (profile.nodeId, [profile.ask, profile.accumulatedOperatorFee], profile.sharesContractAddress);
    }

    function deleteProfile(uint72 identityId) external onlyContracts {
        nodeIdsList[profiles[identityId].nodeId] = false;
        delete profiles[identityId];
    }

    function getNodeId(uint72 identityId) external view returns (bytes memory) {
        return profiles[identityId].nodeId;
    }

    function setNodeId(uint72 identityId, bytes calldata nodeId) external onlyContracts {
        ProfileDefinition storage profile = profiles[identityId];

        nodeIdsList[profile.nodeId] = false;
        profile.nodeId = nodeId;
        nodeIdsList[nodeId] = true;
    }

    function getAsk(uint72 identityId) external view returns (uint96) {
        return profiles[identityId].ask;
    }

    function setAsk(uint72 identityId, uint96 ask) external onlyContracts {
        profiles[identityId].ask = ask;
    }

    function getAccumulatedOperatorFee(uint72 identityId) external view returns (uint96) {
        return profiles[identityId].accumulatedOperatorFee;
    }

    function setAccumulatedOperatorFee(uint72 identityId, uint96 newOperatorFeeAmount) external onlyContracts {
        profiles[identityId].accumulatedOperatorFee = newOperatorFeeAmount;
    }

    function getAccumulatedOperatorFeeWithdrawalAmount(uint72 identityId) external view returns (uint96) {
        return profiles[identityId].accumulatedOperatorFeeWithdrawalAmount;
    }

    function setAccumulatedOperatorFeeWithdrawalAmount(uint72 identityId, uint96 accumulatedOperatorFeeWithdrawalAmount) external onlyContracts {
        profiles[identityId].accumulatedOperatorFeeWithdrawalAmount = accumulatedOperatorFeeWithdrawalAmount;
    }

    function getAccumulatedOperatorFeeWithdrawalTimestamp(uint72 identityId) external view returns (uint256) {
        return profiles[identityId].operatorFeeWithdrawalTimestamp;
    }

    function setAccumulatedOperatorFeeWithdrawalTimestamp(uint72 identityId, uint256 operatorFeeWithdrawalTimestamp) external onlyContracts {
        profiles[identityId].operatorFeeWithdrawalTimestamp = operatorFeeWithdrawalTimestamp;
    }

    function getSharesContractAddress(uint72 identityId) external view returns (address) {
        return profiles[identityId].sharesContractAddress;
    }

    function setSharesContractAddress(uint72 identityId, address sharesContractAddress) external onlyContracts {
        profiles[identityId].sharesContractAddress = sharesContractAddress;
    }

    function getNodeAddress(uint72 identityId, uint8 hashFunctionId) external view returns (bytes32) {
        return profiles[identityId].nodeAddresses[hashFunctionId];
    }

    function setNodeAddress(uint72 identityId, uint8 hashFunctionId) external onlyContracts {
        profiles[identityId].nodeAddresses[hashFunctionId] = hashingProxy.callHashFunction(
            hashFunctionId,
            profiles[identityId].nodeId
        );
    }

    function profileExists(uint72 identityId) external view onlyContracts returns (bool) {
        return keccak256(profiles[identityId].nodeId) != keccak256(bytes(""));
    }

    function nodeIdRegistered(bytes calldata nodeId) external view returns (bool) {
        return nodeIdsList[nodeId];
    }

    function transferTokens(address receiver, uint96 amount) external onlyContracts {
        tokenContract.transfer(receiver, amount);
    }

    function _checkHub() internal view virtual {
        require(hub.isContract(msg.sender), "Fn can only be called by the hub");
    }
}
