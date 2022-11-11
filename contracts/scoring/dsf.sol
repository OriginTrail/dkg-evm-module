// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IScoringFunction } from "../interface/ScoringFunction.sol";
import { HashingHub } from "../HashingHub.sol";
import { Hub } from "../Hub.sol";

contract DSF is IScoringFunction {
    Hub public hub;

    constructor(address hubAddress) {
        require(hubAddress != address(0));
        hub = Hub(hubAddress);
    }

    function calculateScore(uint256 distance, uint96 stake, uint32 a, uint32 b)
        public
        returns (uint32)
    {
        // VERIFY: uint256 -> uint32 casting
        return uint32((a * stake) / (b * distance));
    }

    function calculateXORDistance(uint8 hashingFunctionId, bytes memory nodeId, bytes memory keyword)
        public
        returns (uint256)
    {
        HashingHub hashingHub = HashingHub(hub.getContractAddress("HashingHub"));
        bytes32 nodeIdHash = hashingHub.callHashingFunction(hashingFunctionId, nodeId);
        bytes32 keywordHash = hashingHub.callHashingFunction(hashingFunctionId, keyword);

        return uint256(nodeIdHash ^ keywordHash);
    }
}
