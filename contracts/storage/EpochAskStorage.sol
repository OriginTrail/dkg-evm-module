// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {INamed} from "../interfaces/INamed.sol";
import {IVersioned} from "../interfaces/IVersioned.sol";
import {HubDependent} from "../abstract/HubDependent.sol";

contract EpochAskStorage is INamed, IVersioned, HubDependent {
    string private constant _NAME = "EpochAskStorage";
    string private constant _VERSION = "1.0.0";

    mapping(uint256 => uint256) public epochLockedAsk;
    uint256 public latestLockedAsk;

    constructor(address hubAddress, uint256 currentEpoch, uint256 currentAsk) HubDependent(hubAddress) {
        epochLockedAsk[currentEpoch] = currentAsk;
        latestLockedAsk = currentAsk;
    }

    function name() public pure virtual returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual returns (string memory) {
        return _VERSION;
    }

    function setEpochLockedAsk(uint256 epoch, uint256 ask) external onlyContracts {
        epochLockedAsk[epoch] = ask;
        latestLockedAsk = ask;
    }

    function getEpochLockedAsk(uint256 epoch) external view returns (uint256) {
        uint256 ask = epochLockedAsk[epoch];
        return ask > 0 ? ask : latestLockedAsk;
    }
}