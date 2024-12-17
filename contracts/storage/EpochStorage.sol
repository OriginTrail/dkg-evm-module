// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {Chronos} from "./Chronos.sol";
import {HubDependent} from "../abstract/HubDependent.sol";
import {INamed} from "../interfaces/INamed.sol";
import {IVersioned} from "../interfaces/IVersioned.sol";

contract EpochStorage is INamed, IVersioned, HubDependent {
    string private constant _NAME = "EpochStorage";
    string private constant _VERSION = "1.0.0";

    Chronos public chronos;

    mapping(uint256 => uint256) public lastFinalizedEpoch;
    mapping(uint256 => uint96) public accumulatedRemainder;

    mapping(uint256 => mapping(uint256 => int96)) public diff;
    mapping(uint256 => mapping(uint256 => uint96)) public cumulative;
    mapping(uint256 => mapping(uint256 => uint96)) public distributed;
    mapping(uint72 => mapping(uint256 => mapping(uint256 => uint96))) public nodesPaidOut;

    constructor(address hubAddress) HubDependent(hubAddress) {}

    function initialize() public onlyHub {
        chronos = Chronos(hub.getContractAddress("Chronos"));
    }

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function addTokensToEpochRange(
        uint256 shardId,
        uint256 startEpoch,
        uint256 endEpoch,
        uint96 tokenAmount
    ) external onlyContracts {
        uint256 numEpochs = endEpoch - startEpoch + 1;

        uint96 totalTokens = tokenAmount + accumulatedRemainder[shardId];
        uint96 tokensPerEpochU = uint96(totalTokens / numEpochs);
        uint96 remainder = uint96(totalTokens % numEpochs);

        accumulatedRemainder[shardId] = remainder;

        int96 tokensPerEpoch = int96(tokensPerEpochU);

        diff[shardId][startEpoch] += tokensPerEpoch;
        diff[shardId][endEpoch + 1] -= tokensPerEpoch;

        uint256 currentEpoch = chronos.getCurrentEpoch();
        if (currentEpoch > 1) {
            _finalizeEpochsUpTo(shardId, currentEpoch - 1);
        }
    }

    function payOutEpochTokens(
        uint256 shardId,
        uint256 epoch,
        uint72 identityId,
        uint96 amount
    ) external onlyContracts {
        uint256 currentEpoch = chronos.getCurrentEpoch();
        if (currentEpoch > 1) {
            _finalizeEpochsUpTo(shardId, currentEpoch - 1);
        }

        distributed[shardId][epoch] += amount;
        nodesPaidOut[identityId][shardId][epoch] += amount;
    }

    function getEpochPool(uint256 shardId, uint256 epoch) public view returns (uint96) {
        if (epoch <= lastFinalizedEpoch[shardId]) {
            return cumulative[shardId][epoch];
        } else {
            return _simulateEpochFinalization(shardId, epoch);
        }
    }

    function getPreviousEpochPool(uint256 shardId) external view returns (uint96) {
        uint256 currentEpoch = chronos.getCurrentEpoch();
        if (currentEpoch <= 1) {
            return 0;
        }
        return getEpochPool(shardId, currentEpoch - 1);
    }

    function getEpochDistributedPool(uint256 shardId, uint256 epoch) external view returns (uint96) {
        return distributed[shardId][epoch];
    }

    function getPreviousEpochDistributedPool(uint256 shardId) external view returns (uint96) {
        uint256 currentEpoch = chronos.getCurrentEpoch();
        if (currentEpoch <= 1) {
            return 0;
        }
        return distributed[shardId][currentEpoch - 1];
    }

    function getNodeEpochPaidOut(uint256 shardId, uint72 identityId, uint256 epoch) external view returns (uint96) {
        return nodesPaidOut[identityId][shardId][epoch];
    }

    function getNodePreviousEpochPaidOut(uint256 shardId, uint72 identityId) external view returns (uint96) {
        uint256 currentEpoch = chronos.getCurrentEpoch();
        if (currentEpoch <= 1) {
            return 0;
        }
        return nodesPaidOut[identityId][shardId][currentEpoch - 1];
    }

    function _finalizeEpochsUpTo(uint256 shardId, uint256 epoch) internal {
        for (uint256 e = lastFinalizedEpoch[shardId] + 1; e <= epoch; e++) {
            int96 prev = 0;
            if (e > 1) {
                prev = int96(cumulative[shardId][e - 1]);
            }
            cumulative[shardId][e] = uint96(prev + diff[shardId][e]);
        }
        lastFinalizedEpoch[shardId] = epoch;
    }

    function _simulateEpochFinalization(uint256 shardId, uint256 epoch) internal view returns (uint96) {
        if (epoch <= lastFinalizedEpoch[shardId]) {
            return cumulative[shardId][epoch];
        }

        uint96 simulatedCumulative = 0;
        if (lastFinalizedEpoch[shardId] > 0) {
            simulatedCumulative = cumulative[shardId][lastFinalizedEpoch[shardId]];
        }

        for (uint256 e = lastFinalizedEpoch[shardId] + 1; e <= epoch; e++) {
            int96 prev = int96(simulatedCumulative);
            int96 result = prev + diff[shardId][e];
            simulatedCumulative = uint96(result);
        }

        return simulatedCumulative;
    }
}
