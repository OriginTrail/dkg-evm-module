// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {HashingProxy} from "../v1/HashingProxy.sol";
import {Log2PLDSF} from "../v1/scoring/log2pldsf.sol";
import {LinearSum} from "./scoring/LinearSum.sol";
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
import {CommitManagerErrorsV2} from "./errors/CommitManagerErrorsV2.sol";
import {ContentAssetErrors} from "./errors/assets/ContentAssetErrors.sol";
import {GeneralErrors} from "../v1/errors/GeneralErrors.sol";
import {ServiceAgreementErrorsV1} from "../v1/errors/ServiceAgreementErrorsV1.sol";
import {ServiceAgreementErrorsV2} from "./errors/ServiceAgreementErrorsV2.sol";
import {NULL} from "../v1/constants/ShardingTableConstants.sol";

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

    uint8 private constant _LOG2PLDSF_ID = 1;
    uint8 private constant _LINEAR_SUM_ID = 2;

    bool[4] public reqs = [false, false, false, false];

    HashingProxy public hashingProxy;

    Log2PLDSF public log2pldsf;
    LinearSum public linearSum;
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
        log2pldsf = Log2PLDSF(
            ProximityScoringProxy(hub.getContractAddress("ScoringProxy")).getScoreFunctionContractAddress(_LOG2PLDSF_ID)
        );
        linearSum = LinearSum(
            ProximityScoringProxy(hub.getContractAddress("ScoringProxy")).getScoreFunctionContractAddress(
                _LINEAR_SUM_ID
            )
        );
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

        if (epoch == 0) return timeNow < (startTime + commitWindowDuration);

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

    function submitCommit(ServiceAgreementStructsV1.CommitInputArgs calldata args) external {
        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;

        bytes32 agreementId = hashingProxy.callHashFunction(
            args.hashFunctionId,
            abi.encodePacked(args.assetContract, args.tokenId, args.keyword)
        );

        if (!sasProxy.agreementV1Exists(agreementId))
            revert ServiceAgreementErrorsV1.ServiceAgreementDoesntExist(agreementId);

        if (sasProxy.getAgreementScoreFunctionId(agreementId) != _LOG2PLDSF_ID)
            revert ServiceAgreementErrorsV1.InvalidScoreFunctionId(
                agreementId,
                args.epoch,
                sasProxy.getAgreementScoreFunctionId(agreementId),
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

        if (!reqs[1] && !shardingTableStorage.nodeExists(identityId)) {
            ProfileStorage ps = profileStorage;

            revert ServiceAgreementErrorsV1.NodeNotInShardingTable(
                identityId,
                ps.getNodeId(identityId),
                ps.getAsk(identityId),
                stakingStorage.totalStakes(identityId)
            );
        }

        Log2PLDSF l2p = log2pldsf;

        uint40 score = l2p.calculateScore(
            l2p.calculateDistance(args.hashFunctionId, profileStorage.getNodeId(identityId), args.keyword),
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

    function submitCommit(ServiceAgreementStructsV2.CommitInputArgs calldata args) external {
        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;

        bytes32 agreementId = hashingProxy.callHashFunction(
            args.hashFunctionId,
            abi.encodePacked(args.assetContract, args.tokenId, args.keyword)
        );

        if (!sasProxy.agreementV1Exists(agreementId))
            revert ServiceAgreementErrorsV1.ServiceAgreementDoesntExist(agreementId);

        if (sasProxy.getAgreementScoreFunctionId(agreementId) != _LINEAR_SUM_ID)
            revert ServiceAgreementErrorsV2.InvalidProximityScoreFunctionsPairId(
                agreementId,
                args.epoch,
                sasProxy.getAgreementScoreFunctionId(agreementId),
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

        if (!reqs[1] && !shardingTableStorage.nodeExists(identityId)) {
            ProfileStorage ps = profileStorage;

            revert ServiceAgreementErrorsV1.NodeNotInShardingTable(
                identityId,
                ps.getNodeId(identityId),
                ps.getAsk(identityId),
                stakingStorage.totalStakes(identityId)
            );
        }

        (uint72 nodesCount, uint256 maxDistance) = _verifyNeighborhood(
            agreementId,
            args.epoch,
            args.hashFunctionId,
            args.keyword,
            args.closestNodeIndex,
            args.leftEdgeNodeIndex,
            args.rightEdgeNodeIndex
        );

        LinearSum ls = linearSum;

        uint256 distance = ls.calculateDistance(
            args.hashFunctionId,
            profileStorage.getNodeId(identityId),
            args.keyword
        );

        uint40 score = ls.calculateScore(distance, maxDistance, nodesCount, stakingStorage.totalStakes(identityId));

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

    function _verifyNeighborhood(
        bytes32 agreementId,
        uint16 epoch,
        uint8 hashFunctionId,
        bytes calldata keyword,
        uint72 closestNodeIndex,
        uint72 leftEdgeNodeIndex,
        uint72 rightEdgeNodeIndex
    ) internal virtual returns (uint72, uint256) {
        ShardingTableStorageV2 sts = shardingTableStorage;
        ProfileStorage ps = profileStorage;
        LinearSum ls = linearSum;

        (
            ShardingTableStructsV2.Node memory leftEdgeNode,
            ShardingTableStructsV2.Node memory closestNode,
            ShardingTableStructsV2.Node memory rightEdgeNode
        ) = sts.getNeighborhoodBoundaryByIndexes(leftEdgeNodeIndex, closestNodeIndex, rightEdgeNodeIndex);

        bool isBetween = (leftEdgeNode.hashRingPosition <= rightEdgeNode.hashRingPosition)
            ? (closestNode.hashRingPosition >= leftEdgeNode.hashRingPosition &&
                closestNode.hashRingPosition <= rightEdgeNode.hashRingPosition)
            : (leftEdgeNode.hashRingPosition <= closestNode.hashRingPosition ||
                closestNode.hashRingPosition <= rightEdgeNode.hashRingPosition);

        uint72 nodesCount = sts.nodesCount();
        uint72 nodesInBetweenClockwise = (
            (rightEdgeNode.index > leftEdgeNode.index)
                ? rightEdgeNode.index - leftEdgeNode.index - 1
                : leftEdgeNode.index - rightEdgeNode.index - 1
        );
        uint72 neighborhoodSize = (nodesInBetweenClockwise < nodesCount - 2 - nodesInBetweenClockwise)
            ? nodesInBetweenClockwise + 2
            : nodesCount - nodesInBetweenClockwise;

        (uint72 closestPrevIdentityId, uint72 closestNextIdentityId) = sts.getAdjacentIdentityIdsByIndex(
            closestNodeIndex
        );
        uint72 rightEdgeNextIdentityId = sts.indexToIdentityId(rightEdgeNodeIndex + 1);
        uint72 leftEdgePrevIdentityId = leftEdgeNodeIndex != 0 ? sts.indexToIdentityId(leftEdgeNodeIndex - 1) : NULL;

        (uint256 leftEdgeDistance, uint256 closestDistance, uint256 rightEdgeDistance) = ls
            .calculateNeighborhoodBoundaryDistances(
                hashFunctionId,
                ps.getNodeId(leftEdgeNode.identityId),
                ps.getNodeId(closestNode.identityId),
                ps.getNodeId(rightEdgeNode.identityId),
                keyword
            );

        // Verify that closestNode is in smaller arc between leftNode and rightNode
        if (!isBetween)
            revert CommitManagerErrorsV2.ClosestNodeNotInNeighborhood(
                agreementId,
                epoch,
                closestNodeIndex,
                leftEdgeNodeIndex,
                rightEdgeNodeIndex,
                block.timestamp
            );

        // Verify number of nodes between leftNode and rightNode (should be R2)
        if (neighborhoodSize != parametersStorage.r2())
            revert CommitManagerErrorsV2.InvalidNeighborhoodSize(
                agreementId,
                epoch,
                leftEdgeNodeIndex,
                rightEdgeNodeIndex,
                nodesCount,
                parametersStorage.r2(),
                neighborhoodSize,
                block.timestamp
            );

        // Verify that closestNode is indeed closest
        if (
            closestDistance > ls.calculateDistance(hashFunctionId, keyword, ps.getNodeId(closestPrevIdentityId)) ||
            closestDistance > ls.calculateDistance(hashFunctionId, keyword, ps.getNodeId(closestNextIdentityId))
        )
            revert CommitManagerErrorsV2.InvalidClosestNode(
                agreementId,
                epoch,
                closestNodeIndex,
                closestDistance,
                ls.calculateDistance(hashFunctionId, keyword, ps.getNodeId(closestPrevIdentityId)),
                ls.calculateDistance(hashFunctionId, keyword, ps.getNodeId(closestNextIdentityId)),
                block.timestamp
            );

        // Verify that leftNode is indeed the left edge of the Neighborhood
        if (leftEdgeDistance > ls.calculateDistance(hashFunctionId, keyword, ps.getNodeId(rightEdgeNextIdentityId)))
            revert CommitManagerErrorsV2.InvalidLeftEdgeNode(
                agreementId,
                epoch,
                leftEdgeNodeIndex,
                leftEdgeDistance,
                ls.calculateDistance(hashFunctionId, keyword, ps.getNodeId(rightEdgeNextIdentityId)),
                block.timestamp
            );

        // Verify that rightNode is indeed the right edge of the Neighborhood
        if (rightEdgeDistance > ls.calculateDistance(hashFunctionId, keyword, ps.getNodeId(leftEdgePrevIdentityId)))
            revert CommitManagerErrorsV2.InvalidRightEdgeNode(
                agreementId,
                epoch,
                rightEdgeNodeIndex,
                rightEdgeDistance,
                ls.calculateDistance(hashFunctionId, keyword, ps.getNodeId(leftEdgePrevIdentityId)),
                block.timestamp
            );

        return (nodesCount, (leftEdgeDistance > rightEdgeDistance) ? leftEdgeDistance : rightEdgeDistance);
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

        if ((i == 0) && (refCommit.identityId == 0))
            //  No head -> Setting new head
            sasProxy.setV1AgreementEpochSubmissionHead(agreementId, epoch, commitId);
        else if ((i == 0) && (score <= refCommit.score))
            // There is a head with higher or equal score, add new commit on the right
            _linkCommits(agreementId, epoch, refCommit.identityId, identityId);
        else if ((i == 0) && (score > refCommit.score)) {
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
        }
        // [] <-> [H] <-> [RC] <-> []
        // [] <-> [H] <-> [RC] <-(NL)-> [NC] <-> []
        else _linkCommits(agreementId, epoch, refCommit.identityId, identityId);
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
