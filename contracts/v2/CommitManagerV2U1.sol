// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {HashingProxy} from "../v1/HashingProxy.sol";
import {ProximityScoringProxy} from "./ProximityScoringProxy.sol";
import {StakingV2} from "./Staking.sol";
import {ContentAssetStorageV2} from "./storage/assets/ContentAssetStorage.sol";
import {IdentityStorageV2} from "./storage/IdentityStorage.sol";
import {ParametersStorage} from "../v1/storage/ParametersStorage.sol";
import {ProfileStorage} from "../v1/storage/ProfileStorage.sol";
import {ServiceAgreementStorageProxy} from "../v1/storage/ServiceAgreementStorageProxy.sol";
import {ShardingTableStorageV2} from "./storage/ShardingTableStorage.sol";
import {StakingStorage} from "../v1/storage/StakingStorage.sol";
import {UnfinalizedStateStorage} from "../v1/storage/UnfinalizedStateStorage.sol";
import {AbstractAsset} from "../v1/abstract/AbstractAsset.sol";
import {ContractStatus} from "../v1/abstract/ContractStatus.sol";
import {Initializable} from "../v1/interface/Initializable.sol";
import {Named} from "../v1/interface/Named.sol";
import {Versioned} from "../v1/interface/Versioned.sol";
import {ServiceAgreementStructsV1} from "../v1/structs/ServiceAgreementStructsV1.sol";
import {ServiceAgreementStructsV2} from "./structs/ServiceAgreementStructsV2.sol";
import {ShardingTableStructsV2} from "./structs/ShardingTableStructsV2.sol";
import {CommitManagerErrorsV2} from "./errors/CommitManagerErrorsV2.sol";
import {ContentAssetErrors} from "./errors/assets/ContentAssetErrors.sol";
import {GeneralErrors} from "../v1/errors/GeneralErrors.sol";
import {ServiceAgreementErrorsV1} from "../v1/errors/ServiceAgreementErrorsV1.sol";
import {ServiceAgreementErrorsV1U1} from "../v1/errors/ServiceAgreementErrorsV1U1.sol";
import {ServiceAgreementErrorsV2} from "./errors/ServiceAgreementErrorsV2.sol";

