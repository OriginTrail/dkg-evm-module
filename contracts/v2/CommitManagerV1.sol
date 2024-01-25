// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {HashingProxy} from "../v1/HashingProxy.sol";
import {ProximityScoringProxy} from "./ProximityScoringProxy.sol";
import {StakingV2} from "./Staking.sol";
import {IdentityStorageV2} from "./storage/IdentityStorage.sol";
import {ParametersStorage} from "../v1/storage/ParametersStorage.sol";
import {ProfileStorage} from "../v1/storage/ProfileStorage.sol";
import {ServiceAgreementStorageProxy} from "../v1/storage/ServiceAgreementStorageProxy.sol";
import {ShardingTableStorageV2} from "./storage/ShardingTableStorage.sol";
import {StakingStorage} from "../v1/storage/StakingStorage.sol";
import {ContractStatus} from "../v1/abstract/ContractStatus.sol";
import {Initializable} from "../v1/interface/Initializable.sol";
import {Named} from "../v1/interface/Named.sol";
import {Versioned} from "../v1/interface/Versioned.sol";
import {ServiceAgreementStructsV1} from "../v1/structs/ServiceAgreementStructsV1.sol";
import {ServiceAgreementStructsV2} from "./structs/ServiceAgreementStructsV2.sol";
import {ShardingTableStructsV2} from "../v2/structs/ShardingTableStructsV2.sol";
import {ContentAssetErrors} from "./errors/assets/ContentAssetErrors.sol";
import {GeneralErrors} from "../v1/errors/GeneralErrors.sol";
import {ServiceAgreementErrorsV1} from "../v1/errors/ServiceAgreementErrorsV1.sol";
import {ServiceAgreementErrorsV2} from "./errors/ServiceAgreementErrorsV2.sol";
import {CommitManagerErrorsV2} from "./errors/CommitManagerErrorsV2.sol";

