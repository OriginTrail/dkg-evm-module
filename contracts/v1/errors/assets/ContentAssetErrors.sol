// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

library ContentAssetErrors {
    error AssetDoesntExist(uint256 tokenId);
    error AssetExpired(uint256 tokenId);
    error CommitPhaseOngoing(bytes32 agreementId);
    error CommitPhaseSucceeded(bytes32 agreementId);
    error FirstEpochHasAlreadyEnded(bytes32 agreementId);
    error NoPendingUpdate(address assetStorage, uint256 tokenId);
    error UpdateIsNotFinalized(address assetStorage, uint256 tokenId, bytes32 latestState);
    error PendingUpdateFinalization(address assetStorage, uint256 tokenId, uint256 latestStateIndex);
}
