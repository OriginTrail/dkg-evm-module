// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

library ServiceAgreementErrorsV1U1 {
    error HashFunctionDoesntExist(uint8 hashFunctionId);
    error CommitWindowClosed(
        bytes32 agreementId,
        uint16 epoch,
        uint256 stateIndex,
        uint256 commitWindowOpen,
        uint256 commitWindowClose,
        uint256 timeNow
    );
    error ProofWindowClosed(
        bytes32 agreementId,
        uint16 epoch,
        uint256 stateIndex,
        uint256 proofWindowOpen,
        uint256 proofWindowClose,
        uint256 timeNow
    );
    error NodeAlreadyRewarded(bytes32 agreementId, uint16 epoch, uint256 stateIndex, uint72 identityId, bytes nodeId);
    error NodeNotAwarded(
        bytes32 agreementId,
        uint16 epoch,
        uint256 stateIndex,
        uint72 identityId,
        bytes nodeId,
        uint8 rank
    );
    error WrongMerkleProof(
        bytes32 agreementId,
        uint16 epoch,
        uint256 stateIndex,
        uint72 identityId,
        bytes nodeId,
        bytes32[] merkleProof,
        bytes32 merkleRoot,
        bytes32 chunkHash,
        uint256 challenge
    );
    error NodeAlreadySubmittedCommit(
        bytes32 agreementId,
        uint16 epoch,
        uint256 stateIndex,
        uint72 identityId,
        bytes nodeId
    );
    error NoPendingUpdate(address assetStorage, uint256 tokenId);
}