contract CommitManagerV2 is Named, Versioned, ContractStatus, Initializable {
    event CommitSubmitted(
        address indexed assetContract,
        uint256 indexed tokenId,
        bytes keyword,
        uint8 hashFunctionId,
        uint16 epoch,
        uint72 indexed identityId,
        uint40 score
    );

    string private constant _NAME = "CommitManagerV1";
    string private constant _VERSION = "2.0.0";

    uint8 private constant LOG2PLDSF_ID = 1;

    bool[4] public reqs = [false, false, false, false];

    HashingProxy public hashingProxy;
    ProximityScoringProxy public proximityScoringProxy;
    StakingV2 public stakingContract;
    IdentityStorageV2 public identityStorage;
    ParametersStorage public parametersStorage;
    ProfileStorage public profileStorage;
    ServiceAgreementStorageProxy public serviceAgreementStorageProxy;
    ShardingTableStorageV2 public shardingTableStorage;
    StakingStorage public stakingStorage;

    uint256 constant HASH_RING_SIZE = type(uint256).max;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) ContractStatus(hubAddress) {}

    function initialize() public onlyHubOwner {
        hashingProxy = HashingProxy(hub.getContractAddress("HashingProxy"));
        proximityScoringProxy = ProximityScoringProxy(hub.getContractAddress("ScoringProxy"));
        stakingContract = StakingV2(hub.getContractAddress("Staking"));
        identityStorage = IdentityStorageV2(hub.getContractAddress("IdentityStorage"));
        parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));
        profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        serviceAgreementStorageProxy = ServiceAgreementStorageProxy(
            hub.getContractAddress("ServiceAgreementStorageProxy")
        );
        shardingTableStorage = ShardingTableStorageV2(hub.getContractAddress("ShardingTableStorage"));
        stakingStorage = StakingStorage(hub.getContractAddress("StakingStorage"));
    }

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function isCommitWindowOpen(bytes32 agreementId, uint16 epoch) public view returns (bool) {
        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;

        if (!sasProxy.agreementV1Exists(agreementId))
            revert ServiceAgreementErrorsV1.ServiceAgreementDoesntExist(agreementId);

        uint256 startTime = sasProxy.getAgreementStartTime(agreementId);

        ParametersStorage params = parametersStorage;
        uint128 epochLength = sasProxy.getAgreementEpochLength(agreementId);

        if (epoch >= sasProxy.getAgreementEpochsNumber(agreementId))
            revert ServiceAgreementErrorsV1.ServiceAgreementHasBeenExpired(
                agreementId,
                startTime,
                sasProxy.getAgreementEpochsNumber(agreementId),
                epochLength
            );

        uint256 timeNow = block.timestamp;
        uint256 commitWindowDuration = (params.commitWindowDurationPerc() * epochLength) / 100;

        if (epoch == 0) {
            return timeNow < (startTime + commitWindowDuration);
        }

        return (timeNow >= (startTime + epochLength * epoch) &&
            timeNow < (startTime + epochLength * epoch + commitWindowDuration));
    }

    function getTopCommitSubmissions(
        bytes32 agreementId,
        uint16 epoch
    ) external view returns (ServiceAgreementStructsV1.CommitSubmission[] memory) {
        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;

        if (!sasProxy.agreementV1Exists(agreementId))
            revert ServiceAgreementErrorsV1.ServiceAgreementDoesntExist(agreementId);
        if (epoch >= sasProxy.getAgreementEpochsNumber(agreementId))
            revert ServiceAgreementErrorsV1.ServiceAgreementHasBeenExpired(
                agreementId,
                sasProxy.getAgreementStartTime(agreementId),
                sasProxy.getAgreementEpochsNumber(agreementId),
                sasProxy.getAgreementEpochLength(agreementId)
            );

        uint32 r0 = parametersStorage.r0();

        ServiceAgreementStructsV1.CommitSubmission[]
            memory epochCommits = new ServiceAgreementStructsV1.CommitSubmission[](r0);

        bytes32 epochSubmissionsHead = sasProxy.getV1AgreementEpochSubmissionHead(agreementId, epoch);

        epochCommits[0] = sasProxy.getCommitSubmission(epochSubmissionsHead);

        bytes32 commitId;
        uint72 nextIdentityId = epochCommits[0].nextIdentityId;
        uint8 submissionsIdx = 1;
        while ((submissionsIdx < r0) && (nextIdentityId != 0)) {
            commitId = keccak256(abi.encodePacked(agreementId, epoch, nextIdentityId));
            epochCommits[submissionsIdx] = sasProxy.getCommitSubmission(commitId);

            nextIdentityId = epochCommits[submissionsIdx].nextIdentityId;

            unchecked {
                submissionsIdx++;
            }
        }

        return epochCommits;
    }

    function submitCommit(ServiceAgreementStructsV2.CommitInputArgs calldata args) external {
        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;
        ShardingTableStorageV2 sts = shardingTableStorage;
        ProfileStorage ps = profileStorage;

        bytes32 agreementId = hashingProxy.callHashFunction(
            args.hashFunctionId,
            abi.encodePacked(args.assetContract, args.tokenId, args.keyword)
        );

        if (!sasProxy.agreementV1Exists(agreementId))
            revert ServiceAgreementErrorsV1.ServiceAgreementDoesntExist(agreementId);

        uint8 proximityScoreFunctionPairId = sasProxy.getAgreementScoreFunctionId(agreementId);

        if (proximityScoreFunctionPairId == LOG2PLDSF_ID)
            revert ServiceAgreementErrorsV2.InvalidProximityScoreFunctionsPairId(
                agreementId,
                args.epoch,
                proximityScoreFunctionPairId,
                block.timestamp
            );

        if (!reqs[0] && !isCommitWindowOpen(agreementId, args.epoch)) {
            uint128 epochLength = sasProxy.getAgreementEpochLength(agreementId);

            uint256 actualCommitWindowStart = (sasProxy.getAgreementStartTime(agreementId) + args.epoch * epochLength);

            revert ServiceAgreementErrorsV1.CommitWindowClosed(
                agreementId,
                args.epoch,
                actualCommitWindowStart,
                actualCommitWindowStart + (parametersStorage.commitWindowDurationPerc() * epochLength) / 100,
                block.timestamp
            );
        }

        uint72 identityId = identityStorage.getIdentityId(msg.sender);

        if (!reqs[1] && !sts.nodeExists(identityId)) {
            revert ServiceAgreementErrorsV1.NodeNotInShardingTable(
                identityId,
                ps.getNodeId(identityId),
                ps.getAsk(identityId),
                stakingStorage.totalStakes(identityId)
            );
        }

        ShardingTableStructsV2.Node memory closestNode = sts.getNodeByIndex(args.closestNodeIndex);
        ShardingTableStructsV2.Node memory leftEdgeNode = sts.getNodeByIndex(args.leftEdgeNodeIndex);
        ShardingTableStructsV2.Node memory rightEdgeNode = sts.getNodeByIndex(args.rightEdgeNodeIndex);

        // Verify that closestNode is in smaller arc between leftNode and rightNode
        bool isBetween = (leftEdgeNode.hashRingPosition <= rightEdgeNode.hashRingPosition)
            ? (closestNode.hashRingPosition >= leftEdgeNode.hashRingPosition &&
                closestNode.hashRingPosition <= rightEdgeNode.hashRingPosition)
            : (leftEdgeNode.hashRingPosition <= closestNode.hashRingPosition ||
                closestNode.hashRingPosition <= rightEdgeNode.hashRingPosition);

        if (!isBetween) {
            revert CommitManagerErrorsV2.ClosestNodeNotInNeighborhood(
                agreementId,
                args.epoch,
                args.closestNodeIndex,
                args.leftEdgeNodeIndex,
                args.rightEdgeNodeIndex,
                block.timestamp
            );
        }

        // Verify number of nodes between leftNode and rightNode (should be R2)
        uint72 nodesCount = sts.nodesCount();
        uint72 nodesInBetweenClockwise = (
            (rightEdgeNode.index > leftEdgeNode.index)
                ? rightEdgeNode.index - leftEdgeNode.index - 1
                : leftEdgeNode.index - rightEdgeNode.index - 1
        );
        uint72 neighborhoodSize = (nodesInBetweenClockwise < nodesCount - 2 - nodesInBetweenClockwise)
            ? nodesInBetweenClockwise + 2
            : nodesCount - nodesInBetweenClockwise;

        if (neighborhoodSize != parametersStorage.r2()) {
            revert CommitManagerErrorsV2.InvalidNeighborhoodSize(
                agreementId,
                args.epoch,
                args.leftEdgeNodeIndex,
                args.rightEdgeNodeIndex,
                nodesCount,
                parametersStorage.r2(),
                neighborhoodSize,
                block.timestamp
            );
        }

        // Verify that closestNode is indeed closest
        uint256 closestDistance = proximityScoringProxy.callProximityFunction(
            proximityScoreFunctionPairId,
            args.hashFunctionId,
            args.keyword,
            ps.getNodeId(closestNode.identityId)
        );

        if (
            closestDistance >
            proximityScoringProxy.callProximityFunction(
                proximityScoreFunctionPairId,
                args.hashFunctionId,
                args.keyword,
                ps.getNodeId(closestNode.prevIdentityId)
            ) ||
            closestDistance >
            proximityScoringProxy.callProximityFunction(
                proximityScoreFunctionPairId,
                args.hashFunctionId,
                args.keyword,
                ps.getNodeId(closestNode.nextIdentityId)
            )
        ) {
            revert CommitManagerErrorsV2.InvalidClosestNode(
                agreementId,
                args.epoch,
                args.closestNodeIndex,
                closestDistance,
                proximityScoringProxy.callProximityFunction(
                    proximityScoreFunctionPairId,
                    args.hashFunctionId,
                    args.keyword,
                    ps.getNodeId(closestNode.prevIdentityId)
                ),
                proximityScoringProxy.callProximityFunction(
                    proximityScoreFunctionPairId,
                    args.hashFunctionId,
                    args.keyword,
                    ps.getNodeId(closestNode.nextIdentityId)
                ),
                block.timestamp
            );
        }

        // Verify that leftNode is indeed the left edge of the Neighborhood
        uint256 leftEdgeDistance = proximityScoringProxy.callProximityFunction(
            proximityScoreFunctionPairId,
            args.hashFunctionId,
            args.keyword,
            ps.getNodeId(leftEdgeNode.identityId)
        );

        if (
            leftEdgeDistance >
            proximityScoringProxy.callProximityFunction(
                proximityScoreFunctionPairId,
                args.hashFunctionId,
                args.keyword,
                ps.getNodeId(rightEdgeNode.nextIdentityId)
            )
        ) {
            revert CommitManagerErrorsV2.InvalidLeftEdgeNode(
                agreementId,
                args.epoch,
                args.leftEdgeNodeIndex,
                leftEdgeDistance,
                proximityScoringProxy.callProximityFunction(
                    proximityScoreFunctionPairId,
                    args.hashFunctionId,
                    args.keyword,
                    ps.getNodeId(rightEdgeNode.nextIdentityId)
                ),
                block.timestamp
            );
        }

        // Verify that rightNode is indeed the right edge of the Neighborhood
        uint256 rightEdgeDistance = proximityScoringProxy.callProximityFunction(
            proximityScoreFunctionPairId,
            args.hashFunctionId,
            args.keyword,
            ps.getNodeId(rightEdgeNode.identityId)
        );

        if (
            rightEdgeDistance >
            proximityScoringProxy.callProximityFunction(
                proximityScoreFunctionPairId,
                args.hashFunctionId,
                args.keyword,
                ps.getNodeId(leftEdgeNode.prevIdentityId)
            )
        ) {
            revert CommitManagerErrorsV2.InvalidRightEdgeNode(
                agreementId,
                args.epoch,
                args.rightEdgeNodeIndex,
                rightEdgeDistance,
                proximityScoringProxy.callProximityFunction(
                    proximityScoreFunctionPairId,
                    args.hashFunctionId,
                    args.keyword,
                    ps.getNodeId(leftEdgeNode.prevIdentityId)
                ),
                block.timestamp
            );
        }

        uint256 distance = proximityScoringProxy.callProximityFunction(
            proximityScoreFunctionPairId,
            args.hashFunctionId,
            args.keyword,
            ps.getNodeId(identityId)
        );
        uint256 maxDistance = (leftEdgeDistance > rightEdgeDistance) ? leftEdgeDistance : rightEdgeDistance;

        uint40 score = proximityScoringProxy.callScoreFunction(
            proximityScoreFunctionPairId,
            distance,
            maxDistance,
            nodesCount,
            stakingStorage.totalStakes(identityId)
        );

        _insertCommit(agreementId, args.epoch, identityId, 0, 0, score);

        emit CommitSubmitted(
            args.assetContract,
            args.tokenId,
            args.keyword,
            args.hashFunctionId,
            args.epoch,
            identityId,
            score
        );
    }

    function setReq(uint256 index, bool req) external onlyHubOwner {
        reqs[index] = req;
    }

    function _insertCommit(
        bytes32 agreementId,
        uint16 epoch,
        uint72 identityId,
        uint72 prevIdentityId,
        uint72 nextIdentityId,
        uint40 score
    ) internal virtual {
        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;

        bytes32 commitId = keccak256(abi.encodePacked(agreementId, epoch, identityId));

        if (!reqs[2] && sasProxy.commitSubmissionExists(commitId))
            revert ServiceAgreementErrorsV1.NodeAlreadySubmittedCommit(
                agreementId,
                epoch,
                identityId,
                profileStorage.getNodeId(identityId)
            );

        bytes32 refCommitId = sasProxy.getV1AgreementEpochSubmissionHead(agreementId, epoch);

        ParametersStorage params = parametersStorage;

        uint72 refCommitNextIdentityId = sasProxy.getCommitSubmissionNextIdentityId(refCommitId);
        uint32 r0 = params.r0();
        uint8 i;
        while ((score < sasProxy.getCommitSubmissionScore(refCommitId)) && (refCommitNextIdentityId != 0) && (i < r0)) {
            refCommitId = keccak256(abi.encodePacked(agreementId, epoch, refCommitNextIdentityId));

            refCommitNextIdentityId = sasProxy.getCommitSubmissionNextIdentityId(refCommitId);
            unchecked {
                i++;
            }
        }

        if (!reqs[3] && (i >= r0))
            revert ServiceAgreementErrorsV1.NodeNotAwarded(
                agreementId,
                epoch,
                identityId,
                profileStorage.getNodeId(identityId),
                i
            );

        sasProxy.createV1CommitSubmissionObject(commitId, identityId, prevIdentityId, nextIdentityId, score);

        ServiceAgreementStructsV1.CommitSubmission memory refCommit = sasProxy.getCommitSubmission(refCommitId);

        if ((i == 0) && (refCommit.identityId == 0)) {
            //  No head -> Setting new head
            sasProxy.setV1AgreementEpochSubmissionHead(agreementId, epoch, commitId);
        } else if ((i == 0) && (score <= refCommit.score)) {
            // There is a head with higher or equal score, add new commit on the right
            _linkCommits(agreementId, epoch, refCommit.identityId, identityId);
        } else if ((i == 0) && (score > refCommit.score)) {
            // There is a head with lower score, replace the head
            sasProxy.setV1AgreementEpochSubmissionHead(agreementId, epoch, commitId);
            _linkCommits(agreementId, epoch, identityId, refCommit.identityId);
        } else if (score > refCommit.score) {
            // [H] - head
            // [RC] - reference commit
            // [RC-] - commit before reference commit
            // [RC+] - commit after reference commit
            // [NC] - new commit
            // [] <-> [H] <-> [X] ... [RC-] <-> [RC] <-> [RC+] ... [C] <-> []
            // [] <-> [H] <-> [X] ... [RC-] <-(NL)-> [NC] <-(NL)-> [RC] <-> [RC+] ... [C] <-> []
            _linkCommits(agreementId, epoch, refCommit.prevIdentityId, identityId);
            _linkCommits(agreementId, epoch, identityId, refCommit.identityId);
        } else {
            // [] <-> [H] <-> [RC] <-> []
            // [] <-> [H] <-> [RC] <-(NL)-> [NC] <-> []
            _linkCommits(agreementId, epoch, refCommit.identityId, identityId);
        }
    }

    function _linkCommits(
        bytes32 agreementId,
        uint16 epoch,
        uint72 leftIdentityId,
        uint72 rightIdentityId
    ) internal virtual {
        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;

        sasProxy.setCommitSubmissionNextIdentityId(
            keccak256(abi.encodePacked(agreementId, epoch, leftIdentityId)), // leftCommitId
            rightIdentityId
        );

        sasProxy.setCommitSubmissionPrevIdentityId(
            keccak256(abi.encodePacked(agreementId, epoch, rightIdentityId)), // rightCommitId
            leftIdentityId
        );
    }
}
