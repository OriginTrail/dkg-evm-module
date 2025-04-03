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

    uint16 public proofingPeriodDurationInBlocks;

    uint256 private activeProofPeriodStartBlock;
    // identityId => Challenge - used in proof to verify the challenge is within proofing period
    mapping(uint72 => RandomSamplingLib.Challenge) public nodesChallenges;
    // epoch => identityId => successful proofs count
    mapping(uint256 => mapping(uint72 => uint256)) public epochNodeValidProofsCount;
    // identityId => epoch => proofPeriodStartBlock => score
    mapping(uint72 => mapping(uint256 => mapping(uint256 => uint256))) public nodeEpochProofPeriodScore;
    // epoch => proofPeriodStartBlock => score
    mapping(uint256 => mapping(uint256 => uint256)) public allNodesEpochProofPeriodScore;
    // epoch => identityId => delegatorKey => score
    mapping(uint256 => mapping(uint72 => mapping(bytes32 => uint256))) public epochNodeDelegatorScore;

    constructor(address hubAddress, uint16 _proofingPeriodDurationInBlocks) HubDependent(hubAddress) {
        proofingPeriodDurationInBlocks = _proofingPeriodDurationInBlocks;
    }

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function updateAndGetActiveProofPeriodStartBlock() external returns (uint256) {
        if (block.number > activeProofPeriodStartBlock + proofingPeriodDurationInBlocks) {
            uint256 newActiveBlock = block.number - (block.number % proofingPeriodDurationInBlocks) + 1;
            activeProofPeriodStartBlock = newActiveBlock;
        }

        return activeProofPeriodStartBlock;
    }

    function getActiveProofPeriodStatus() external view returns (RandomSamplingLib.ProofPeriodStatus memory) {
        return
            RandomSamplingLib.ProofPeriodStatus(
                activeProofPeriodStartBlock,
                block.number <= activeProofPeriodStartBlock + proofingPeriodDurationInBlocks
            );
    }

    function getHistoricalProofPeriodStartBlock(
        uint256 proofPeriodStartBlock,
        uint256 offset
    ) external view returns (uint256) {
        require(proofPeriodStartBlock > 0, "Proof period start block must be greater than 0");
        require(proofPeriodStartBlock % proofingPeriodDurationInBlocks == 0, "Proof period start block is not valid");
        require(offset > 0, "Offset must be greater than 0");
        return proofPeriodStartBlock - (offset * proofingPeriodDurationInBlocks);
    }

    function getProofingPeriodDurationInBlocks() external view returns (uint16) {
        return proofingPeriodDurationInBlocks;
    }

    function setProofingPeriodDurationInBlocks(uint16 durationInBlocks) external onlyContracts {
        require(durationInBlocks > 0, "Duration in blocks must be greater than 0");
        proofingPeriodDurationInBlocks = durationInBlocks;
    }

    function getNodeChallenge(uint72 identityId) external view returns (RandomSamplingLib.Challenge memory) {
        return nodesChallenges[identityId];
    }

    function setNodeChallenge(uint72 identityId, RandomSamplingLib.Challenge memory challenge) external onlyContracts {
        nodesChallenges[identityId] = challenge;
    }

    function getNodeEpochProofPeriodScore(
        uint72 identityId,
        uint256 epoch,
        uint256 proofPeriodStartBlock
    ) external view returns (uint256) {
        return nodeEpochProofPeriodScore[identityId][epoch][proofPeriodStartBlock];
    }

    function getEpochAllNodesProofPeriodScore(
        uint256 epoch,
        uint256 proofPeriodStartBlock
    ) external view returns (uint256) {
        return allNodesEpochProofPeriodScore[epoch][proofPeriodStartBlock];
    }

    function incrementEpochNodeValidProofsCount(uint256 epoch, uint72 identityId) external onlyContracts {
        epochNodeValidProofsCount[epoch][identityId] += 1;
    }

    function getEpochNodeValidProofsCount(uint256 epoch, uint72 identityId) external view returns (uint256) {
        return epochNodeValidProofsCount[epoch][identityId];
    }

    function addToNodeScore(
        uint256 epoch,
        uint256 proofPeriodStartBlock,
        uint72 identityId,
        uint256 score
    ) external onlyContracts {
        nodeEpochProofPeriodScore[identityId][epoch][proofPeriodStartBlock] += score;
        allNodesEpochProofPeriodScore[epoch][proofPeriodStartBlock] += score;
    }

    function getEpochNodeDelegatorScore(
        uint256 epoch,
        uint72 identityId,
        bytes32 delegatorKey
    ) external view returns (uint256) {
        return epochNodeDelegatorScore[epoch][identityId][delegatorKey];
    }

    function addToEpochNodeDelegatorScore(
        uint256 epoch,
        uint72 identityId,
        bytes32 delegatorKey,
        uint256 score
    ) external onlyContracts {
        epochNodeDelegatorScore[epoch][identityId][delegatorKey] += score;
    }
}
