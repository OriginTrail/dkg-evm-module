// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import {HashingProxy} from "./HashingProxy.sol";
import {Hub} from "./Hub.sol";
import {ScoringProxy} from "./ScoringProxy.sol";
import {Staking} from "./Staking.sol";
import {IdentityStorage} from "./storage/IdentityStorage.sol";
import {ParametersStorage} from "./storage/ParametersStorage.sol";
import {ProfileStorage} from "./storage/ProfileStorage.sol";
import {ServiceAgreementStorageProxy} from "./storage/ServiceAgreementStorageProxy.sol";
import {ShardingTableStorage} from "./storage/ShardingTableStorage.sol";
import {StakingStorage} from "./storage/StakingStorage.sol";
import {Named} from "./interface/Named.sol";
import {Versioned} from "./interface/Versioned.sol";
import {ServiceAgreementStructsV1} from "./structs/ServiceAgreementStructsV1.sol";
import {GeneralErrors} from "./errors/GeneralErrors.sol";
import {ServiceAgreementErrorsV1} from "./errors/ServiceAgreementErrorsV1.sol";

contract CommitManagerV1 is Named, Versioned {
    event CommitSubmitted(
        address indexed assetContract,
        uint256 indexed tokenId,
        bytes keyword,
        uint8 hashFunctionId,
        uint16 epoch,
        uint72 indexed identityId,
        uint40 score
    );
    event Logger(bool value, string message);

    string private constant _NAME = "CommitManagerV1";
    string private constant _VERSION = "1.0.0";

    bool[4] public reqs = [false, false, false, false];

    HashingProxy public hashingProxy;
    Hub public hub;
    ScoringProxy public scoringProxy;
    Staking public stakingContract;
    IdentityStorage public identityStorage;
    ParametersStorage public parametersStorage;
    ProfileStorage public profileStorage;
    ServiceAgreementStorageProxy public serviceAgreementStorageProxy;
    ShardingTableStorage public shardingTableStorage;
    StakingStorage public stakingStorage;

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
        hashingProxy = HashingProxy(hub.getContractAddress("HashingProxy"));
        scoringProxy = ScoringProxy(hub.getContractAddress("ScoringProxy"));
        stakingContract = Staking(hub.getContractAddress("Staking"));
        identityStorage = IdentityStorage(hub.getContractAddress("IdentityStorage"));
        parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));
        profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        serviceAgreementStorageProxy = ServiceAgreementStorageProxy(
            hub.getContractAddress("ServiceAgreementStorageProxy")
        );
        shardingTableStorage = ShardingTableStorage(hub.getContractAddress("ShardingTableStorage"));
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
        uint256 startTime = sasProxy.getAgreementStartTime(agreementId);

        ParametersStorage params = parametersStorage;
        uint128 epochLength = sasProxy.getAgreementEpochLength(agreementId);

        if (startTime == 0) revert ServiceAgreementErrorsV1.ServiceAgreementDoesntExist(agreementId);
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

        return (timeNow > (startTime + epochLength * epoch) &&
            timeNow < (startTime + epochLength * epoch + commitWindowDuration));
    }

    function getTopCommitSubmissions(
        bytes32 agreementId,
        uint16 epoch
    ) external view returns (ServiceAgreementStructsV1.CommitSubmission[] memory) {
        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;

        if (!sasProxy.serviceAgreementExists(agreementId))
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

        bytes32 epochSubmissionsHead = sasProxy.getAgreementEpochSubmissionHead(agreementId, epoch);

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
        _submitCommit(args);
    }

    function bulkSubmitCommit(ServiceAgreementStructsV1.CommitInputArgs[] calldata argsArray) external {
        uint256 commitsNumber = argsArray.length;

        for (uint256 i; i < commitsNumber; ) {
            _submitCommit(argsArray[i]);
            unchecked {
                i++;
            }
        }
    }

    function setReq(uint256 index, bool req) external onlyHubOwner {
        reqs[index] = req;
    }

    function _submitCommit(ServiceAgreementStructsV1.CommitInputArgs calldata args) internal virtual {
        bytes32 agreementId = _generateAgreementId(args.assetContract, args.tokenId, args.keyword, args.hashFunctionId);

        if (!reqs[0] && !isCommitWindowOpen(agreementId, args.epoch)) {
            ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;

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
        emit Logger(!isCommitWindowOpen(agreementId, args.epoch), "req1");

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
        emit Logger(!shardingTableStorage.nodeExists(identityId), "req2");

        uint40 score = scoringProxy.callScoreFunction(
            serviceAgreementStorageProxy.getAgreementScoreFunctionId(agreementId),
            args.hashFunctionId,
            profileStorage.getNodeId(identityId),
            args.keyword,
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
        emit Logger(sasProxy.commitSubmissionExists(commitId), "req3");

        bytes32 refCommitId = sasProxy.getAgreementEpochSubmissionHead(agreementId, epoch);

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
        emit Logger(i >= r0, "req4");

        sasProxy.createCommitSubmissionObject(commitId, identityId, prevIdentityId, nextIdentityId, score);

        ServiceAgreementStructsV1.CommitSubmission memory refCommit = sasProxy.getCommitSubmission(refCommitId);

        if ((i == 0) && (refCommit.identityId == 0)) {
            //  No head -> Setting new head
            sasProxy.setAgreementEpochSubmissionHead(agreementId, epoch, commitId);
        } else if ((i == 0) && (score <= refCommit.score)) {
            // There is a head with higher or equal score, add new commit on the right
            _linkCommits(agreementId, epoch, refCommit.identityId, identityId);
        } else if ((i == 0) && (score > refCommit.score)) {
            // There is a head with lower score, replace the head
            sasProxy.setAgreementEpochSubmissionHead(agreementId, epoch, commitId);
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

    function _generateAgreementId(
        address assetContract,
        uint256 tokenId,
        bytes calldata keyword,
        uint8 hashFunctionId
    ) internal view returns (bytes32) {
        return hashingProxy.callHashFunction(hashFunctionId, abi.encodePacked(assetContract, tokenId, keyword));
    }

    function _checkHubOwner() internal view virtual {
        if (msg.sender != hub.owner()) revert GeneralErrors.OnlyHubOwnerFunction(msg.sender);
    }
}
