// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

library ContentAssetStructsV2 {
    struct AssetInputArgs {
        string publishOperationId;
        bytes32 assertionId;
        uint128 size;
        uint32 triplesNumber;
        uint96 chunksNumber;
        uint16 epochsNumber;
        uint96 tokenAmount;
        uint8 scoreFunctionId;
        bool immutable_;
    }
}
