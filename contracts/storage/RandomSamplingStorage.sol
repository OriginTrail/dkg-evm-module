// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {INamed} from "../interfaces/INamed.sol";
import {IVersioned} from "../interfaces/IVersioned.sol";
import {RandomSamplingLib} from "../libraries/RandomSamplingLib.sol";
import {HubDependent} from "../abstract/HubDependent.sol";

contract RandomSamplingStorage is INamed, IVersioned, HubDependent {
    string private constant _NAME = "RandomSamplingStorage";
    string private constant _VERSION = "1.0.0";
    uint8 public constant CHUNK_BYTE_SIZE = 32;

    uint8 public proofingPeriodDurationInBlocks;

    uint256 public activeProofPeriodStartBlock;
    // identityId => Challenge - used in proof to verify the challenge is within proofing period
    mapping(uint72 => RandomSamplingLib.Challenge) public nodesChallenges;
    // epoch => identityId => successful proofs count
    mapping(uint256 => mapping(uint72 => uint256)) public epochNodeValidProofsCount;
    // epoch => identityId => score
    mapping(uint256 => mapping(uint72 => uint256)) public epochNodeTotalScore;
    // epoch => score
    mapping(uint256 => uint256) public epochAllNodesTotalScore;

    constructor(address hubAddress) HubDependent(hubAddress) {}

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function getActiveProofPeriodStartBlock() external returns (uint256) {
        if (block.number > activeProofPeriodStartBlock + proofingPeriodDurationInBlocks) {
            uint256 newActiveBlock = block.number - (block.number % proofingPeriodDurationInBlocks);
            activeProofPeriodStartBlock = newActiveBlock;
        }

        return activeProofPeriodStartBlock;
    }

    function getProofingPeriodDurationInBlocks() external view returns (uint8) {
        return proofingPeriodDurationInBlocks;
    }

    function setProofingPeriodDurationInBlocks(uint8 durationInBlocks) external {
        require(
            msg.sender == hub.owner() || msg.sender == hub.getContractAddress("RandomSampling"),
            "Only hub owner or RandomSampling contract can call this function"
        );
        proofingPeriodDurationInBlocks = durationInBlocks;
    }

    function getNodeChallenge(uint72 identityId) external view returns (RandomSamplingLib.Challenge memory) {
        return nodesChallenges[identityId];
    }

    function setNodeChallenge(
        uint72 identityId,
        RandomSamplingLib.Challenge memory challenge
    ) external onlyRandomSamplingContract {
        nodesChallenges[identityId] = challenge;
    }

    function incrementEpochNodeValidProofsCount(uint256 epoch, uint72 identityId) external onlyRandomSamplingContract {
        epochNodeValidProofsCount[epoch][identityId] += 1;
    }

    function getEpochNodeValidProofsCount(uint256 epoch, uint72 identityId) external view returns (uint256) {
        return epochNodeValidProofsCount[epoch][identityId];
    }

    function getEpochNodeTotalScore(uint256 epoch, uint72 identityId) external view returns (uint256) {
        return epochNodeTotalScore[epoch][identityId];
    }

    function addToEpochNodeTotalScore(
        uint256 epoch,
        uint72 identityId,
        uint256 score
    ) external onlyRandomSamplingContract {
        epochNodeTotalScore[epoch][identityId] += score;
        epochAllNodesTotalScore[epoch] += score;
    }

    function getEpochAllNodesTotalScore(uint256 epoch) external view returns (uint256) {
        return epochAllNodesTotalScore[epoch];
    }

    modifier onlyRandomSamplingContract() {
        require(
            msg.sender == hub.getContractAddress("RandomSampling"),
            "Only RandomSampling contract can call this function"
        );
        _;
    }
}
