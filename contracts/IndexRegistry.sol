// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./AssertionRegistry.sol";
import "./UAIRegistry.sol";
import "./Hub.sol";

contract IndexRegistry is Ownable {
    Hub public hub;

    struct IndexRecord {
        uint256 timestamp;
        uint256 holdingTimeInYears;
        uint256 indexStake;
        bytes32 assertionId;
    }

    mapping(uint256 => mapping(string => IndexRecord)) public indexRecords;

    uint256 _numberOfEpochs;
    uint256 _epochValidityInBlocks;
    uint256 _blockTime;
    uint256 _numberOfHolders;

    // events
    event IndexCreated(uint256 indexed UAI, string indexed keyword, bytes32 stateCommitHash);
    event IndexUpdated(uint256 indexed UAI, string indexed keyword, bytes32 stateCommitHash);

    constructor(address hubAddress) {
        require(hubAddress != address(0));
        hub = Hub(hubAddress);
    }

    function createIndex(uint256 UAI, string [] memory keywords, bytes32 assertionId, uint256 size, uint256 holdingTimeInYears, uint256 tokenAmount) public  {
        require(assertionId != 0, "assertionId cannot be zero");

        IERC20 tokenContract = IERC20(hub.getContractAddress("Token"));
        require(tokenContract.allowance(msg.sender, address(this)) >= tokenAmount, "Sender allowance must be equal to or higher than chosen amount");
        require(tokenContract.balanceOf(msg.sender) >= tokenAmount, "Sender balance must be equal to or higher than chosen amount!");

        address owner = UAIRegistry(hub.getContractAddress("UAIRegistry")).ownerOf(UAI);
        require(owner == msg.sender, "Only owner can add an index");

        // TODO introduce old holding contract?
        if (AssertionRegistry(hub.getContractAddress("AssertionRegistry")).getTimestamp(assertionId) == 0) {
            AssertionRegistry(hub.getContractAddress("AssertionRegistry")).createAssertionRecord(assertionId, msg.sender, size, 1);
        }
        tokenContract.transferFrom(msg.sender, address(this), tokenAmount);

        for (uint i = 0; i < keywords.length; i++) {
            string memory keyword = keywords[i];
            indexRecords[UAI][keyword].indexStake += tokenAmount / keywords.length;

            indexRecords[UAI][keyword].assertionId = assertionId;
            indexRecords[UAI][keyword].holdingTimeInYears = holdingTimeInYears;
            indexRecords[UAI][keyword].timestamp = block.timestamp;

            emit IndexCreated(UAI, keyword, assertionId);
        }
    }

    function updateIndex(uint256 UAI, string [] memory keywords, bytes32 assertionId, uint256 size, uint256 tokenAmount) public {
        require(assertionId != 0, "assertionId cannot be zero");

        address owner = UAIRegistry(hub.getContractAddress("UAIRegistry")).ownerOf(UAI);
        require(owner == msg.sender, "Only owner can update an index");

        if (AssertionRegistry(hub.getContractAddress("AssertionRegistry")).getTimestamp(assertionId) == 0) {
            AssertionRegistry(hub.getContractAddress("AssertionRegistry")).createAssertionRecord(assertionId, msg.sender, size, 1);
        }
        IERC20 tokenContract = IERC20(hub.getContractAddress("Token"));
        tokenContract.transferFrom(msg.sender, address(this), tokenAmount);

        for (uint i = 0; i < keywords.length; i++) {
            string memory keyword = keywords[i];
            require(indexRecords[UAI][keyword].timestamp > 0, "Cannot update index that doesn't exist");
            indexRecords[UAI][keyword].indexStake += tokenAmount / keywords.length;

            indexRecords[UAI][keyword].assertionId = assertionId;
            indexRecords[UAI][keyword].timestamp = block.timestamp;

            emit IndexUpdated(UAI, keyword, assertionId);
        }
    }

    function getCommitHash(uint256 UAI, string memory keyword) public view returns (bytes32 commitHash){
        return indexRecords[UAI][keyword].assertionId;
    }
}