// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { MerkleProof } from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import { AssertionRegistry } from "./AssertionRegistry.sol";
import { UAIRegistry } from "./UAIRegistry.sol";
import { Hub } from "./Hub.sol";
import { Identity } from "./Identity.sol";
import { ProfileStorage } from "./storage/ProfileStorage.sol";


contract AssetRegistry is Ownable {
    Hub public hub;

    struct AssetRecord {
        uint256 timestamp;
        bytes32 [] assertions;
        uint256 [] epochs;
        uint256 [] holderCount;
    }

    mapping(uint256 => AssetRecord) public assetRecords;

    event AssetCreated(uint256 indexed UAI, bytes32 indexed stateCommitHash);
    event AssetUpdated(uint256 indexed UAI, bytes32 indexed stateCommitHash);

    constructor(address hubAddress)
    {
        require(hubAddress != address(0));
        hub = Hub(hubAddress);
    }

    function createAsset(bytes32 assertionId, uint256 size, uint256 visibility, uint256 tokenAmount)
        public
        returns (uint256 _UAI)
    {
        require(assertionId != 0, "assertionId cannot be zero");

        IERC20 tokenContract = IERC20(hub.getContractAddress("Token"));
        require(tokenContract.allowance(msg.sender, address(this)) >= tokenAmount, "Sender allowance must be equal to or higher than chosen amount");
        require(tokenContract.balanceOf(msg.sender) >= tokenAmount, "Sender balance must be equal to or higher than chosen amount!");

        // TODO ERC 1155?
        uint256 UAI = UAIRegistry(hub.getContractAddress("UAIRegistry")).mintUAI(msg.sender);
        require(assetRecords[UAI].timestamp == 0, "UAI already exists!");

        AssertionRegistry assertionRegistry = AssertionRegistry(hub.getContractAddress("AssertionRegistry"));
        if (assertionRegistry.getTimestamp(assertionId) == 0) {
            assertionRegistry.createAssertionRecord(assertionId, msg.sender, size, visibility);
        }
        tokenContract.transferFrom(msg.sender, address(this), tokenAmount);

        assetRecords[UAI].assertions.push(assertionId);
        assetRecords[UAI].timestamp = block.timestamp;

        emit AssetCreated(UAI, assertionId);

        return UAI;
    }

    function updateAsset(uint256 UAI, bytes32 assertionId, uint256 size, uint256 visibility, uint256 tokenAmount)
        public
    {
        require(assertionId != 0, "assertionId cannot be zero");

        address owner = UAIRegistry(hub.getContractAddress("UAIRegistry")).ownerOf(UAI);
        require(owner == msg.sender, "Only owner can update an asset");

        AssertionRegistry assertionRegistry = AssertionRegistry(hub.getContractAddress("AssertionRegistry"));
        if (assertionRegistry.getTimestamp(assertionId) == 0) {
            assertionRegistry.createAssertionRecord(assertionId, msg.sender, size, visibility);
        }

        IERC20 tokenContract = IERC20(hub.getContractAddress("Token"));
        tokenContract.transferFrom(msg.sender, address(this), tokenAmount);

        assetRecords[UAI].assertions.push(assertionId);

        emit AssetUpdated(UAI, assertionId);
    }

    function getCommitHash(uint256 UAI, uint256 offset)
        public
        view
        returns (bytes32 commitHash)
    {
        require(assetRecords[UAI].assertions.length > offset, "Offset is invalid");
        return assetRecords[UAI].assertions[assetRecords[UAI].assertions.length - 1 - offset];
    }

    function getAssetOwner(uint256 UAI)
        public
        view
        returns (address owner)
    {
        return UAIRegistry(hub.getContractAddress("UAIRegistry")).ownerOf(UAI);
    }

    function getAssetTimestamp(uint256 UAI)
        public
        view
        returns (uint256 timestamp)
    {
        return assetRecords[UAI].timestamp;
    }
}
