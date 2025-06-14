// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {INamed} from "../interfaces/INamed.sol";
import {IVersioned} from "../interfaces/IVersioned.sol";
import {IInitializable} from "../interfaces/IInitializable.sol";
import {RandomSamplingLib} from "../libraries/RandomSamplingLib.sol";
import {Chronos} from "../storage/Chronos.sol";
import {ContractStatus} from "../abstract/ContractStatus.sol";
import {ICustodian} from "../interfaces/ICustodian.sol";
import {HubLib} from "../libraries/HubLib.sol";

contract RandomSamplingStorage is INamed, IVersioned, IInitializable, ContractStatus {
    string private constant _NAME = "RandomSamplingStorage";
    string private constant _VERSION = "1.0.0";
    uint8 public constant CHUNK_BYTE_SIZE = 32;
    Chronos public chronos;

    uint256 public w1;
    uint256 public w2;
    uint8 public avgBlockTimeInSeconds;

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
    // identityId => epoch => score
    mapping(uint72 => mapping(uint256 => uint256)) public nodeEpochScore;
    // epoch => score
    mapping(uint256 => uint256) public allNodesEpochScore;
    // epoch => identityId => delegatorKey => score
    mapping(uint256 => mapping(uint72 => mapping(bytes32 => uint256))) public epochNodeDelegatorScore;
    // epoch => identityId => scorePerStake
    mapping(uint256 => mapping(uint72 => uint256)) public nodeEpochScorePerStake;
    // epoch => identityId => delegatorKey => last settled nodeEpochScorePerStake
    mapping(uint256 => mapping(uint72 => mapping(bytes32 => uint256)))
        public delegatorLastSettledNodeEpochScorePerStake;

    event W1Updated(uint256 oldW1, uint256 newW1);
    event W2Updated(uint256 oldW2, uint256 newW2);
    event AvgBlockTimeUpdated(uint8 avgBlockTimeInSeconds);
    event ProofingPeriodDurationAdded(uint16 durationInBlocks, uint256 indexed effectiveEpoch);
    event PendingProofingPeriodDurationReplaced(
        uint16 oldDurationInBlocks,
        uint16 newDurationInBlocks,
        uint256 indexed effectiveEpoch
    );
    event NodeEpochScoreAdded(uint256 indexed epoch, uint72 indexed identityId, uint256 scoreAdded, uint256 totalScore);
    event AllNodesEpochScoreAdded(uint256 indexed epoch, uint256 scoreAdded, uint256 totalScore);
    event NodeEpochProofPeriodScoreAdded(
        uint256 indexed epoch,
        uint256 indexed proofPeriodStartBlock,
        uint72 indexed identityId,
        uint256 scoreAdded
    );
    event AllNodesEpochProofPeriodScoreAdded(
        uint256 indexed epoch,
        uint256 indexed proofPeriodStartBlock,
        uint256 scoreAdded,
        uint256 totalScore
    );
    event NodeEpochScorePerStakeUpdated(
        uint256 indexed epoch,
        uint72 indexed identityId,
        uint256 scoreAdded,
        uint256 totalNodeEpochScorePerStake
    );
    event EpochNodeDelegatorScoreAdded(
        uint256 indexed epoch,
        uint72 indexed identityId,
        bytes32 indexed delegatorKey,
        uint256 scoreAdded,
        uint256 totalScore
    );
    event DelegatorLastSettledNodeEpochScorePerStakeUpdated(
        uint256 indexed epoch,
        uint72 indexed identityId,
        bytes32 indexed delegatorKey,
        uint256 newDelegatorLastSettledNodeEpochScorePerStake
    );
    event NodeChallengeSet(uint72 indexed identityId, RandomSamplingLib.Challenge challenge);
    event ActiveProofPeriodStartBlockUpdated(uint256 indexed activeProofPeriodStartBlock);
    event EpochNodeValidProofsCountIncremented(uint256 indexed epoch, uint72 indexed identityId, uint256 newCount);

    constructor(
        address hubAddress,
        uint16 _proofingPeriodDurationInBlocks,
        uint8 _avgBlockTimeInSeconds,
        uint256 _w1,
        uint256 _w2
    ) ContractStatus(hubAddress) {
        require(_proofingPeriodDurationInBlocks > 0, "Proofing period duration in blocks must be greater than 0");
        require(_avgBlockTimeInSeconds > 0, "Average block time in seconds must be greater than 0");

        chronos = Chronos(hub.getContractAddress("Chronos"));

        proofingPeriodDurations.push(
            RandomSamplingLib.ProofingPeriodDuration({
                durationInBlocks: _proofingPeriodDurationInBlocks,
                effectiveEpoch: chronos.getCurrentEpoch()
            })
        );
        avgBlockTimeInSeconds = _avgBlockTimeInSeconds;
        w1 = _w1;
        w2 = _w2;

        emit ProofingPeriodDurationAdded(_proofingPeriodDurationInBlocks, chronos.getCurrentEpoch());
        emit AvgBlockTimeUpdated(_avgBlockTimeInSeconds);
        emit W1Updated(0, _w1);
        emit W2Updated(0, _w2);
    }

    // @dev Only transactions by HubController owner or one of the owners of the MultiSig Wallet
    modifier onlyOwnerOrMultiSigOwner() {
        _checkOwnerOrMultiSigOwner();
        _;
    }

    function initialize() external onlyHub {
        chronos = Chronos(hub.getContractAddress("Chronos"));
    }

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function setW1(uint256 _w1) external onlyOwnerOrMultiSigOwner {
        uint256 oldW1 = w1;
        w1 = _w1;
        emit W1Updated(oldW1, w1);
    }

    function getW1() external view returns (uint256) {
        return w1;
    }

    function setW2(uint256 _w2) external onlyOwnerOrMultiSigOwner {
        uint256 oldW2 = w2;
        w2 = _w2;
        emit W2Updated(oldW2, w2);
    }

    function getW2() external view returns (uint256) {
        return w2;
    }

    function setAvgBlockTimeInSeconds(uint8 blockTimeInSeconds) external onlyOwnerOrMultiSigOwner {
        require(blockTimeInSeconds > 0, "Block time in seconds must be greater than 0");
        avgBlockTimeInSeconds = blockTimeInSeconds;
        emit AvgBlockTimeUpdated(blockTimeInSeconds);
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

            emit ActiveProofPeriodStartBlockUpdated(activeProofPeriodStartBlock);
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

    function isPendingProofingPeriodDuration() external view returns (bool) {
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
        emit NodeChallengeSet(identityId, challenge);
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
        emit EpochNodeValidProofsCountIncremented(epoch, identityId, epochNodeValidProofsCount[epoch][identityId]);
    }

    function getEpochNodeValidProofsCount(uint256 epoch, uint72 identityId) external view returns (uint256) {
        return epochNodeValidProofsCount[epoch][identityId];
    }

    function addToNodeEpochScore(uint256 epoch, uint72 identityId, uint256 score) external onlyContracts {
        nodeEpochScore[identityId][epoch] += score;
        emit NodeEpochScoreAdded(epoch, identityId, score, nodeEpochScore[identityId][epoch]);
    }

    function getNodeEpochScore(uint256 epoch, uint72 identityId) external view returns (uint256) {
        return nodeEpochScore[identityId][epoch];
    }

    function addToAllNodesEpochScore(uint256 epoch, uint256 score) external onlyContracts {
        allNodesEpochScore[epoch] += score;
        emit AllNodesEpochScoreAdded(epoch, score, allNodesEpochScore[epoch]);
    }

    function getAllNodesEpochScore(uint256 epoch) external view returns (uint256) {
        return allNodesEpochScore[epoch];
    }

    function addToNodeEpochProofPeriodScore(
        uint256 epoch,
        uint256 proofPeriodStartBlock,
        uint72 identityId,
        uint256 score
    ) external onlyContracts {
        nodeEpochProofPeriodScore[identityId][epoch][proofPeriodStartBlock] += score;
        emit NodeEpochProofPeriodScoreAdded(epoch, proofPeriodStartBlock, identityId, score);
    }

    function addToAllNodesEpochProofPeriodScore(
        uint256 epoch,
        uint256 proofPeriodStartBlock,
        uint256 score
    ) external onlyContracts {
        allNodesEpochProofPeriodScore[epoch][proofPeriodStartBlock] += score;
        emit AllNodesEpochProofPeriodScoreAdded(
            epoch,
            proofPeriodStartBlock,
            score,
            allNodesEpochProofPeriodScore[epoch][proofPeriodStartBlock]
        );
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
        emit EpochNodeDelegatorScoreAdded(
            epoch,
            identityId,
            delegatorKey,
            score,
            epochNodeDelegatorScore[epoch][identityId][delegatorKey]
        );
    }

    function getNodeEpochScorePerStake(uint256 epoch, uint72 identityId) external view returns (uint256) {
        return nodeEpochScorePerStake[epoch][identityId];
    }

    function addToNodeEpochScorePerStake(
        uint256 epoch,
        uint72 identityId,
        uint256 scorePerStakeToAdd
    ) external onlyContracts {
        nodeEpochScorePerStake[epoch][identityId] += scorePerStakeToAdd;
        emit NodeEpochScorePerStakeUpdated(
            epoch,
            identityId,
            scorePerStakeToAdd,
            nodeEpochScorePerStake[epoch][identityId]
        );
    }

    function getDelegatorLastSettledNodeEpochScorePerStake(
        uint256 epoch,
        uint72 identityId,
        bytes32 delegatorKey
    ) external view returns (uint256) {
        return delegatorLastSettledNodeEpochScorePerStake[epoch][identityId][delegatorKey];
    }

    function setDelegatorLastSettledNodeEpochScorePerStake(
        uint256 epoch,
        uint72 identityId,
        bytes32 delegatorKey,
        uint256 newNodeEpochScorePerStake
    ) external onlyContracts {
        delegatorLastSettledNodeEpochScorePerStake[epoch][identityId][delegatorKey] = newNodeEpochScorePerStake;
        emit DelegatorLastSettledNodeEpochScorePerStakeUpdated(
            epoch,
            identityId,
            delegatorKey,
            newNodeEpochScorePerStake
        );
    }

    function _isMultiSigOwner(address multiSigAddress) internal view returns (bool) {
        try ICustodian(multiSigAddress).getOwners() returns (address[] memory multiSigOwners) {
            for (uint256 i = 0; i < multiSigOwners.length; i++) {
                if (msg.sender == multiSigOwners[i]) {
                    return true;
                }
            } // solhint-disable-next-line no-empty-blocks
        } catch {}

        return false;
    }

    function _checkOwnerOrMultiSigOwner() internal view virtual {
        address hubOwner = hub.owner();
        if (msg.sender != hubOwner && !_isMultiSigOwner(hubOwner)) {
            revert HubLib.UnauthorizedAccess("Only Hub Owner or Multisig Owner");
        }
    }
}
