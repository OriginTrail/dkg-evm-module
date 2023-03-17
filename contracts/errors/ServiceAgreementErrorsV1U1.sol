// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

library ServiceAgreementErrorsV1U1 {
    error ServiceAgreementDoesntExist(bytes32 agreementId);
    error EmptyAssetCreatorAddress();
    error AssetStorageNotInTheHub(address contractAddress);
    error EmptyKeyword();
    error ZeroEpochsNumber();
    error ZeroTokenAmount();
    error ScoreFunctionDoesntExist(uint8 scoreFunctionId);
    error HashFunctionDoesntExist(uint8 hashFunctionId);
    error TooLowAllowance(uint256 amount);
    error TooLowBalance(uint256 amount);
    error ServiceAgreementHasBeenExpired(
        bytes32 agreementId,
        uint256 startTime,
        uint16 epochsNumber,
        uint128 epochLength
    );
    error CommitWindowClosed(
        bytes32 agreementId,
        uint16 epoch,
        uint256 stateIndex,
        uint256 commitWindowOpen,
        uint256 commitWindowClose,
        uint256 timeNow
    );
    error NodeNotInShardingTable(uint72 identityId, bytes nodeId, uint96 ask, uint96 stake);
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
