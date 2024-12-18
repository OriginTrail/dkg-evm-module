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

    uint256 public lastFinalizedEpoch;
    uint96 public accumulatedRemainder;

    mapping(uint256 => int96) public diff;
    mapping(uint256 => uint96) public cumulative;
    mapping(uint256 => uint96) public distributed;
    mapping(uint72 => mapping(uint256 => uint96)) public nodesPaidOut;

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

    function addTokensToEpochRange(uint256 startEpoch, uint256 endEpoch, uint96 tokenAmount) external onlyContracts {
        uint256 numEpochs = endEpoch - startEpoch + 1;

        uint96 totalTokens = tokenAmount + accumulatedRemainder;
        uint96 tokensPerEpochU = uint96(totalTokens / numEpochs);
        uint96 remainder = uint96(totalTokens % numEpochs);

        accumulatedRemainder = remainder;

        int96 tokensPerEpoch = int96(tokensPerEpochU);

        diff[startEpoch] += tokensPerEpoch;
        diff[endEpoch + 1] -= tokensPerEpoch;

        uint256 currentEpoch = chronos.getCurrentEpoch();
        if (currentEpoch > 1) {
            _finalizeEpochsUpTo(currentEpoch - 1);
        }
    }

    function payOutEpochTokens(uint256 epoch, uint72 identityId, uint96 amount) external onlyContracts {
        uint256 currentEpoch = chronos.getCurrentEpoch();
        if (currentEpoch > 1) {
            _finalizeEpochsUpTo(currentEpoch - 1);
        }

        distributed[epoch] += amount;
        nodesPaidOut[identityId][epoch] += amount;
    }

    function getEpochPool(uint256 epoch) public view returns (uint96) {
        if (epoch <= lastFinalizedEpoch) {
            return cumulative[epoch];
        } else {
            return _simulateEpochFinalization(epoch);
        }
    }

    function getPreviousEpochPool() external view returns (uint96) {
        uint256 currentEpoch = chronos.getCurrentEpoch();
        if (currentEpoch <= 1) {
            return 0;
        }
        return getEpochPool(currentEpoch - 1);
    }

    function getEpochDistributedPool(uint256 epoch) external view returns (uint96) {
        return distributed[epoch];
    }

    function getPreviousEpochDistributedPool() external view returns (uint96) {
        uint256 currentEpoch = chronos.getCurrentEpoch();
        if (currentEpoch <= 1) {
            return 0;
        }
        return distributed[currentEpoch - 1];
    }

    function getNodeEpochPaidOut(uint72 identityId, uint256 epoch) external view returns (uint96) {
        return nodesPaidOut[identityId][epoch];
    }

    function getNodePreviousEpochPaidOut(uint72 identityId) external view returns (uint96) {
        uint256 currentEpoch = chronos.getCurrentEpoch();
        if (currentEpoch <= 1) {
            return 0;
        }
        return nodesPaidOut[identityId][currentEpoch - 1];
    }

    function _finalizeEpochsUpTo(uint256 epoch) internal {
        for (uint256 e = lastFinalizedEpoch + 1; e <= epoch; e++) {
            int96 prev = 0;
            if (e > 1) {
                prev = int96(cumulative[e - 1]);
            }
            cumulative[e] = uint96(prev + diff[e]);
        }
        lastFinalizedEpoch = epoch;
    }

    function _simulateEpochFinalization(uint256 epoch) internal view returns (uint96) {
        if (epoch <= lastFinalizedEpoch) {
            return cumulative[epoch];
        }

        uint96 simulatedCumulative = 0;
        if (lastFinalizedEpoch > 0) {
            simulatedCumulative = cumulative[lastFinalizedEpoch];
        }

        for (uint256 e = lastFinalizedEpoch + 1; e <= epoch; e++) {
            int96 prev = int96(simulatedCumulative);
            int96 result = prev + diff[e];
            simulatedCumulative = uint96(result);
        }

        return simulatedCumulative;
    }
}
