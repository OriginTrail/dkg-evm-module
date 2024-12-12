// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.16;

contract Chronos {
    uint256 public immutable startTime;
    uint256 public immutable epochLength;

    constructor() {
        startTime = block.timestamp;
        epochLength = 1 * 30 * 24 * 60 * 60;
    }

    function getCurrentEpoch() external view returns (uint256) {
        if (block.timestamp < startTime) {
            return 0;
        }
        return ((block.timestamp - startTime) / epochLength) + 1;
    }

    function epochAtTimestamp(uint256 timestamp) external view returns (uint256) {
        if (timestamp < startTime) {
            return 0;
        }
        return ((timestamp - startTime) / epochLength) + 1;
    }

    function timeUntilNextEpoch() external view returns (uint256) {
        if (block.timestamp < startTime) {
            return startTime - block.timestamp;
        }
        uint256 elapsed = (block.timestamp - startTime) % epochLength;
        return epochLength - elapsed;
    }

    function hasEpochElapsed(uint256 epochNumber) external view returns (bool) {
        return block.timestamp >= (startTime + (epochNumber - 1) * epochLength);
    }

    function timestampForEpoch(uint256 epochNumber) external view returns (uint256) {
        if (epochNumber == 0) {
            return startTime;
        }
        return startTime + (epochNumber - 1) * epochLength;
    }

    function elapsedTimeInCurrentEpoch() external view returns (uint256) {
        if (block.timestamp < startTime) {
            return 0;
        }
        return (block.timestamp - startTime) % epochLength;
    }

    function totalElapsedTime() external view returns (uint256) {
        if (block.timestamp < startTime) {
            return 0;
        }
        return block.timestamp - startTime;
    }

    function isChronosActive() external view returns (bool) {
        return block.timestamp >= startTime;
    }
}
