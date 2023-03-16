// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import {Hub} from "./Hub.sol";
import {ScoringProxy} from "./ScoringProxy.sol";
import {ServiceAgreementHelperFunctions} from "./ServiceAgreementHelperFunctions.sol";
import {Staking} from "./Staking.sol";
import {AbstractAsset} from "./assets/AbstractAsset.sol";
import {ContentAssetStorage} from "./storage/assets/ContentAssetStorage.sol";
import {IdentityStorage} from "./storage/IdentityStorage.sol";
import {ParametersStorage} from "./storage/ParametersStorage.sol";
import {ProfileStorage} from "./storage/ProfileStorage.sol";
import {ServiceAgreementStorageProxy} from "./storage/ServiceAgreementStorageProxy.sol";
import {ShardingTableStorage} from "./storage/ShardingTableStorage.sol";
import {StakingStorage} from "./storage/StakingStorage.sol";
import {UnfinalizedStateStorage} from "./storage/UnfinalizedStateStorage.sol";
import {Named} from "./interface/Named.sol";
import {Versioned} from "./interface/Versioned.sol";
import {ServiceAgreementStructsV1} from "./structs/ServiceAgreementStructsV1.sol";
import {GeneralErrors} from "./errors/GeneralErrors.sol";
import {ServiceAgreementErrorsV1U1} from "./errors/ServiceAgreementErrorsV1U1.sol";

