// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {ShardingTable} from "./ShardingTable.sol";
import {Shares} from "./Shares.sol";
import {IdentityStorage} from "./storage/IdentityStorage.sol";
import {ParametersStorage} from "./storage/ParametersStorage.sol";
import {ProfileStorage} from "./storage/ProfileStorage.sol";
import {ShardingTableStorage} from "./storage/ShardingTableStorage.sol";
import {StakingStorage} from "./storage/StakingStorage.sol";
import {ContractStatus} from "./abstract/ContractStatus.sol";
import {IInitializable} from "./interfaces/IInitializable.sol";
import {INamed} from "./interfaces/INamed.sol";
import {IVersioned} from "./interfaces/IVersioned.sol";
import {ProfileLib} from "./libraries/ProfileLib.sol";
import {ShardingTableLib} from "./libraries/ShardingTableLib.sol";
import {TokenLib} from "./libraries/TokenLib.sol";
import {IdentityLib} from "./libraries/IdentityLib.sol";
import {PermissionsLib} from "./libraries/PermissionsLib.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Staking is INamed, IVersioned, ContractStatus, IInitializable {
    event StakeIncreased(
        uint72 indexed identityId,
        bytes nodeId,
        address indexed staker,
        uint96 oldStake,
        uint96 newStake
    );
    event SharesMinted(
        uint72 indexed identityId,
        address indexed sharesContractAddress,
        address indexed delegator,
        uint256 sharesMintedAmount,
        uint256 newTotalSupply
    );
    event RewardCollected(
        bytes32 indexed agreementId,
        uint72 indexed identityId,
        bytes nodeId,
        address serviceAgreementAddress,
        uint96 nodeOperatorFee,
        uint96 delegatorsReward
    );
    event StakeWithdrawalStarted(
        uint72 indexed identityId,
        bytes nodeId,
        address indexed staker,
        uint96 oldStake,
        uint96 newStake,
        uint256 withdrawalPeriodEnd
    );
    event StakeWithdrawn(uint72 indexed identityId, bytes nodeId, address indexed staker, uint96 withdrawnStakeAmount);
    event StakeWithdrawalCanceled(
        uint72 indexed identityId,
        bytes nodeId,
        address indexed staker,
        uint96 oldStake,
        uint96 newStake,
        uint256 sharesMintedAmount,
        uint256 newTotalSupply
    );
    event InactiveStakeWithdrawn(
        uint72 indexed identityId,
        bytes nodeId,
        address indexed staker,
        uint96 withdrawnStakeAmount
    );
    event SharesBurned(
        uint72 indexed identityId,
        address indexed sharesContractAddress,
        address indexed delegator,
        uint256 sharesBurnedAmount,
        uint256 newTotalSupply
    );
    event AccumulatedOperatorFeeIncreased(
        uint72 indexed identityId,
        bytes nodeId,
        uint96 oldAccumulatedOperatorFee,
        uint96 newAccumulatedOperatorFee
    );
    event OperatorFeeChangeStarted(uint72 indexed identityId, bytes nodeId, uint8 operatorFee, uint256 timestamp);
    event OperatorFeeChangeFinished(uint72 indexed identityId, bytes nodeId, uint8 operatorFee);

    string private constant _NAME = "Staking";
    string private constant _VERSION = "2.3.0";

    ShardingTable public shardingTableContract;
    IdentityStorage public identityStorage;
    ParametersStorage public parametersStorage;
    ProfileStorage public profileStorage;
    StakingStorage public stakingStorage;
    ShardingTableStorage public shardingTableStorage;
    IERC20 public tokenContract;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) ContractStatus(hubAddress) {}

    modifier onlyAdmin(uint72 identityId) {
        _checkAdmin(identityId);
        _;
    }

    function initialize() public onlyHubOwner {
        shardingTableContract = ShardingTable(hub.getContractAddress("ShardingTable"));
        identityStorage = IdentityStorage(hub.getContractAddress("IdentityStorage"));
        parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));
        profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        stakingStorage = StakingStorage(hub.getContractAddress("StakingStorage"));
        shardingTableStorage = ShardingTableStorage(hub.getContractAddress("ShardingTableStorage"));
        tokenContract = IERC20(hub.getContractAddress("Token"));
    }

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function addStake(address sender, uint72 identityId, uint96 stakeAmount) external onlyContracts {
        StakingStorage ss = stakingStorage;
        ProfileStorage ps = profileStorage;
        ParametersStorage params = parametersStorage;
        ShardingTableStorage sts = shardingTableStorage;

        uint96 oldStake = ss.totalStakes(identityId);
        uint96 newStake = oldStake + stakeAmount;

        if (!ps.profileExists(identityId)) {
            revert ProfileLib.ProfileDoesntExist(identityId);
        }
        if (newStake > params.maximumStake()) {
            revert IdentityLib.MaximumStakeExceeded(params.maximumStake());
        }

        Shares sharesContract = Shares(ps.getSharesContractAddress(identityId));

        uint256 sharesMinted;
        if (sharesContract.totalSupply() == 0) {
            sharesMinted = stakeAmount;
        } else {
            sharesMinted = ((uint256(stakeAmount) * sharesContract.totalSupply()) / oldStake);
        }
        sharesContract.mint(sender, sharesMinted);

        ss.setTotalStake(identityId, newStake);
        ps.transferAccumulatedOperatorFee(address(ss), stakeAmount);

        if (!sts.nodeExists(identityId) && newStake >= params.minimumStake()) {
            if (sts.nodesCount() >= params.shardingTableSizeLimit()) {
                revert ShardingTableLib.ShardingTableIsFull();
            }
            shardingTableContract.insertNode(identityId);
        }
        emit StakeIncreased(identityId, ps.getNodeId(identityId), sender, oldStake, newStake);
        emit SharesMinted(identityId, address(sharesContract), sender, sharesMinted, sharesContract.totalSupply());
    }

    function addStake(uint72 identityId, uint96 stakeAmount) external {
        StakingStorage ss = stakingStorage;
        ProfileStorage ps = profileStorage;
        ParametersStorage params = parametersStorage;
        ShardingTableStorage sts = shardingTableStorage;
        IERC20 tknc = tokenContract;

        uint96 oldStake = ss.totalStakes(identityId);
        uint96 newStake = oldStake + stakeAmount;

        if (!ps.profileExists(identityId)) {
            revert ProfileLib.ProfileDoesntExist(identityId);
        }
        if (stakeAmount > tknc.allowance(msg.sender, address(this))) {
            revert TokenLib.TooLowAllowance(address(tknc), tknc.allowance(msg.sender, address(this)));
        }
        if (newStake > params.maximumStake()) {
            revert IdentityLib.MaximumStakeExceeded(params.maximumStake());
        }

        Shares sharesContract = Shares(ps.getSharesContractAddress(identityId));

        uint256 sharesMinted;
        if (sharesContract.totalSupply() == 0) {
            sharesMinted = stakeAmount;
        } else {
            sharesMinted = ((uint256(stakeAmount) * sharesContract.totalSupply()) / oldStake);
        }
        sharesContract.mint(msg.sender, sharesMinted);

        ss.setTotalStake(identityId, newStake);
        tknc.transferFrom(msg.sender, address(ss), stakeAmount);

        if (!sts.nodeExists(identityId) && newStake >= params.minimumStake()) {
            if (sts.nodesCount() >= params.shardingTableSizeLimit()) {
                revert ShardingTableLib.ShardingTableIsFull();
            }
            shardingTableContract.insertNode(identityId);
        }
        emit StakeIncreased(identityId, ps.getNodeId(identityId), msg.sender, oldStake, newStake);
        emit SharesMinted(identityId, address(sharesContract), msg.sender, sharesMinted, sharesContract.totalSupply());
    }

    function redelegate(uint72 from, uint72 to, uint96 sharesToBurn) external {
        if (sharesToBurn == 0) {
            revert IdentityLib.ZeroSharesAmount();
        }

        ProfileStorage ps = profileStorage;
        StakingStorage ss = stakingStorage;
        ShardingTableStorage sts = shardingTableStorage;

        if (!ps.profileExists(from)) {
            revert ProfileLib.ProfileDoesntExist(from);
        }

        if (!ps.profileExists(to)) {
            revert ProfileLib.ProfileDoesntExist(to);
        }

        Shares fromSharesContract = Shares(ps.getSharesContractAddress(from));
        Shares toSharesContract = Shares(ps.getSharesContractAddress(to));

        if (sharesToBurn > fromSharesContract.balanceOf(msg.sender)) {
            revert TokenLib.TooLowBalance(address(fromSharesContract), fromSharesContract.balanceOf(msg.sender));
        }

        ParametersStorage params = parametersStorage;

        uint96 fromCurrentStake = ss.totalStakes(from);
        uint96 toCurrentStake = ss.totalStakes(to);

        uint96 redelegationAmount = uint96(
            (uint256(fromCurrentStake) * sharesToBurn) / fromSharesContract.totalSupply()
        );

        if (toCurrentStake + redelegationAmount > params.maximumStake()) {
            revert IdentityLib.MaximumStakeExceeded(params.maximumStake());
        }

        fromSharesContract.burnFrom(msg.sender, sharesToBurn);

        uint256 sharesToMint;
        if (toSharesContract.totalSupply() == 0) {
            sharesToMint = redelegationAmount;
        } else {
            sharesToMint = ((uint256(redelegationAmount) * toSharesContract.totalSupply()) / toCurrentStake);
        }
        toSharesContract.mint(msg.sender, sharesToMint);

        ss.setTotalStake(from, fromCurrentStake - redelegationAmount);

        if (sts.nodeExists(from) && (fromCurrentStake - redelegationAmount) < params.minimumStake()) {
            shardingTableContract.removeNode(from);
        }

        ss.setTotalStake(to, toCurrentStake + redelegationAmount);

        if (!sts.nodeExists(to) && (toCurrentStake + redelegationAmount >= params.minimumStake())) {
            if (sts.nodesCount() >= params.shardingTableSizeLimit()) {
                revert ShardingTableLib.ShardingTableIsFull();
            }
            shardingTableContract.insertNode(to);
        }

        emit SharesBurned(
            from,
            address(fromSharesContract),
            msg.sender,
            sharesToBurn,
            fromSharesContract.totalSupply()
        );
        emit StakeWithdrawn(from, ps.getNodeId(from), msg.sender, redelegationAmount);
        emit SharesMinted(to, address(toSharesContract), msg.sender, sharesToMint, toSharesContract.totalSupply());
        emit StakeIncreased(to, ps.getNodeId(to), msg.sender, toCurrentStake, toCurrentStake + redelegationAmount);
    }

    function startStakeWithdrawal(uint72 identityId, uint96 sharesToBurn) external {
        if (sharesToBurn == 0) {
            revert IdentityLib.ZeroSharesAmount();
        }

        ProfileStorage ps = profileStorage;
        StakingStorage ss = stakingStorage;

        if (!ps.profileExists(identityId)) {
            revert ProfileLib.ProfileDoesntExist(identityId);
        }

        Shares sharesContract = Shares(ps.getSharesContractAddress(identityId));

        if (sharesToBurn > sharesContract.balanceOf(msg.sender)) {
            revert TokenLib.TooLowBalance(address(sharesContract), sharesContract.balanceOf(msg.sender));
        }

        ParametersStorage params = parametersStorage;

        uint96 currentStake = ss.totalStakes(identityId);
        uint96 stakeWithdrawalAmount = uint96((uint256(currentStake) * sharesToBurn) / sharesContract.totalSupply());

        ss.setTotalStake(identityId, currentStake - stakeWithdrawalAmount);

        if (
            shardingTableStorage.nodeExists(identityId) &&
            (currentStake - stakeWithdrawalAmount) < params.minimumStake()
        ) {
            shardingTableContract.removeNode(identityId);
        }

        if (currentStake > params.maximumStake() && stakeWithdrawalAmount <= (currentStake - params.maximumStake())) {
            ss.transferStake(msg.sender, stakeWithdrawalAmount);

            emit StakeWithdrawn(identityId, ps.getNodeId(identityId), msg.sender, stakeWithdrawalAmount);
            emit InactiveStakeWithdrawn(identityId, ps.getNodeId(identityId), msg.sender, stakeWithdrawalAmount);
        } else {
            uint96 newStakeWithdrawalAmount = ss.getWithdrawalRequestAmount(identityId, msg.sender) +
                stakeWithdrawalAmount;
            uint256 withdrawalPeriodEnd = block.timestamp + params.stakeWithdrawalDelay();

            ss.createWithdrawalRequest(identityId, msg.sender, newStakeWithdrawalAmount, withdrawalPeriodEnd);

            emit StakeWithdrawalStarted(
                identityId,
                ps.getNodeId(identityId),
                msg.sender,
                currentStake,
                currentStake - stakeWithdrawalAmount,
                withdrawalPeriodEnd
            );
        }

        sharesContract.burnFrom(msg.sender, sharesToBurn);

        emit SharesBurned(identityId, address(sharesContract), msg.sender, sharesToBurn, sharesContract.totalSupply());
    }

    function withdrawStake(uint72 identityId) external {
        ProfileStorage ps = profileStorage;

        if (!ps.profileExists(identityId)) {
            revert ProfileLib.ProfileDoesntExist(identityId);
        }

        StakingStorage ss = stakingStorage;

        uint96 stakeWithdrawalAmount;
        uint256 withdrawalTimestamp;
        (stakeWithdrawalAmount, withdrawalTimestamp) = ss.withdrawalRequests(identityId, msg.sender);

        if (stakeWithdrawalAmount == 0) {
            revert IdentityLib.WithdrawalWasntInitiated();
        }
        if (block.timestamp < withdrawalTimestamp) {
            revert IdentityLib.WithdrawalPeriodPending(block.timestamp, withdrawalTimestamp);
        }

        ss.deleteWithdrawalRequest(identityId, msg.sender);
        ss.transferStake(msg.sender, stakeWithdrawalAmount);

        emit StakeWithdrawn(identityId, ps.getNodeId(identityId), msg.sender, stakeWithdrawalAmount);
    }

    function cancelStakeWithdrawal(uint72 identityId) external {
        ProfileStorage ps = profileStorage;

        if (!ps.profileExists(identityId)) {
            revert ProfileLib.ProfileDoesntExist(identityId);
        }

        StakingStorage ss = stakingStorage;

        uint96 stakeWithdrawalAmount;
        uint256 withdrawalTimestamp;
        (stakeWithdrawalAmount, withdrawalTimestamp) = ss.withdrawalRequests(identityId, msg.sender);

        if (stakeWithdrawalAmount == 0) {
            revert IdentityLib.WithdrawalWasntInitiated();
        }

        uint96 oldStake = ss.totalStakes(identityId);
        uint96 newStake = oldStake + stakeWithdrawalAmount;

        Shares sharesContract = Shares(ps.getSharesContractAddress(identityId));

        uint256 sharesMinted;
        if (sharesContract.totalSupply() == 0) {
            sharesMinted = stakeWithdrawalAmount;
        } else {
            sharesMinted = ((uint256(stakeWithdrawalAmount) * sharesContract.totalSupply()) / oldStake);
        }
        sharesContract.mint(msg.sender, sharesMinted);

        ss.deleteWithdrawalRequest(identityId, msg.sender);
        ss.setTotalStake(identityId, newStake);

        ShardingTableStorage sts = shardingTableStorage;
        ParametersStorage params = parametersStorage;

        if (!sts.nodeExists(identityId) && newStake >= params.minimumStake()) {
            if (sts.nodesCount() >= params.shardingTableSizeLimit()) {
                revert ShardingTableLib.ShardingTableIsFull();
            }
            shardingTableContract.insertNode(identityId);
        }
        emit StakeWithdrawalCanceled(
            identityId,
            ps.getNodeId(identityId),
            msg.sender,
            oldStake,
            newStake,
            sharesMinted,
            sharesContract.totalSupply()
        );
        emit StakeIncreased(identityId, ps.getNodeId(identityId), msg.sender, oldStake, newStake);
        emit SharesMinted(identityId, address(sharesContract), msg.sender, sharesMinted, sharesContract.totalSupply());
    }

    // function addReward(bytes32 agreementId, uint72 identityId, uint96 rewardAmount) external onlyContracts {
    //     StakingStorage ss = stakingStorage;
    //     ProfileStorage ps = profileStorage;

    //     uint256 startTime;
    //     uint16 epochsNumber;
    //     uint128 epochLength;
    //     uint96 operatorFeeAmount;
    //     (startTime, epochsNumber, epochLength, , ) = sasProxy.getAgreementData(agreementId);

    //     operatorFeeAmount =
    //         (rewardAmount *
    //             (
    //                 sasProxy.getAgreementScoreFunctionId(agreementId) == LOG2PLDSF_ID
    //                     ? 100
    //                     : ps.getOperatorFeePercentageByTimestampReverse(
    //                         identityId,
    //                         (startTime +
    //                             epochLength *
    //                             ((block.timestamp - startTime) / epochLength) +
    //                             ((epochLength * parametersStorage.commitWindowDurationPerc()) / 100))
    //                     )
    //             )) /
    //         100;
    //     uint96 delegatorsRewardAmount = rewardAmount - operatorFeeAmount;

    //     uint96 oldAccumulatedOperatorFeeAmount = ps.getAccumulatedOperatorFee(identityId);
    //     uint96 oldStake = ss.totalStakes(identityId);

    //     if (operatorFeeAmount != 0) {
    //         ps.setAccumulatedOperatorFee(identityId, oldAccumulatedOperatorFeeAmount + operatorFeeAmount);
    //         sasProxy.transferAgreementTokens(agreementId, address(ps), operatorFeeAmount);
    //     }

    //     if (delegatorsRewardAmount != 0) {
    //         ss.setTotalStake(identityId, oldStake + delegatorsRewardAmount);
    //         sasProxy.transferAgreementTokens(agreementId, address(ss), delegatorsRewardAmount);

    //         ShardingTableStorage sts = shardingTableStorage;
    //         ParametersStorage params = parametersStorage;

    //         if (!sts.nodeExists(identityId) && oldStake + delegatorsRewardAmount >= params.minimumStake()) {
    //             if (sts.nodesCount() >= params.shardingTableSizeLimit()) {
    //                 revert ShardingTableLib.ShardingTableIsFull();
    //             }
    //             shardingTableContract.insertNode(identityId);
    //         }
    //     }

    //     emit AccumulatedOperatorFeeIncreased(
    //         identityId,
    //         ps.getNodeId(identityId),
    //         oldAccumulatedOperatorFeeAmount,
    //         oldAccumulatedOperatorFeeAmount + operatorFeeAmount
    //     );

    //     address sasAddress;
    //     if (sasProxy.agreementV1Exists(agreementId)) {
    //         sasAddress = sasProxy.agreementV1StorageAddress();
    //     } else {
    //         sasAddress = sasProxy.agreementV1U1StorageAddress();
    //     }
    //     emit StakeIncreased(
    //         identityId,
    //         ps.getNodeId(identityId),
    //         sasAddress,
    //         oldStake,
    //         oldStake + delegatorsRewardAmount
    //     );
    //     emit RewardCollected(
    //         agreementId,
    //         identityId,
    //         ps.getNodeId(identityId),
    //         sasAddress,
    //         operatorFeeAmount,
    //         delegatorsRewardAmount
    //     );
    // }

    // solhint-disable-next-line no-empty-blocks
    function slash(uint72 identityId) external onlyContracts {
        // To be implemented
    }

    function startOperatorFeeChange(uint72 identityId, uint8 newOperatorFee) external onlyAdmin(identityId) {
        if (newOperatorFee > 100) {
            revert IdentityLib.InvalidOperatorFee();
        }

        ProfileStorage ps = profileStorage;

        uint248 newOperatorFeeEffectiveData = uint248(block.timestamp + parametersStorage.stakeWithdrawalDelay());

        if (ps.isOperatorFeeChangePending(identityId)) {
            ps.replacePendingOperatorFee(identityId, newOperatorFee, newOperatorFeeEffectiveData);
        } else {
            ps.addOperatorFee(identityId, newOperatorFee, newOperatorFeeEffectiveData);
        }

        emit OperatorFeeChangeStarted(
            identityId,
            profileStorage.getNodeId(identityId),
            newOperatorFee,
            newOperatorFeeEffectiveData
        );
    }

    // Function signature needed for ABI backwards compatibility
    // solhint-disable-next-line no-empty-blocks
    function finishOperatorFeeChange(uint72 identityId) external onlyAdmin(identityId) {}

    function _checkAdmin(uint72 identityId) internal view virtual {
        if (
            !identityStorage.keyHasPurpose(identityId, keccak256(abi.encodePacked(msg.sender)), IdentityLib.ADMIN_KEY)
        ) {
            revert PermissionsLib.OnlyProfileAdminFunction(msg.sender);
        }
    }
}
