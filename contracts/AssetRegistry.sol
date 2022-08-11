// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "./AssertionRegistry.sol";
import "./UAIRegistry.sol";
import "./Hub.sol";
import "./Identity.sol";
import "./storage/ProfileStorage.sol";

// TODO linked assertions
// TODO storages
// TODO contributions
// TODO challenges

contract AssetRegistry is Ownable {
    Hub public hub;

    struct AssetRecord {
        uint256 timestamp;
        uint256 holdingTimeInYears;
        uint256 assetStake;
        bytes32 [] assertions;

        uint256 [] epochs;
        uint256 priceLimit;
        bytes32 [][] holderIds;
        uint256 [][] holderDistances;
        uint256 [][] holderPrices;
        uint256 [] holderCount;
    }

    mapping(uint256 => AssetRecord) public assetRecords;
    mapping(bytes32 => uint256) public assetStake;

    mapping(bytes1 => uint) bytesLookup;

    uint256 _numberOfEpochs;
    uint256 _epochValidityInBlocks;
    uint256 _blockTime;
    uint256 _numberOfHolders;

    // events
    event AssetCreated(uint256 indexed UAI, bytes32 indexed stateCommitHash);
    event AssetUpdated(uint256 indexed UAI, bytes32 indexed stateCommitHash);
    event TokensDepositedToAsset(bytes32 indexed UAI, uint256 indexed amount, address indexed depositor);

    constructor(address hubAddress) {
        require(hubAddress != address(0));
        hub = Hub(hubAddress);

        bytesLookup[0x00] = 0;
        bytesLookup[0x01] = 1;
        bytesLookup[0x02] = 1;
        bytesLookup[0x03] = 2;
        bytesLookup[0x04] = 1;
        bytesLookup[0x05] = 2;
        bytesLookup[0x06] = 2;
        bytesLookup[0x07] = 3;
        bytesLookup[0x08] = 1;
        bytesLookup[0x09] = 2;
        bytesLookup[0x0a] = 2;
        bytesLookup[0x0b] = 3;
        bytesLookup[0x0c] = 2;
        bytesLookup[0x0d] = 3;
        bytesLookup[0x0e] = 3;
        bytesLookup[0x0f] = 4;

        _numberOfEpochs = 5;
        _blockTime = 12;
        _numberOfHolders = 3;
        _epochValidityInBlocks = 20;
    }

    function createAsset(bytes32 assertionId, uint256 size, uint256 visibility, uint256 holdingTimeInYears, uint256 tokenAmount) public returns (uint256 _UAI) {
        require(assertionId != 0, "assertionId cannot be zero");

        IERC20 tokenContract = IERC20(hub.getContractAddress("Token"));
        require(tokenContract.allowance(msg.sender, address(this)) >= tokenAmount, "Sender allowance must be equal to or higher than chosen amount");
        require(tokenContract.balanceOf(msg.sender) >= tokenAmount, "Sender balance must be equal to or higher than chosen amount!");

        // TODO ERC 1155?
        uint256 UAI = UAIRegistry(hub.getContractAddress("UAIRegistry")).mintUAI(msg.sender);
        require(assetRecords[UAI].timestamp == 0, "UAI already exists!");

        // TODO introduce old holding contract?
        if (AssertionRegistry(hub.getContractAddress("AssertionRegistry")).getTimestamp(assertionId) == 0) {
            AssertionRegistry(hub.getContractAddress("AssertionRegistry")).createAssertionRecord(assertionId, msg.sender, size, visibility);
        }
        tokenContract.transferFrom(msg.sender, address(this), tokenAmount);
        assetRecords[UAI].assetStake += tokenAmount;

        assetRecords[UAI].assertions.push(assertionId);
        assetRecords[UAI].holdingTimeInYears = holdingTimeInYears;
        assetRecords[UAI].timestamp = block.timestamp;

        assetRecords[UAI].epochs = generateEpochs(block.number, _numberOfEpochs, _blockTime, holdingTimeInYears);
        assetRecords[UAI].priceLimit = tokenAmount / _numberOfEpochs / _numberOfHolders;

        assetRecords[UAI].holderIds = new bytes32[][](5);
        assetRecords[UAI].holderDistances = new uint256[][](5);
        assetRecords[UAI].holderPrices = new uint256[][](5);
        assetRecords[UAI].holderCount = new uint256[](5);
        for (uint i = 0; i < 5; i++) {
            assetRecords[UAI].holderIds[i] = new bytes32[](3);
            assetRecords[UAI].holderDistances[i] = new uint256[](3);
            assetRecords[UAI].holderPrices[i] = new uint256[](3);
            assetRecords[UAI].holderCount[i] = 0;
        }

        emit AssetCreated(UAI, assertionId);

        return UAI;
    }

    function updateAsset(uint256 UAI, bytes32 assertionId, uint256 size, uint256 visibility, uint256 tokenAmount) public {
        require(assertionId != 0, "assertionId cannot be zero");

        address owner = UAIRegistry(hub.getContractAddress("UAIRegistry")).ownerOf(UAI);
        require(owner == msg.sender, "Only owner can update an asset");

        if (AssertionRegistry(hub.getContractAddress("AssertionRegistry")).getTimestamp(assertionId) == 0) {
            AssertionRegistry(hub.getContractAddress("AssertionRegistry")).createAssertionRecord(assertionId, msg.sender, size, visibility);
        }

        IERC20 tokenContract = IERC20(hub.getContractAddress("Token"));
        tokenContract.transferFrom(msg.sender, address(this), tokenAmount);
        assetRecords[UAI].assetStake += tokenAmount;

        assetRecords[UAI].assertions.push(assertionId);

        emit AssetUpdated(UAI, assertionId);
    }


    function generateEpochs(uint blockNumber, uint256 numberOfEpochs, uint256 blockTime, uint256 holdingTimeInYears) public pure returns (uint256 [] memory) {
        uint256 [] memory epochs = new uint256[](numberOfEpochs + 1);
        for (uint i = 0; i < numberOfEpochs + 1; i++) {
            epochs[i] = blockNumber + i * holdingTimeInYears * 365 * 24 * 60 * 60 / blockTime / numberOfEpochs;
        }

        return epochs;
    }

    //    function getEpochs(uint256 UAI) public view returns (uint256 [] memory) {
    //        return assetRecords[UAI].epochs;
    //    }
    //
    //    function getEpoch(uint256 UAI) public view returns (uint) {
    //        uint i;
    //        require(block.number >= assetRecords[UAI].epochs[0] && block.number <= assetRecords[UAI].epochs[assetRecords[UAI].epochs.length - 1], "UAI has expired.");
    //        for (i = 1; i < assetRecords[UAI].epochs.length - 1; i++) {
    //            if (block.number < assetRecords[UAI].epochs[i]) {
    //                return i - 1;
    //            }
    //        }
    //
    //        return i - 1;
    //    }
    //
    //    function getEpoch(uint256 UAI, uint256 blockNumber) public view returns (uint256) {
    //        uint i;
    //        require(block.number >= assetRecords[UAI].epochs[0] && block.number <= assetRecords[UAI].epochs[assetRecords[UAI].epochs.length - 1], "UAI has expired.");
    //        for (i = 1; i < assetRecords[UAI].epochs.length - 1; i++) {
    //            if (blockNumber < assetRecords[UAI].epochs[i]) {
    //                return i - 1;
    //            }
    //        }
    //
    //        return i - 1;
    //    }
    //
    //    function isEpochActive(uint256 UAI, uint256 epoch) public view returns (bool) {
    //        if (assetRecords[UAI].epochs.length - 1 > epoch) {
    //            if (assetRecords[UAI].epochs[epoch] <= block.number && assetRecords[UAI].epochs[epoch] + _epochValidityInBlocks >= block.number) {
    //                return true;
    //            }
    //        }
    //        return false;
    //    }
    //
    //    function hammingDistance(bytes32 x, bytes32 y) public view returns (uint) {
    //        bytes32 xor = x ^ y;
    //        uint distance = 0;
    //        for (uint i = 0; i < xor.length; i++) {
    //            distance += bytesLookup[xor[i] >> 4];
    //            distance += bytesLookup[(xor[i] << 4) >> 4];
    //        }
    //
    //        return distance;
    //    }
    //
    //    function getChallenge(uint256 UAI, uint256 blockNumber, address identity) public view returns (uint256) {
    ////        require(ERC734(identity).keyHasPurpose(keccak256(abi.encodePacked(msg.sender)), 2), "Sender does not have action permission for identity!");
    //        uint256 epoch = getEpoch(UAI, blockNumber);
    //        bool isActive = isEpochActive(UAI, epoch);
    //
    //        if (isActive) {
    //            return calculateChallenge(UAI, blockNumber, identity);
    //        } else {
    //            return 0;
    //        }
    //    }
    //
    //    function calculateChallenge(uint256 UAI, uint256 blockNumber, address identity) public view returns (uint256) {
    //        return uint256(sha256(abi.encodePacked(blockhash(blockNumber), identity))) % assetRecords[UAI].size;
    //    }
    //
    //
    //    function getContributionRank(uint256 UAI, uint256 epoch, address identity) public view returns (uint256) {
    //        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
    //        bytes32 nodeId = profileStorage.getNodeId(identity);
    //        uint256 distance = hammingDistance(nodeId, sha256(abi.encodePacked(UAI)));
    //        uint i;
    //        for (i = 0; i < assetRecords[UAI].holderCount[epoch]; i++) {
    //            if (assetRecords[UAI].holderDistances[epoch][i] > distance)
    //            {
    //                return i;
    //            }
    //        }
    //        return i;
    //    }
    //
    //    function getContributors(uint256 UAI) public view returns (bytes32 [][] memory, uint256[][] memory, uint256[][] memory, uint256 [] memory) {
    //        return (assetRecords[UAI].holderIds, assetRecords[UAI].holderDistances, assetRecords[UAI].holderPrices, assetRecords[UAI].holderCount);
    //    }
    //
    //
    //    function addContributor(uint256 UAI, uint256 epoch, uint rank, uint256 price, address identity) internal {
    //        uint256 length = assetRecords[UAI].holderCount[epoch];
    //        for (uint i = length; i >= rank + 1; i--) {
    //            if (i == 3) {
    //                continue;
    //            }
    //            assetRecords[UAI].holderIds[epoch][i] = assetRecords[UAI].holderIds[epoch][i - 1];
    //            assetRecords[UAI].holderDistances[epoch][i] = assetRecords[UAI].holderDistances[epoch][i - 1];
    //            assetRecords[UAI].holderPrices[epoch][i] = assetRecords[UAI].holderPrices[epoch][i - 1];
    //        }
    //
    //        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
    //        bytes32 nodeId = profileStorage.getNodeId(identity);
    //
    //        assetRecords[UAI].holderIds[epoch][rank] = nodeId;
    //        assetRecords[UAI].holderDistances[epoch][rank] = hammingDistance(nodeId, sha256(abi.encodePacked(UAI)));
    //        assetRecords[UAI].holderPrices[epoch][rank] = price;
    //
    //        if (length < 3) {

    //            assetRecords[UAI].holderCount[epoch] += 1;
    //        }
    //    }
    //
    //    function answerChallenge(uint256 UAI, uint256 blockNumber, bytes32 [] memory proof, bytes32 leaf, uint256 price, address identity) public {
    //        require(UAIRegistry(hub.getContractAddress("UAIRegistry")).exists(UAI) == true, "ERC721 token doesn't exist!");
    //        require(price <= assetRecords[UAI].priceLimit, "Price limit has been exceeded!");
    //        require(UAIRegistry(hub.getContractAddress("UAIRegistry")).exists(UAI) == true, "ERC721 token doesn't exist!");
    ////        require(ERC734(identity).keyHasPurpose(keccak256(abi.encodePacked(msg.sender)), 2), "Sender does not have action permission for identity!");
    //
    //        uint256 epoch = getEpoch(UAI, blockNumber);
    //        bool isActive = isEpochActive(UAI, epoch);
    //
    //        require(isActive);
    //
    //        // TODO Bid with lower price
    //        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
    //        bytes32 nodeId = profileStorage.getNodeId(identity);
    //        for (uint256 i = 0; i < assetRecords[UAI].holderCount[epoch]; i++) {
    //            require(nodeId != assetRecords[UAI].holderIds[epoch][i], "Node has already answered the challenge!");
    //        }
    //
    //        uint256 challenge = calculateChallenge(UAI, blockNumber, identity);
    //        uint256 rank = getContributionRank(UAI, epoch, identity);
    //        // 0, 1, 2, 3
    //        require(rank < 3, "Contribution rank is too low");
    //
    //        require(MerkleProof.verify(proof, assetRecords[UAI].stateCommitHash, keccak256(abi.encodePacked(leaf, challenge))), "Root hash doesn't match");
    //        addContributor(UAI, epoch, rank, price, identity);
    //    }
    //
    //
    //    function getReward(uint256 UAI, uint256 epoch, address identity) public {
    //        require(ERC734(identity).keyHasPurpose(keccak256(abi.encodePacked(msg.sender)), 2), "Sender does not have action permission for identity!");
    //        require(UAIRegistry(hub.getContractAddress("UAIRegistry")).exists(UAI) == true, "ERC721 token doesn't exist!");
    //
    //        bool isActive = isEpochActive(UAI, epoch);
    //
    //        require(isActive == false);
    //
    //        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
    //        bytes32 nodeId = profileStorage.getNodeId(identity);
    //
    //        for (uint i = 0; i < assetRecords[UAI].holderCount[epoch]; i++) {
    //            if (assetRecords[UAI].holderIds[epoch][i] == nodeId) {
    //                uint256 amount = assetRecords[UAI].holderPrices[epoch][i];
    //                require(amount > 0);
    //                assetRecords[UAI].holderPrices[epoch][i] = 0;
    //                assetRecords[UAI].stake -= amount;
    //                profileStorage.setStake(identity, profileStorage.getStake(identity) + amount);
    //                IERC20 tokenContract = IERC20(hub.getContractAddress("Token"));
    //                //                require(tokenContract.allowance(msg.sender, address(this)) >= tokenAmount, "Sender allowance must be equal to or higher than chosen amount");
    //                //                require(tokenContract.balanceOf(msg.sender) >= tokenAmount, "Sender balance must be equal to or higher than chosen amount!");
    //                tokenContract.transfer(hub.getContractAddress("ProfileStorage"), amount);
    //
    //                break;
    //            }
    //        }
    //    }

    // getters
    function getCommitHash(uint256 UAI, uint256 offset) public view returns (bytes32 commitHash){
        require(assetRecords[UAI].assertions.length > offset, "Offset is invalid");
        return assetRecords[UAI].assertions[assetRecords[UAI].assertions.length - 1 - offset];
    }

    function getAssetOwner(uint256 UAI) public view returns (address owner){
        return UAIRegistry(hub.getContractAddress("UAIRegistry")).ownerOf(UAI);
    }

    function getAssetTimestamp(uint256 UAI) public view returns (uint256 timestamp){
        return assetRecords[UAI].timestamp;
    }

    function getNumberOfEpochs() public view returns (uint256) {
        return _numberOfEpochs;
    }

    function setNumberOfEpochs(uint256 numberOfEpochs) public onlyOwner {
        _numberOfEpochs = numberOfEpochs;
    }

    function getBlockTime() public view returns (uint256) {
        return _blockTime;
    }

    function setBlockTime(uint256 blockTime) public onlyOwner {
        _blockTime = blockTime;
    }

    function getNumberOfHolders() public view returns (uint256) {
        return _numberOfHolders;
    }

    function setNumberOfHolders(uint256 numberOfHolders) public onlyOwner {
        _numberOfHolders = numberOfHolders;
    }

    function getEpochValidityInBlocks() public view returns (uint256) {
        return _epochValidityInBlocks;
    }

    function setEpochValidityInBlocks(uint256 epochValidityInBlocks) public onlyOwner {
        _epochValidityInBlocks = epochValidityInBlocks;
    }
}