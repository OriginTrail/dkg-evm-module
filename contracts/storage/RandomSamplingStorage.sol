// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {INamed} from "../interfaces/INamed.sol";
import {IVersioned} from "../interfaces/IVersioned.sol";
import {IInitializable} from "../interfaces/IInitializable.sol";
import {RandomSamplingLib} from "../libraries/RandomSamplingLib.sol";
import {HubDependent} from "../abstract/HubDependent.sol";
import {Chronos} from "../storage/Chronos.sol";

contract RandomSamplingStorage is INamed, IVersioned, IInitializable, HubDependent {
    string private constant _NAME = "RandomSamplingStorage";
    string private constant _VERSION = "1.0.0";
    uint8 public constant CHUNK_BYTE_SIZE = 32;
    Chronos public chronos;

    RandomSamplingLib.ProofingPeriodDuration[] public proofingPeriodDurations;

    uint256 private activeProofPeriodStartBlock;
    // identityId => Challenge - used in proof to verify the challenge is within proofing period
    mapping(uint72 => RandomSamplingLib.Challenge) public nodesChallenges;
    // epoch => identityId => successful proofs count
    mapping(uint256 => mapping(uint72 => uint256)) public epochNodeValidProofsCount;
    // identityId => epoch => proofPeriodStartBlock => score
    mapping(uint72 => mapping(uint256 => mapping(uint256 => uint256))) public nodeEpochProofPeriodScore;
    // epoch => proofPeriodStartBlock => score
    mapping(uint256 => mapping(uint256 => uint256)) public allNodesEpochProofPeriodScore;
    // epoch => identityId => delegatorKey => score
    mapping(uint256 => mapping(uint72 => mapping(bytes32 => uint256))) public epochNodeDelegatorScore;

    event ProofingPeriodDurationAdded(uint16 durationInBlocks, uint256 indexed effectiveEpoch);
    event PendingProofingPeriodDurationReplaced(
        uint16 oldDurationInBlocks,
        uint16 newDurationInBlocks,
        uint256 indexed effectiveEpoch
    );

    constructor(address hubAddress, uint16 _proofingPeriodDurationInBlocks) HubDependent(hubAddress) {
        require(_proofingPeriodDurationInBlocks > 0, "Proofing period duration in blocks must be greater than 0");
        proofingPeriodDurations.push(
            RandomSamplingLib.ProofingPeriodDuration({
                durationInBlocks: _proofingPeriodDurationInBlocks,
                effectiveEpoch: 0
            })
        );
    }

    function initialize() public onlyHub {
        chronos = Chronos(hub.getContractAddress("Chronos"));
        // update the last proofing period duration with the current epoch
        proofingPeriodDurations[proofingPeriodDurations.length - 1] = RandomSamplingLib.ProofingPeriodDuration({
            durationInBlocks: proofingPeriodDurations[proofingPeriodDurations.length - 1].durationInBlocks,
            effectiveEpoch: chronos.getCurrentEpoch()
        });
    }

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function updateAndGetActiveProofPeriodStartBlock() external returns (uint256) {
        uint256 activeProofingPeriodDurationInBlocks = getActiveProofingPeriodDurationInBlocks();

        if (activeProofingPeriodDurationInBlocks == 0) {
            revert("Active proofing period duration in blocks should not be 0");
        }

        if (block.number > activeProofPeriodStartBlock + activeProofingPeriodDurationInBlocks - 1) {
            // Calculate how many complete periods have passed since the last active period started
            uint256 blocksSinceLastStart = block.number - activeProofPeriodStartBlock;
            uint256 completePeriodsPassed = blocksSinceLastStart / activeProofingPeriodDurationInBlocks;

            activeProofPeriodStartBlock =
                activeProofPeriodStartBlock +
                completePeriodsPassed *
                activeProofingPeriodDurationInBlocks;
        }

        return activeProofPeriodStartBlock;
    }

    function getActiveProofPeriodStatus() external view returns (RandomSamplingLib.ProofPeriodStatus memory) {
        return
            RandomSamplingLib.ProofPeriodStatus(
                activeProofPeriodStartBlock,
                block.number < activeProofPeriodStartBlock + getActiveProofingPeriodDurationInBlocks()
            );
    }

    function getHistoricalProofPeriodStartBlock(
        uint256 proofPeriodStartBlock,
        uint256 offset
    ) external view returns (uint256) {
        require(proofPeriodStartBlock > 0, "Proof period start block must be greater than 0");
        require(
            proofPeriodStartBlock % getActiveProofingPeriodDurationInBlocks() == 0,
            "Proof period start block is not valid"
        );
        require(offset > 0, "Offset must be greater than 0");
        return proofPeriodStartBlock - offset * getActiveProofingPeriodDurationInBlocks();
    }

    function isPendingProofingPeriodDuration() public view returns (bool) {
        return chronos.getCurrentEpoch() < proofingPeriodDurations[proofingPeriodDurations.length - 1].effectiveEpoch;
    }

    function replacePendingProofingPeriodDuration(
        uint16 durationInBlocks,
        uint256 effectiveEpoch
    ) external onlyContracts {
        uint16 oldDurationInBlocks = proofingPeriodDurations[proofingPeriodDurations.length - 1].durationInBlocks;
        proofingPeriodDurations[proofingPeriodDurations.length - 1] = RandomSamplingLib.ProofingPeriodDuration({
            durationInBlocks: durationInBlocks,
            effectiveEpoch: effectiveEpoch
        });

        emit PendingProofingPeriodDurationReplaced(oldDurationInBlocks, durationInBlocks, effectiveEpoch);
    }

    function addProofingPeriodDuration(uint16 durationInBlocks, uint256 effectiveEpoch) external onlyContracts {
        proofingPeriodDurations.push(
            RandomSamplingLib.ProofingPeriodDuration({
                durationInBlocks: durationInBlocks,
                effectiveEpoch: effectiveEpoch
            })
        );

        emit ProofingPeriodDurationAdded(durationInBlocks, effectiveEpoch);
    }

    function getActiveProofingPeriodDurationInBlocks() public view returns (uint16) {
        uint256 currentEpoch = chronos.getCurrentEpoch();

        if (currentEpoch >= proofingPeriodDurations[proofingPeriodDurations.length - 1].effectiveEpoch) {
            return proofingPeriodDurations[proofingPeriodDurations.length - 1].durationInBlocks;
        }

        return proofingPeriodDurations[proofingPeriodDurations.length - 2].durationInBlocks;
    }

    function getEpochProofingPeriodDurationInBlocks(uint256 epoch) external view returns (uint16) {
        // Find the most recent duration that was effective before or at the specified epoch
        for (uint256 i = proofingPeriodDurations.length; i > 0; ) {
            if (epoch >= proofingPeriodDurations[i - 1].effectiveEpoch) {
                return proofingPeriodDurations[i - 1].durationInBlocks;
            }

            unchecked {
                i--;
            }
        }

        // If no applicable duration found, revert
        revert("No applicable duration found");
    }

    function getNodeChallenge(uint72 identityId) external view returns (RandomSamplingLib.Challenge memory) {
        return nodesChallenges[identityId];
    }

    function setNodeChallenge(
        uint72 identityId,
        RandomSamplingLib.Challenge calldata challenge
    ) external onlyContracts {
        nodesChallenges[identityId] = challenge;
    }

    function getNodeEpochProofPeriodScore(
        uint72 identityId,
        uint256 epoch,
        uint256 proofPeriodStartBlock
    ) external view returns (uint256) {
        return nodeEpochProofPeriodScore[identityId][epoch][proofPeriodStartBlock];
    }

    function getEpochAllNodesProofPeriodScore(
        uint256 epoch,
        uint256 proofPeriodStartBlock
    ) external view returns (uint256) {
        return allNodesEpochProofPeriodScore[epoch][proofPeriodStartBlock];
    }

    function incrementEpochNodeValidProofsCount(uint256 epoch, uint72 identityId) external onlyContracts {
        epochNodeValidProofsCount[epoch][identityId] += 1;
    }

    function getEpochNodeValidProofsCount(uint256 epoch, uint72 identityId) external view returns (uint256) {
        return epochNodeValidProofsCount[epoch][identityId];
    }

    function addToNodeScore(
        uint256 epoch,
        uint256 proofPeriodStartBlock,
        uint72 identityId,
        uint256 score
    ) external onlyContracts {
        nodeEpochProofPeriodScore[identityId][epoch][proofPeriodStartBlock] += score;
        allNodesEpochProofPeriodScore[epoch][proofPeriodStartBlock] += score;
    }

    function getEpochNodeDelegatorScore(
        uint256 epoch,
        uint72 identityId,
        bytes32 delegatorKey
    ) external view returns (uint256) {
        return epochNodeDelegatorScore[epoch][identityId][delegatorKey];
    }

    function addToEpochNodeDelegatorScore(
        uint256 epoch,
        uint72 identityId,
        bytes32 delegatorKey,
        uint256 score
    ) external onlyContracts {
        epochNodeDelegatorScore[epoch][identityId][delegatorKey] += score;
    }
}