contract CommitManagerV1U1 is Named, Versioned {
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
    event Logger(bool value, string message);

    string private constant _NAME = "CommitManagerV1U1";
    string private constant _VERSION = "1.0.0";

    bool[6] public reqs = [false, false, false, false, false, false];

    Hub public hub;
    ScoringProxy public scoringProxy;
    ServiceAgreementHelperFunctions public serviceAgreementHelperFunctions;
    Staking public stakingContract;
    ContentAssetStorage public contentAssetStorage;
    IdentityStorage public identityStorage;
    ParametersStorage public parametersStorage;
    ProfileStorage public profileStorage;
    ServiceAgreementStorageProxy public serviceAgreementStorageProxy;
    ShardingTableStorage public shardingTableStorage;
    StakingStorage public stakingStorage;
    UnfinalizedStateStorage public unfinalizedStateStorage;

    constructor(address hubAddress) {
        require(hubAddress != address(0), "Hub Address cannot be 0x0");

        hub = Hub(hubAddress);
        initialize();
    }

    modifier onlyHubOwner() {
        _checkHubOwner();
        _;
    }

    function initialize() public onlyHubOwner {
        scoringProxy = ScoringProxy(hub.getContractAddress("ScoringProxy"));
        serviceAgreementHelperFunctions = ServiceAgreementHelperFunctions(
            hub.getContractAddress("ServiceAgreementHelperFunctions")
        );
        stakingContract = Staking(hub.getContractAddress("Staking"));
        contentAssetStorage = ContentAssetStorage(hub.getAssetStorageAddress("ContentAssetStorage"));
        identityStorage = IdentityStorage(hub.getContractAddress("IdentityStorage"));
        parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));
        profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        serviceAgreementStorageProxy = ServiceAgreementStorageProxy(
            hub.getContractAddress("ServiceAgreementStorageProxy")
        );
        shardingTableStorage = ShardingTableStorage(hub.getContractAddress("ShardingTableStorage"));
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
        uint256 startTime = sasProxy.getAgreementStartTime(agreementId);

        ParametersStorage params = parametersStorage;
        uint128 epochLength = sasProxy.getAgreementEpochLength(agreementId);

        if (startTime == 0) revert ServiceAgreementErrorsV1U1.ServiceAgreementDoesntExist(agreementId);
        if (epoch >= sasProxy.getAgreementEpochsNumber(agreementId))
            revert ServiceAgreementErrorsV1U1.ServiceAgreementHasBeenExpired(
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

    function isUpdateCommitWindowOpen(
        bytes32 agreementId,
        uint16 epoch,
        uint256 stateIndex
    ) public view returns (bool) {
        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;

        uint128 epochLength = sasProxy.getAgreementEpochLength(agreementId);

        if (!sasProxy.serviceAgreementExists(agreementId))
            revert ServiceAgreementErrorsV1U1.ServiceAgreementDoesntExist(agreementId);
        if (epoch >= sasProxy.getAgreementEpochsNumber(agreementId))
            revert ServiceAgreementErrorsV1U1.ServiceAgreementHasBeenExpired(
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

        if (!sasProxy.serviceAgreementExists(agreementId))
            revert ServiceAgreementErrorsV1U1.ServiceAgreementDoesntExist(agreementId);
        if (epoch >= sasProxy.getAgreementEpochsNumber(agreementId))
            revert ServiceAgreementErrorsV1U1.ServiceAgreementHasBeenExpired(
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

    function submitCommit(ServiceAgreementStructsV1.CommitInputArgs calldata args) external {
        _submitCommit(args);
    }

    function submitUpdateCommit(ServiceAgreementStructsV1.CommitInputArgs calldata args) external {
        _submitUpdateCommit(args);
    }

    function setReq(uint256 index, bool req) external onlyHubOwner {
        reqs[index] = req;
    }

    function _submitCommit(ServiceAgreementStructsV1.CommitInputArgs calldata args) internal virtual {
        bytes32 agreementId = serviceAgreementHelperFunctions.generateAgreementId(
            args.assetContract,
            args.tokenId,
            args.keyword,
            args.hashFunctionId
        );

        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;
        AbstractAsset generalAssetInterface = AbstractAsset(args.assetContract);

        uint256 latestFinalizedStateIndex = generalAssetInterface.getAssertionIdsLength(args.tokenId) - 1;

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
        emit Logger(!isCommitWindowOpen(agreementId, args.epoch), "req1");

        uint72 identityId = identityStorage.getIdentityId(msg.sender);

        if (!reqs[1] && !shardingTableStorage.nodeExists(identityId)) {
            ProfileStorage ps = profileStorage;

            revert ServiceAgreementErrorsV1U1.NodeNotInShardingTable(
                identityId,
                ps.getNodeId(identityId),
                ps.getAsk(identityId),
                stakingStorage.totalStakes(identityId)
            );
        }
        emit Logger(!shardingTableStorage.nodeExists(identityId), "req2");

        uint40 score = scoringProxy.callScoreFunction(
            sasProxy.getAgreementScoreFunctionId(agreementId),
            args.hashFunctionId,
            profileStorage.getNodeId(identityId),
            args.keyword,
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

    function _submitUpdateCommit(ServiceAgreementStructsV1.CommitInputArgs calldata args) internal virtual {
        UnfinalizedStateStorage uss = unfinalizedStateStorage;
        AbstractAsset generalAssetInterface = AbstractAsset(args.assetContract);

        bytes32 unfinalizedState = uss.getUnfinalizedState(args.tokenId);
        uint256 unfinalizedStateIndex = generalAssetInterface.getAssertionIdsLength(args.tokenId);

        if (unfinalizedState == bytes32(0)) {
            revert ServiceAgreementErrorsV1U1.NoPendingUpdate(args.assetContract, args.tokenId);
        }

        bytes32 agreementId = serviceAgreementHelperFunctions.generateAgreementId(
            args.assetContract,
            args.tokenId,
            args.keyword,
            args.hashFunctionId
        );

        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;

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
        emit Logger(!isUpdateCommitWindowOpen(agreementId, args.epoch, unfinalizedStateIndex), "req3");

        uint72 identityId = identityStorage.getIdentityId(msg.sender);

        if (!reqs[3] && !shardingTableStorage.nodeExists(identityId)) {
            ProfileStorage ps = profileStorage;

            revert ServiceAgreementErrorsV1U1.NodeNotInShardingTable(
                identityId,
                ps.getNodeId(identityId),
                ps.getAsk(identityId),
                stakingStorage.totalStakes(identityId)
            );
        }
        emit Logger(!shardingTableStorage.nodeExists(identityId), "req4");

        uint40 score = scoringProxy.callScoreFunction(
            serviceAgreementStorageProxy.getAgreementScoreFunctionId(agreementId),
            args.hashFunctionId,
            profileStorage.getNodeId(identityId),
            args.keyword,
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
            if (sasProxy.isV1Agreement(agreementId)) {
                sasProxy.migrateV1ServiceAgreement(agreementId);
            }

            uint96 tokenAmount = sasProxy.getAgreementTokenAmount(agreementId);
            sasProxy.setAgreementTokenAmount(
                agreementId,
                tokenAmount + sasProxy.getAgreementUpdateTokenAmount(agreementId)
            );
            sasProxy.setAgreementUpdateTokenAmount(agreementId, 0);

            ContentAssetStorage cas = contentAssetStorage;
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
        emit Logger(sasProxy.commitSubmissionExists(commitId), "req5");

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
        emit Logger(i >= r0, "req6");

        sasProxy.createV1U1CommitSubmissionObject(commitId, identityId, prevIdentityId, nextIdentityId, score);

        ServiceAgreementStructsV1.CommitSubmission memory refCommit = sasProxy.getCommitSubmission(refCommitId);

        if ((i == 0) && (refCommit.identityId == 0)) {
            //  No head -> Setting new head
            sasProxy.setV1U1AgreementEpochSubmissionHead(agreementId, epoch, stateIndex, commitId);
        } else if ((i == 0) && (score <= refCommit.score)) {
            // There is a head with higher or equal score, add new commit on the right
            _linkCommits(agreementId, epoch, stateIndex, refCommit.identityId, identityId);
        } else if ((i == 0) && (score > refCommit.score)) {
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
        } else {
            // [] <-> [H] <-> [RC] <-> []
            // [] <-> [H] <-> [RC] <-(NL)-> [NC] <-> []
            _linkCommits(agreementId, epoch, stateIndex, refCommit.identityId, identityId);
        }

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

    function _checkHubOwner() internal view virtual {
        if (msg.sender != hub.owner()) revert GeneralErrors.OnlyHubOwnerFunction(msg.sender);
    }
}
