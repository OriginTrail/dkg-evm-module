// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { HashingProxy } from "../HashingProxy.sol";
import { Hub } from "../Hub.sol";
import { UnorderedIndexableContractDynamicSetLib } from "../utils/UnorderedIndexableContractDynamicSet.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ProfileStorage {

    event ProfileCreated(uint72 indexed identityId, bytes nodeId, uint96 ask);
    event ProfileDeleted(uint72 indexed identityId);
    event AskUpdated(uint72 indexed identityId, bytes nodeId, uint96 ask);
    event SharesContractAddressUpdated(uint72 indexed identityId, bytes nodeId, address sharesContractAddress);

    Hub public hub;
    HashingProxy public hashingProxy;
    IERC20 public tokenContract;

    struct ProfileDefinition{
        bytes nodeId;
        uint96 ask;
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

    function createProfile(uint72 identityId, bytes calldata nodeId, uint96 ask, address sharesContractAddress) external {
        ProfileDefinition storage profile = profiles[identityId];
        profile.nodeId = nodeId;
        profile.ask = ask;
        profile.sharesContractAddress = sharesContractAddress;

        setAvailableNodeAddresses(identityId);

        nodeIdsList[nodeId] = true;

        emit ProfileCreated(identityId, nodeId, ask);
    }

    function getProfile(uint72 identityId) external view returns (uint96, bytes memory, address) {
        ProfileDefinition storage profile = profiles[identityId];
        return (profile.ask, profile.nodeId, profiles.sharesContractAddress);
    }

    function deleteProfile(uint72 identityId) external {
        nodeIdsList[profiles[identityId].nodeId] = false;
        delete profiles[identityId];

        emit ProfileDeleted(identityId);
    }

    function getNodeId(uint72 identityId) external view returns (bytes memory) {
        return profiles[identityId].nodeId;
    }

    function setNodeId(uint72 identityId, bytes calldata nodeId) external onlyContracts {
        ProfileDefinition storage profile = profiles[identityId];

        nodeIdsList[profile.nodeId] = false;
        profile.nodeId = nodeId;

        setAvailableNodeAddresses(identityId);

        nodeIdsList[nodeId] = true;
    }

    function getAsk(uint72 identityId) external view returns (uint96) {
        return profiles[identityId].ask;
    }

    function setAsk(uint72 identityId, uint96 ask) external onlyContracts {
        profiles[identityId].ask = ask;

        emit AskUpdated(identityId, profiles[identityId].nodeId, ask);
    }

    function getSharesContractAddress(uint72 identityId) external view returns (address) {
        return profiles[identityId].sharesContractAddress;
    }

    function setSharesContractAddress(uint72 identityId, address sharesContractAddress) external onlyContracts {
        profiles[identityId].sharesContractAddress = sharesContractAddress;

        emit SharesContractAddressUpdated(identityId, profiles[identityId].nodeId, sharesContractAddress);
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

    function setAvailableNodeAddresses(uint72 identityId) public {
        ProfileDefinition storage profile = profiles[identityId];
        HashingProxy hp = hashingProxy;

        UnorderedIndexableContractDynamicSetLib.Contract[] memory hashFunctions = hp.getAllHashFunctions();
        uint256 hashFunctionsNumber = hashFunctions.length;
        for (uint8 i = 0; i < hashFunctionsNumber; ) {
            profile.nodeAddresses[hashFunctions[i].id] = hp.callHashFunction(hashFunctions[i].id, profile.nodeId);
            unchecked { i++; }
        }
    }

    function profileExists(uint72 identityId) external view onlyContracts returns (bool) {
        return profiles[identityId].ask != 0;
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
