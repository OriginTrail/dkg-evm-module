// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {ShardingTable} from "./ShardingTable.sol";
import {Shares} from "./Shares.sol";
import {IdentityStorage} from "./storage/IdentityStorage.sol";
import {ParametersStorage} from "./storage/ParametersStorage.sol";
import {ProfileStorage} from "./storage/ProfileStorage.sol";
import {ServiceAgreementStorageProxy} from "./storage/ServiceAgreementStorageProxy.sol";
import {ShardingTableStorage} from "./storage/ShardingTableStorage.sol";
import {StakingStorage} from "./storage/StakingStorage.sol";
import {ContractStatus} from "./abstract/ContractStatus.sol";
import {Initializable} from "./interface/Initializable.sol";
import {Named} from "./interface/Named.sol";
import {Versioned} from "./interface/Versioned.sol";
import {ADMIN_KEY} from "./constants/IdentityConstants.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Staking is Named, Versioned, ContractStatus, Initializable {
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
    event OperatorFeeUpdated(uint72 indexed identityId, bytes nodeId, uint8 operatorFee);

    string private constant _NAME = "Staking";
    string private constant _VERSION = "1.0.2";

    ShardingTable public shardingTableContract;
    IdentityStorage public identityStorage;
    ParametersStorage public parametersStorage;
    ProfileStorage public profileStorage;
    StakingStorage public stakingStorage;
    ServiceAgreementStorageProxy public serviceAgreementStorageProxy;
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
        serviceAgreementStorageProxy = ServiceAgreementStorageProxy(
            hub.getContractAddress("ServiceAgreementStorageProxy")
        );
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
        _addStake(sender, identityId, stakeAmount);
    }

    function addStake(uint72 identityId, uint96 stakeAmount) external onlyAdmin(identityId) {
        _addStake(msg.sender, identityId, stakeAmount);
    }

    function startStakeWithdrawal(uint72 identityId, uint96 sharesToBurn) external {
        require(sharesToBurn != 0, "Withdrawal amount cannot be 0");

        ProfileStorage ps = profileStorage;
        StakingStorage ss = stakingStorage;

        require(ps.profileExists(identityId), "Profile doesn't exist");

        Shares sharesContract = Shares(ps.getSharesContractAddress(identityId));

        require(sharesToBurn <= sharesContract.balanceOf(msg.sender), "sharesToBurn must be <= balance");

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

        require(ps.profileExists(identityId), "Profile doesn't exist");

        StakingStorage ss = stakingStorage;

        uint96 stakeWithdrawalAmount;
        uint256 withdrawalTimestamp;
        (stakeWithdrawalAmount, withdrawalTimestamp) = ss.withdrawalRequests(identityId, msg.sender);

        require(stakeWithdrawalAmount != 0, "Withdrawal hasn't been initiated");
        require(withdrawalTimestamp < block.timestamp, "Withdrawal period hasn't ended");

        ss.deleteWithdrawalRequest(identityId, msg.sender);
        ss.transferStake(msg.sender, stakeWithdrawalAmount);

        emit StakeWithdrawn(identityId, ps.getNodeId(identityId), msg.sender, stakeWithdrawalAmount);
    }

    function addReward(bytes32 agreementId, uint72 identityId, uint96 rewardAmount) external onlyContracts {
        ServiceAgreementStorageProxy sasProxy = serviceAgreementStorageProxy;
        StakingStorage ss = stakingStorage;

        uint96 operatorFee = (rewardAmount * ss.operatorFees(identityId)) / 100;
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
                shardingTableContract.pushBack(identityId);
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
        require(operatorFee <= 100, "Operator fee out of [0, 100]");
        stakingStorage.setOperatorFee(identityId, operatorFee);

        emit OperatorFeeUpdated(identityId, profileStorage.getNodeId(identityId), operatorFee);
    }

    function _addStake(address sender, uint72 identityId, uint96 stakeAmount) internal virtual {
        StakingStorage ss = stakingStorage;
        ProfileStorage ps = profileStorage;
        ParametersStorage params = parametersStorage;
        IERC20 tknc = tokenContract;

        uint96 oldStake = ss.totalStakes(identityId);
        uint96 newStake = oldStake + stakeAmount;

        require(ps.profileExists(identityId), "Profile doesn't exist");
        require(tknc.allowance(sender, address(this)) >= stakeAmount, "Allowance < stakeAmount");
        require(newStake <= params.maximumStake(), "Exceeded the maximum stake");

        Shares sharesContract = Shares(ps.getSharesContractAddress(identityId));

        uint256 sharesMinted;
        if (sharesContract.totalSupply() == 0) sharesMinted = stakeAmount;
        else sharesMinted = ((stakeAmount * sharesContract.totalSupply()) / oldStake);

        sharesContract.mint(sender, sharesMinted);

        ss.setTotalStake(identityId, newStake);
        tknc.transferFrom(sender, address(ss), stakeAmount);

        if (!shardingTableStorage.nodeExists(identityId) && newStake >= params.minimumStake())
            shardingTableContract.pushBack(identityId);

        emit StakeIncreased(identityId, ps.getNodeId(identityId), sender, oldStake, newStake);
    }

    function _checkAdmin(uint72 identityId) internal view virtual {
        require(
            identityStorage.keyHasPurpose(identityId, keccak256(abi.encodePacked(msg.sender)), ADMIN_KEY),
            "Admin function"
        );
    }
}
