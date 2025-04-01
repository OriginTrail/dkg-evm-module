// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {INamed} from "../interfaces/INamed.sol";
import {IVersioned} from "../interfaces/IVersioned.sol";
import {Guardian} from "../Guardian.sol";
import {RandomSamplingLib} from "../libraries/RandomSamplingLib.sol";

contract RandomSamplingStorage is INamed, IVersioned, Guardian {
    string private constant _NAME = "RandomSamplingStorage";
    string private constant _VERSION = "1.0.0";

    uint8 public immutable CHUNK_BYTE_SIZE = 32;
    uint256 public activeProofPeriodStartBlock;
    // Chain Id => Proofing period duration in blocks
    mapping(uint256 => uint8) public chainProofingPeriodDurationInBlocks;
    // identityId => Challenge - used in proof to verify the challenge is within proofing period
    mapping(uint72 => RandomSamplingLib.Challenge) public nodesChallenges;

    constructor(address hubAddress) Guardian(hubAddress) {}

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function getActiveProofPeriodStartBlock() external view returns (uint256) {
        return activeProofPeriodStartBlock;
    }

    function getChainProofingPeriodDurationInBlocks(uint256 chainId) external view returns (uint8) {
        return chainProofingPeriodDurationInBlocks[chainId];
    }

    function setChainProofingPeriodDurationInBlocks(uint8 chainId, uint8 durationInBlocks) external onlyHubOwner {
        chainProofingPeriodDurationInBlocks[chainId] = durationInBlocks;
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

    function setActiveProofPeriodStartBlock(uint256 blockNumber) external onlyRandomSamplingContract {
        activeProofPeriodStartBlock = blockNumber;
    }

    modifier onlyRandomSamplingContract() {
        require(
            msg.sender == hub.getContractAddress("RandomSampling"),
            "Only RandomSampling contract can call this function"
        );
        _;
    }
}