contract CommitManagerV2U1 is Named, Versioned, ContractStatus, Initializable {
    event CommitSubmitted(
        address indexed assetContract,
        uint256 indexed tokenId,
        bytes keyword,
        uint8 hashFunctionId,
        uint16 epoch,
        uint256 stateIndex,
        uint72 indexed identityId,
        uint40 score
    );
    event StateFinalized(
        address indexed assetContract,
        uint256 indexed tokenId,
        bytes keyword,
        uint8 hashFunctionId,
        uint16 epoch,
        uint256 stateIndex,
        bytes32 state
    );

    string private constant _NAME = "CommitManagerV1U1";
    string private constant _VERSION = "2.0.0";

    uint8 private constant _LOG2PLDSF_ID = 1;

    bool[6] public reqs = [false, false, false, false, false, false];

    HashingProxy public hashingProxy;
    ProximityScoringProxy public proximityScoringProxy;
    StakingV2 public stakingContract;
    ContentAssetStorageV2 public contentAssetStorage;
    IdentityStorageV2 public identityStorage;
    ParametersStorage public parametersStorage;
    ProfileStorage public profileStorage;
    ServiceAgreementStorageProxy public serviceAgreementStorageProxy;
    ShardingTableStorageV2 public shardingTableStorage;
    StakingStorage public stakingStorage;
    UnfinalizedStateStorage public unfinalizedStateStorage;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) ContractStatus(hubAddress) {}

    function initialize() public onlyHubOwner {
        hashingProxy = HashingProxy(hub.getContractAddress("HashingProxy"));
        proximityScoringProxy = ProximityScoringProxy(hub.getContractAddress("ScoringProxy"));
        stakingContract = StakingV2(hub.getContractAddress("Staking"));
        contentAssetStorage = ContentAssetStorageV2(hub.getAssetStorageAddress("ContentAssetStorage"));
        identityStorage = IdentityStorageV2(hub.getContractAddress("IdentityStorage"));
        parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));
        profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        serviceAgreementStorageProxy = ServiceAgreementStorageProxy(
            hub.getContractAddress("ServiceAgreementStorageProxy")
        );
        shardingTableStorage = ShardingTableStorageV2(hub.getContractAddress("ShardingTableStorage"));
        stakingStorage = StakingStorage(hub.getContractAddress("StakingStorage"));
        unfinalizedStateStorage = UnfinalizedStateStorage(hub.getContractAddress("UnfinalizedStateStorage"));
    }

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function isCommitWindowOpen(bytes32 agreementId, uint16 epoch) public view returns (bool) {
        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;

        if (sasProxy.agreementV1Exists(agreementId) || !sasProxy.agreementV1U1Exists(agreementId))
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

    function isUpdateCommitWindowOpen(
        bytes32 agreementId,
        uint16 epoch,
        uint256 stateIndex
    ) public view returns (bool) {
        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;

        uint128 epochLength = sasProxy.getAgreementEpochLength(agreementId);

        if (!sasProxy.agreementV1U1Exists(agreementId))
            revert ServiceAgreementErrorsV1.ServiceAgreementDoesntExist(agreementId);
        if (epoch >= sasProxy.getAgreementEpochsNumber(agreementId))
            revert ServiceAgreementErrorsV1.ServiceAgreementHasBeenExpired(
                agreementId,
                sasProxy.getAgreementStartTime(agreementId),
                sasProxy.getAgreementEpochsNumber(agreementId),
                epochLength
            );

        uint256 commitWindowEnd = sasProxy.getUpdateCommitsDeadline(
            keccak256(abi.encodePacked(agreementId, stateIndex))
        );

        return block.timestamp < commitWindowEnd;
    }

    function getTopCommitSubmissions(
        bytes32 agreementId,
        uint16 epoch,
        uint256 stateIndex
    ) external view returns (ServiceAgreementStructsV1.CommitSubmission[] memory) {
        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;

        if (sasProxy.agreementV1Exists(agreementId) || !sasProxy.agreementV1U1Exists(agreementId))
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
            memory epochStateCommits = new ServiceAgreementStructsV1.CommitSubmission[](r0);

        bytes32 epochSubmissionsHead = sasProxy.getV1U1AgreementEpochSubmissionHead(agreementId, epoch, stateIndex);

        epochStateCommits[0] = sasProxy.getCommitSubmission(epochSubmissionsHead);

        bytes32 commitId;
        uint72 nextIdentityId = epochStateCommits[0].nextIdentityId;
        uint8 submissionsIdx = 1;
        while ((submissionsIdx < r0) && (nextIdentityId != 0)) {
            commitId = keccak256(abi.encodePacked(agreementId, epoch, stateIndex, nextIdentityId));
            epochStateCommits[submissionsIdx] = sasProxy.getCommitSubmission(commitId);

            nextIdentityId = epochStateCommits[submissionsIdx].nextIdentityId;

            unchecked {
                submissionsIdx++;
            }
        }

        return epochStateCommits;
    }

    function submitCommit(ServiceAgreementStructsV2.CommitInputArgs calldata args) external {
        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;

        bytes32 agreementId = hashingProxy.callHashFunction(
            args.hashFunctionId,
            abi.encodePacked(args.assetContract, args.tokenId, args.keyword)
        );

        if (sasProxy.agreementV1Exists(agreementId) || !sasProxy.agreementV1U1Exists(agreementId))
            revert ServiceAgreementErrorsV1.ServiceAgreementDoesntExist(agreementId);

        uint8 proximityScoreFunctionPairId = sasProxy.getAgreementScoreFunctionId(agreementId);

        if (proximityScoreFunctionPairId == _LOG2PLDSF_ID)
            revert ServiceAgreementErrorsV2.InvalidProximityScoreFunctionsPairId(
                agreementId,
                args.epoch,
                proximityScoreFunctionPairId,
                block.timestamp
            );

        uint256 latestFinalizedStateIndex = AbstractAsset(args.assetContract).getAssertionIdsLength(args.tokenId) - 1;

        if (!reqs[0] && !isCommitWindowOpen(agreementId, args.epoch)) {
            uint128 epochLength = sasProxy.getAgreementEpochLength(agreementId);

            uint256 actualCommitWindowStart = (sasProxy.getAgreementStartTime(agreementId) + args.epoch * epochLength);

            revert ServiceAgreementErrorsV1U1.CommitWindowClosed(
                agreementId,
                args.epoch,
                latestFinalizedStateIndex,
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
            proximityScoreFunctionPairId,
            args.hashFunctionId,
            args.keyword,
            args.closestNodeIndex,
            args.leftEdgeNodeIndex,
            args.rightEdgeNodeIndex
        );

        uint256 distance = proximityScoringProxy.callProximityFunction(
            proximityScoreFunctionPairId,
            args.hashFunctionId,
            args.keyword,
            profileStorage.getNodeId(identityId)
        );

        uint40 score = proximityScoringProxy.callScoreFunction(
            proximityScoreFunctionPairId,
            distance,
            maxDistance,
            nodesCount,
            stakingStorage.totalStakes(identityId)
        );

        _insertCommit(agreementId, args.epoch, latestFinalizedStateIndex, identityId, 0, 0, score);

        emit CommitSubmitted(
            args.assetContract,
            args.tokenId,
            args.keyword,
            args.hashFunctionId,
            args.epoch,
            latestFinalizedStateIndex,
            identityId,
            score
        );
    }

    function submitUpdateCommit(ServiceAgreementStructsV2.CommitInputArgs calldata args) external {
        UnfinalizedStateStorage uss = unfinalizedStateStorage;
        AbstractAsset generalAssetInterface = AbstractAsset(args.assetContract);

        bytes32 unfinalizedState = uss.getUnfinalizedState(args.tokenId);
        uint256 unfinalizedStateIndex = generalAssetInterface.getAssertionIdsLength(args.tokenId);

        if (uss.getUnfinalizedState(args.tokenId) == bytes32(0))
            revert ServiceAgreementErrorsV1U1.NoPendingUpdate(args.assetContract, args.tokenId);

        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;

        bytes32 agreementId = hashingProxy.callHashFunction(
            args.hashFunctionId,
            abi.encodePacked(args.assetContract, args.tokenId, args.keyword)
        );

        if (!sasProxy.agreementV1U1Exists(agreementId))
            revert ServiceAgreementErrorsV1.ServiceAgreementDoesntExist(agreementId);

        uint8 proximityScoreFunctionPairId = sasProxy.getAgreementScoreFunctionId(agreementId);

        if (proximityScoreFunctionPairId == _LOG2PLDSF_ID)
            revert ServiceAgreementErrorsV2.InvalidProximityScoreFunctionsPairId(
                agreementId,
                args.epoch,
                proximityScoreFunctionPairId,
                block.timestamp
            );

        if (!reqs[2] && !isUpdateCommitWindowOpen(agreementId, args.epoch, unfinalizedStateIndex)) {
            uint256 commitWindowEnd = sasProxy.getUpdateCommitsDeadline(
                keccak256(abi.encodePacked(agreementId, unfinalizedStateIndex))
            );

            revert ServiceAgreementErrorsV1U1.CommitWindowClosed(
                agreementId,
                args.epoch,
                unfinalizedStateIndex,
                commitWindowEnd - parametersStorage.updateCommitWindowDuration(),
                commitWindowEnd,
                block.timestamp
            );
        }

        uint72 identityId = identityStorage.getIdentityId(msg.sender);

        if (!reqs[3] && !shardingTableStorage.nodeExists(identityId)) {
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
            proximityScoreFunctionPairId,
            args.hashFunctionId,
            args.keyword,
            args.closestNodeIndex,
            args.leftEdgeNodeIndex,
            args.rightEdgeNodeIndex
        );

        uint256 distance = proximityScoringProxy.callProximityFunction(
            proximityScoreFunctionPairId,
            args.hashFunctionId,
            args.keyword,
            profileStorage.getNodeId(identityId)
        );

        uint40 score = proximityScoringProxy.callScoreFunction(
            proximityScoreFunctionPairId,
            distance,
            maxDistance,
            nodesCount,
            stakingStorage.totalStakes(identityId)
        );

        _insertCommit(agreementId, args.epoch, unfinalizedStateIndex, identityId, 0, 0, score);

        emit CommitSubmitted(
            args.assetContract,
            args.tokenId,
            args.keyword,
            args.hashFunctionId,
            args.epoch,
            unfinalizedStateIndex,
            identityId,
            score
        );

        if (
            sasProxy.getCommitsCount(keccak256(abi.encodePacked(agreementId, args.epoch, unfinalizedStateIndex))) ==
            parametersStorage.finalizationCommitsNumber()
        ) {
            if (sasProxy.agreementV1Exists(agreementId)) sasProxy.migrateV1ServiceAgreement(agreementId);

            sasProxy.setAgreementTokenAmount(
                agreementId,
                sasProxy.getAgreementTokenAmount(agreementId) + sasProxy.getAgreementUpdateTokenAmount(agreementId)
            );
            sasProxy.setAgreementUpdateTokenAmount(agreementId, 0);

            ContentAssetStorageV2 cas = contentAssetStorage;
            cas.setAssertionIssuer(args.tokenId, unfinalizedState, uss.getIssuer(args.tokenId));
            cas.pushAssertionId(args.tokenId, unfinalizedState);

            uss.deleteIssuer(args.tokenId);
            uss.deleteUnfinalizedState(args.tokenId);

            emit StateFinalized(
                args.assetContract,
                args.tokenId,
                args.keyword,
                args.hashFunctionId,
                args.epoch,
                unfinalizedStateIndex,
                unfinalizedState
            );
        }
    }

    function setReq(uint256 index, bool req) external onlyHubOwner {
        reqs[index] = req;
    }

    function _verifyNeighborhood(
        bytes32 agreementId,
        uint16 epoch,
        uint8 proximityScoreFunctionPairId,
        uint8 hashFunctionId,
        bytes calldata keyword,
        uint72 closestNodeIndex,
        uint72 leftEdgeNodeIndex,
        uint72 rightEdgeNodeIndex
    ) internal virtual returns (uint72, uint256) {
        ShardingTableStorageV2 sts = shardingTableStorage;
        ProfileStorage ps = profileStorage;

        ShardingTableStructsV2.Node memory closestNode = sts.getNodeByIndex(closestNodeIndex);
        ShardingTableStructsV2.Node memory leftEdgeNode = sts.getNodeByIndex(leftEdgeNodeIndex);
        ShardingTableStructsV2.Node memory rightEdgeNode = sts.getNodeByIndex(rightEdgeNodeIndex);

        // Verify that closestNode is in smaller arc between leftNode and rightNode
        bool isBetween = (leftEdgeNode.hashRingPosition <= rightEdgeNode.hashRingPosition)
            ? (closestNode.hashRingPosition >= leftEdgeNode.hashRingPosition &&
                closestNode.hashRingPosition <= rightEdgeNode.hashRingPosition)
            : (leftEdgeNode.hashRingPosition <= closestNode.hashRingPosition ||
                closestNode.hashRingPosition <= rightEdgeNode.hashRingPosition);

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
        uint72 nodesCount = sts.nodesCount();
        uint72 nodesInBetweenClockwise = (
            (rightEdgeNode.index > leftEdgeNode.index)
                ? rightEdgeNode.index - leftEdgeNode.index - 1
                : leftEdgeNode.index - rightEdgeNode.index - 1
        );
        uint72 neighborhoodSize = (nodesInBetweenClockwise < nodesCount - 2 - nodesInBetweenClockwise)
            ? nodesInBetweenClockwise + 2
            : nodesCount - nodesInBetweenClockwise;

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
        uint256 closestDistance = proximityScoringProxy.callProximityFunction(
            proximityScoreFunctionPairId,
            hashFunctionId,
            keyword,
            ps.getNodeId(closestNode.identityId)
        );

        if (
            closestDistance >
            proximityScoringProxy.callProximityFunction(
                proximityScoreFunctionPairId,
                hashFunctionId,
                keyword,
                ps.getNodeId(closestNode.prevIdentityId)
            ) ||
            closestDistance >
            proximityScoringProxy.callProximityFunction(
                proximityScoreFunctionPairId,
                hashFunctionId,
                keyword,
                ps.getNodeId(closestNode.nextIdentityId)
            )
        )
            revert CommitManagerErrorsV2.InvalidClosestNode(
                agreementId,
                epoch,
                closestNodeIndex,
                closestDistance,
                proximityScoringProxy.callProximityFunction(
                    proximityScoreFunctionPairId,
                    hashFunctionId,
                    keyword,
                    ps.getNodeId(closestNode.prevIdentityId)
                ),
                proximityScoringProxy.callProximityFunction(
                    proximityScoreFunctionPairId,
                    hashFunctionId,
                    keyword,
                    ps.getNodeId(closestNode.nextIdentityId)
                ),
                block.timestamp
            );

        // Verify that leftNode is indeed the left edge of the Neighborhood
        uint256 leftEdgeDistance = proximityScoringProxy.callProximityFunction(
            proximityScoreFunctionPairId,
            hashFunctionId,
            keyword,
            ps.getNodeId(leftEdgeNode.identityId)
        );

        if (
            leftEdgeDistance >
            proximityScoringProxy.callProximityFunction(
                proximityScoreFunctionPairId,
                hashFunctionId,
                keyword,
                ps.getNodeId(rightEdgeNode.nextIdentityId)
            )
        )
            revert CommitManagerErrorsV2.InvalidLeftEdgeNode(
                agreementId,
                epoch,
                leftEdgeNodeIndex,
                leftEdgeDistance,
                proximityScoringProxy.callProximityFunction(
                    proximityScoreFunctionPairId,
                    hashFunctionId,
                    keyword,
                    ps.getNodeId(rightEdgeNode.nextIdentityId)
                ),
                block.timestamp
            );

        // Verify that rightNode is indeed the right edge of the Neighborhood
        uint256 rightEdgeDistance = proximityScoringProxy.callProximityFunction(
            proximityScoreFunctionPairId,
            hashFunctionId,
            keyword,
            ps.getNodeId(rightEdgeNode.identityId)
        );

        if (
            rightEdgeDistance >
            proximityScoringProxy.callProximityFunction(
                proximityScoreFunctionPairId,
                hashFunctionId,
                keyword,
                ps.getNodeId(leftEdgeNode.prevIdentityId)
            )
        )
            revert CommitManagerErrorsV2.InvalidRightEdgeNode(
                agreementId,
                epoch,
                rightEdgeNodeIndex,
                rightEdgeDistance,
                proximityScoringProxy.callProximityFunction(
                    proximityScoreFunctionPairId,
                    hashFunctionId,
                    keyword,
                    ps.getNodeId(leftEdgeNode.prevIdentityId)
                ),
                block.timestamp
            );

        return (nodesCount, (leftEdgeDistance > rightEdgeDistance) ? leftEdgeDistance : rightEdgeDistance);
    }

    function _insertCommit(
        bytes32 agreementId,
        uint16 epoch,
        uint256 stateIndex,
        uint72 identityId,
        uint72 prevIdentityId,
        uint72 nextIdentityId,
        uint40 score
    ) internal virtual {
        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;

        bytes32 commitId = keccak256(abi.encodePacked(agreementId, epoch, stateIndex, identityId));

        if (!reqs[4] && sasProxy.commitSubmissionExists(commitId))
            revert ServiceAgreementErrorsV1U1.NodeAlreadySubmittedCommit(
                agreementId,
                epoch,
                stateIndex,
                identityId,
                profileStorage.getNodeId(identityId)
            );

        bytes32 refCommitId = sasProxy.getV1U1AgreementEpochSubmissionHead(agreementId, epoch, stateIndex);

        ParametersStorage params = parametersStorage;

        uint72 refCommitNextIdentityId = sasProxy.getCommitSubmissionNextIdentityId(refCommitId);
        uint32 r0 = params.r0();
        uint8 i;
        while ((score < sasProxy.getCommitSubmissionScore(refCommitId)) && (refCommitNextIdentityId != 0) && (i < r0)) {
            refCommitId = keccak256(abi.encodePacked(agreementId, epoch, stateIndex, refCommitNextIdentityId));

            refCommitNextIdentityId = sasProxy.getCommitSubmissionNextIdentityId(refCommitId);
            unchecked {
                i++;
            }
        }

        if (!reqs[5] && (i >= r0))
            revert ServiceAgreementErrorsV1U1.NodeNotAwarded(
                agreementId,
                epoch,
                stateIndex,
                identityId,
                profileStorage.getNodeId(identityId),
                i
            );

        sasProxy.createV1U1CommitSubmissionObject(commitId, identityId, prevIdentityId, nextIdentityId, score);

        ServiceAgreementStructsV1.CommitSubmission memory refCommit = sasProxy.getCommitSubmission(refCommitId);

        if ((i == 0) && (refCommit.identityId == 0))
            //  No head -> Setting new head
            sasProxy.setV1U1AgreementEpochSubmissionHead(agreementId, epoch, stateIndex, commitId);
        else if ((i == 0) && (score <= refCommit.score))
            // There is a head with higher or equal score, add new commit on the right
            _linkCommits(agreementId, epoch, stateIndex, refCommit.identityId, identityId);
        else if ((i == 0) && (score > refCommit.score)) {
            // There is a head with lower score, replace the head
            sasProxy.setV1U1AgreementEpochSubmissionHead(agreementId, epoch, stateIndex, commitId);
            _linkCommits(agreementId, epoch, stateIndex, identityId, refCommit.identityId);
        } else if (score > refCommit.score) {
            // [H] - head
            // [RC] - reference commit
            // [RC-] - commit before reference commit
            // [RC+] - commit after reference commit
            // [NC] - new commit
            // [] <-> [H] <-> [X] ... [RC-] <-> [RC] <-> [RC+] ... [C] <-> []
            // [] <-> [H] <-> [X] ... [RC-] <-(NL)-> [NC] <-(NL)-> [RC] <-> [RC+] ... [C] <-> []
            _linkCommits(agreementId, epoch, stateIndex, refCommit.prevIdentityId, identityId);
            _linkCommits(agreementId, epoch, stateIndex, identityId, refCommit.identityId);
        }
        // [] <-> [H] <-> [RC] <-> []
        // [] <-> [H] <-> [RC] <-(NL)-> [NC] <-> []
        else _linkCommits(agreementId, epoch, stateIndex, refCommit.identityId, identityId);

        sasProxy.incrementCommitsCount(keccak256(abi.encodePacked(agreementId, epoch, stateIndex)));
    }

    function _linkCommits(
        bytes32 agreementId,
        uint16 epoch,
        uint256 stateIndex,
        uint72 leftIdentityId,
        uint72 rightIdentityId
    ) internal virtual {
        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;

        sasProxy.setCommitSubmissionNextIdentityId(
            keccak256(abi.encodePacked(agreementId, epoch, stateIndex, leftIdentityId)), // leftCommitId
            rightIdentityId
        );

        sasProxy.setCommitSubmissionPrevIdentityId(
            keccak256(abi.encodePacked(agreementId, epoch, stateIndex, rightIdentityId)), // rightCommitId
            leftIdentityId
        );
    }
}
