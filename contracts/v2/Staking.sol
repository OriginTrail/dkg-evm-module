// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {ShardingTableV2} from "./ShardingTable.sol";
import {Shares} from "../v1/Shares.sol";
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
import {GeneralErrors} from "../v1/errors/GeneralErrors.sol";
import {ProfileErrors} from "./errors/ProfileErrors.sol";
import {StakingErrors} from "./errors/StakingErrors.sol";
import {TokenErrors} from "../v1/errors/TokenErrors.sol";
import {ADMIN_KEY} from "../v1/constants/IdentityConstants.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract StakingV2 is Named, Versioned, ContractStatus, Initializable {
    event StakeIncreased(
        uint72 indexed identityId,
        bytes nodeId,
        address indexed staker,
        uint96 oldStake,
        uint96 newStake
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
    event AccumulatedOperatorFeeIncreased(
        uint72 indexed identityId,
        bytes nodeId,
        uint96 oldAccumulatedOperatorFee,
        uint96 newAccumulatedOperatorFee
    );
    event OperatorFeeUpdated(uint72 indexed identityId, bytes nodeId, uint96 operatorFee);

    string private constant _NAME = "Staking";
    string private constant _VERSION = "2.0.0";

    ShardingTableV2 public shardingTableContract;
    IdentityStorageV2 public identityStorage;
    ParametersStorage public parametersStorage;
    ProfileStorage public profileStorage;
    StakingStorage public stakingStorage;
    ServiceAgreementStorageProxy public serviceAgreementStorageProxy;
    ShardingTableStorageV2 public shardingTableStorage;
    IERC20 public tokenContract;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) ContractStatus(hubAddress) {}

    modifier onlyAdmin(uint72 identityId) {
        _checkAdmin(identityId);
        _;
    }

    function initialize() public onlyHubOwner {
        shardingTableContract = ShardingTableV2(hub.getContractAddress("ShardingTable"));
        identityStorage = IdentityStorageV2(hub.getContractAddress("IdentityStorage"));
        parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));
        profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        stakingStorage = StakingStorage(hub.getContractAddress("StakingStorage"));
        serviceAgreementStorageProxy = ServiceAgreementStorageProxy(
            hub.getContractAddress("ServiceAgreementStorageProxy")
        );
        shardingTableStorage = ShardingTableStorageV2(hub.getContractAddress("ShardingTableStorage"));
        tokenContract = IERC20(hub.getContractAddress("Token"));
    }

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function addStake(address sender, uint72 identityId, uint96 stakeAmount) external onlyContracts {
        _addStake(sender, identityId, stakeAmount);
    }

    function addStake(uint72 identityId, uint96 stakeAmount) external {
        _addStake(msg.sender, identityId, stakeAmount);
    }

    function startStakeWithdrawal(uint72 identityId, uint96 sharesToBurn) external {
        if (sharesToBurn == 0) revert StakingErrors.ZeroSharesAmount();

        ProfileStorage ps = profileStorage;
        StakingStorage ss = stakingStorage;

        if (!ps.profileExists(identityId)) revert ProfileErrors.ProfileDoesntExist(identityId);

        Shares sharesContract = Shares(ps.getSharesContractAddress(identityId));

        if (sharesToBurn > sharesContract.balanceOf(msg.sender))
            revert TokenErrors.TooLowBalance(address(sharesContract), sharesContract.balanceOf(msg.sender));

        uint96 oldStake = ss.totalStakes(identityId);
        uint96 stakeWithdrawalAmount = uint96((uint256(oldStake) * sharesToBurn) / sharesContract.totalSupply());
        uint96 newStake = oldStake - stakeWithdrawalAmount;
        uint96 newStakeWithdrawalAmount = ss.getWithdrawalRequestAmount(identityId, msg.sender) + stakeWithdrawalAmount;

        ParametersStorage params = parametersStorage;

        uint256 withdrawalPeriodEnd = block.timestamp + params.stakeWithdrawalDelay();
        ss.createWithdrawalRequest(identityId, msg.sender, newStakeWithdrawalAmount, withdrawalPeriodEnd);
        ss.setTotalStake(identityId, newStake);
        sharesContract.burnFrom(msg.sender, sharesToBurn);

        if (shardingTableStorage.nodeExists(identityId) && (newStake < params.minimumStake()))
            shardingTableContract.removeNode(identityId);

        emit StakeWithdrawalStarted(
            identityId,
            ps.getNodeId(identityId),
            msg.sender,
            oldStake,
            newStake,
            withdrawalPeriodEnd
        );
    }

    function withdrawStake(uint72 identityId) external {
        ProfileStorage ps = profileStorage;

        if (!ps.profileExists(identityId)) revert ProfileErrors.ProfileDoesntExist(identityId);

        StakingStorage ss = stakingStorage;

        uint96 stakeWithdrawalAmount;
        uint256 withdrawalTimestamp;
        (stakeWithdrawalAmount, withdrawalTimestamp) = ss.withdrawalRequests(identityId, msg.sender);

        if (stakeWithdrawalAmount == 0) revert StakingErrors.WithdrawalWasntInitiated();
        if (withdrawalTimestamp >= block.timestamp) revert StakingErrors.WithdrawalPeriodPending(withdrawalTimestamp);

        ss.deleteWithdrawalRequest(identityId, msg.sender);
        ss.transferStake(msg.sender, stakeWithdrawalAmount);

        emit StakeWithdrawn(identityId, ps.getNodeId(identityId), msg.sender, stakeWithdrawalAmount);
    }

    function addReward(bytes32 agreementId, uint72 identityId, uint96 rewardAmount) external onlyContracts {
        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;
        StakingStorage ss = stakingStorage;

        uint96 operatorFee = (rewardAmount * (ss.operatorFees(identityId) & 127)) / 100;
        uint96 delegatorsReward = rewardAmount - operatorFee;

        ProfileStorage ps = profileStorage;

        uint96 oldAccumulatedOperatorFee = ps.getAccumulatedOperatorFee(identityId);
        uint96 oldStake = ss.totalStakes(identityId);

        if (operatorFee != 0) {
            ps.setAccumulatedOperatorFee(identityId, oldAccumulatedOperatorFee + operatorFee);
            sasProxy.transferAgreementTokens(agreementId, address(ps), operatorFee);
        }

        if (delegatorsReward != 0) {
            ss.setTotalStake(identityId, oldStake + delegatorsReward);
            sasProxy.transferAgreementTokens(agreementId, address(ss), delegatorsReward);

            if (!shardingTableStorage.nodeExists(identityId) && oldStake >= parametersStorage.minimumStake())
                shardingTableContract.insertNode(identityId);
        }

        emit AccumulatedOperatorFeeIncreased(
            identityId,
            ps.getNodeId(identityId),
            oldAccumulatedOperatorFee,
            oldAccumulatedOperatorFee + operatorFee
        );

        address sasAddress;
        if (sasProxy.agreementV1Exists(agreementId)) sasAddress = sasProxy.agreementV1StorageAddress();
        else sasAddress = sasProxy.agreementV1U1StorageAddress();

        emit StakeIncreased(identityId, ps.getNodeId(identityId), sasAddress, oldStake, oldStake + delegatorsReward);
    }

    // solhint-disable-next-line no-empty-blocks
    function slash(uint72 identityId) external onlyContracts {
        // TBD
    }

    function setOperatorFee(uint72 identityId, uint8 operatorFee) external onlyAdmin(identityId) {
        if (operatorFee > 100) revert StakingErrors.InvalidOperatorFee();

        StakingStorage ss = stakingStorage;

        uint96 latestDelayEndTimestamp = ss.operatorFees(identityId) >> 7;

        if (block.timestamp < latestDelayEndTimestamp) {
            revert StakingErrors.OperatorFeeChangeOnCooldown(identityId, block.timestamp, latestDelayEndTimestamp);
        }

        uint96 operatorFeeWithTimestamp = ((uint96(block.timestamp + parametersStorage.stakeWithdrawalDelay()) << 7) |
            operatorFee);

        ss.setOperatorFee(identityId, operatorFeeWithTimestamp);

        emit OperatorFeeUpdated(identityId, profileStorage.getNodeId(identityId), operatorFeeWithTimestamp);
    }

    function _addStake(address sender, uint72 identityId, uint96 stakeAmount) internal virtual {
        StakingStorage ss = stakingStorage;
        ProfileStorage ps = profileStorage;
        ParametersStorage params = parametersStorage;
        IERC20 tknc = tokenContract;

        uint96 oldStake = ss.totalStakes(identityId);
        uint96 newStake = oldStake + stakeAmount;

        if (!ps.profileExists(identityId)) revert ProfileErrors.ProfileDoesntExist(identityId);
        if (stakeAmount > tknc.allowance(sender, address(this)))
            revert TokenErrors.TooLowAllowance(address(tknc), tknc.allowance(sender, address(this)));
        if (newStake > params.maximumStake()) revert StakingErrors.MaximumStakeExceeded(params.maximumStake());

        Shares sharesContract = Shares(ps.getSharesContractAddress(identityId));

        uint256 sharesMinted;
        if (sharesContract.totalSupply() == 0) sharesMinted = stakeAmount;
        else sharesMinted = ((uint256(stakeAmount) * sharesContract.totalSupply()) / oldStake);

        sharesContract.mint(sender, sharesMinted);

        ss.setTotalStake(identityId, newStake);
        tknc.transferFrom(sender, address(ss), stakeAmount);

        if (!shardingTableStorage.nodeExists(identityId) && newStake >= params.minimumStake())
            shardingTableContract.insertNode(identityId);

        emit StakeIncreased(identityId, ps.getNodeId(identityId), sender, oldStake, newStake);
    }

    function _checkAdmin(uint72 identityId) internal view virtual {
        if (!identityStorage.keyHasPurpose(identityId, keccak256(abi.encodePacked(msg.sender)), ADMIN_KEY))
            revert GeneralErrors.OnlyProfileAdminFunction(msg.sender);
    }
}
