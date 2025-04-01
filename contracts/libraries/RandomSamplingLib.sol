// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

library RandomSamplingLib {
    struct Challenge {
        uint256 knowledgeCollectionId;
        uint256 chunkId; // TODO:Smaller data structure
        uint256 activeProofPeriodStartBlock;
        bool solved;
    }
}
