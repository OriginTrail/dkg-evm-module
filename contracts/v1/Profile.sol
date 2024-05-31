// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {HashingProxy} from "./HashingProxy.sol";
import {Identity} from "./Identity.sol";
import {Shares} from "./Shares.sol";
import {IdentityStorage} from "./storage/IdentityStorage.sol";
import {ParametersStorage} from "./storage/ParametersStorage.sol";
import {ProfileStorage} from "./storage/ProfileStorage.sol";
import {StakingStorage} from "./storage/StakingStorage.sol";
import {Staking} from "./Staking.sol";
import {NodeOperatorFeesStorage} from "../v2/storage/NodeOperatorFeesStorage.sol";
import {WhitelistStorage} from "./storage/WhitelistStorage.sol";
import {ContractStatus} from "./abstract/ContractStatus.sol";
import {Initializable} from "./interface/Initializable.sol";
import {Named} from "./interface/Named.sol";
import {Versioned} from "./interface/Versioned.sol";
import {GeneralErrors} from "./errors/GeneralErrors.sol";
import {ProfileErrors} from "./errors/ProfileErrors.sol";
import {StakingErrors} from "./errors/StakingErrors.sol";
import {UnorderedIndexableContractDynamicSetLib} from "./utils/UnorderedIndexableContractDynamicSet.sol";
import {ADMIN_KEY, OPERATIONAL_KEY} from "./constants/IdentityConstants.sol";

contract Profile is Named, Versioned, ContractStatus, Initializable {
    event ProfileCreated(
        uint72 indexed identityId,
        bytes nodeId,
        address adminWallet,
        address sharesContractAddress,
        uint8 initialOperatorFee
    );
    event ProfileDeleted(uint72 indexed identityId);
    event AskUpdated(uint72 indexed identityId, bytes nodeId, uint96 ask);
    event AccumulatedOperatorFeeWithdrawalStarted(
        uint72 indexed identityId,
        bytes nodeId,
        uint96 oldAccumulatedOperatorFee,
        uint96 newAccumulatedOperatorFee,
        uint256 withdrawalPeriodEnd
    );
    event AccumulatedOperatorFeeWithdrawn(uint72 indexed identityId, bytes nodeId, uint96 withdrawnAmount);
    event AccumulatedOperatorFeeRestaked(
        uint72 indexed identityId,
        bytes nodeId,
        uint96 oldAccumulatedOperatorFee,
        uint96 newAccumulatedOperatorFee
    );

    string private constant _NAME = "Profile";
    string private constant _VERSION = "1.2.0";

    HashingProxy public hashingProxy;
    Identity public identityContract;
    StakingStorage public stakingStorage;
    Staking public stakingContract;
    IdentityStorage public identityStorage;
    ParametersStorage public parametersStorage;
    ProfileStorage public profileStorage;
    WhitelistStorage public whitelistStorage;
    NodeOperatorFeesStorage public nodeOperatorFeesStorage;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) ContractStatus(hubAddress) {}

    modifier onlyIdentityOwner(uint72 identityId) {
        _checkIdentityOwner(identityId);
        _;
    }

    modifier onlyAdmin(uint72 identityId) {
        _checkAdmin(identityId);
        _;
    }

    modifier onlyOperational(uint72 identityId) {
        _checkOperational(identityId);
        _;
    }

    modifier onlyWhitelisted() {
        _checkWhitelist();
        _;
    }

    function initialize() public onlyHubOwner {
        hashingProxy = HashingProxy(hub.getContractAddress("HashingProxy"));
        identityContract = Identity(hub.getContractAddress("Identity"));
        stakingStorage = StakingStorage(hub.getContractAddress("StakingStorage"));
        stakingContract = Staking(hub.getContractAddress("Staking"));
        identityStorage = IdentityStorage(hub.getContractAddress("IdentityStorage"));
        parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));
        profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        whitelistStorage = WhitelistStorage(hub.getContractAddress("WhitelistStorage"));
        nodeOperatorFeesStorage = NodeOperatorFeesStorage(hub.getContractAddress("NodeOperatorFeesStorage"));
    }

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function createProfile(
        address adminWallet,
        address[] calldata operationalWallets,
        bytes calldata nodeId,
        string calldata sharesTokenName,
        string calldata sharesTokenSymbol,
        uint8 initialOperatorFee
    ) external onlyWhitelisted {
        IdentityStorage ids = identityStorage;
        ProfileStorage ps = profileStorage;
        NodeOperatorFeesStorage nofs = nodeOperatorFeesStorage;
        Identity id = identityContract;

        if (ids.getIdentityId(msg.sender) != 0) {
            revert ProfileErrors.IdentityAlreadyExists(ids.getIdentityId(msg.sender), msg.sender);
        }
        if (operationalWallets.length > parametersStorage.opWalletsLimitOnProfileCreation()) {
            revert ProfileErrors.TooManyOperationalWallets(
                parametersStorage.opWalletsLimitOnProfileCreation(),
                uint16(operationalWallets.length)
            );
        }
        if (nodeId.length == 0) {
            revert ProfileErrors.EmptyNodeId();
        }
        if (ps.nodeIdsList(nodeId)) {
            revert ProfileErrors.NodeIdAlreadyExists(nodeId);
        }
        if (keccak256(abi.encodePacked(sharesTokenName)) == keccak256(abi.encodePacked(""))) {
            revert ProfileErrors.EmptySharesTokenName();
        }
        if (keccak256(abi.encodePacked(sharesTokenSymbol)) == keccak256(abi.encodePacked(""))) {
            revert ProfileErrors.EmptySharesTokenSymbol();
        }
        if (ps.sharesNames(sharesTokenName)) {
            revert ProfileErrors.SharesTokenNameAlreadyExists(sharesTokenName);
        }
        if (ps.sharesSymbols(sharesTokenSymbol)) {
            revert ProfileErrors.SharesTokenSymbolAlreadyExists(sharesTokenSymbol);
        }
        if (initialOperatorFee > 100) {
            revert ProfileErrors.OperatorFeeOutOfRange(initialOperatorFee);
        }
        uint72 identityId = id.createIdentity(msg.sender, adminWallet);
        id.addOperationalWallets(identityId, operationalWallets);

        Shares sharesContract = new Shares(address(hub), sharesTokenName, sharesTokenSymbol);

        ps.createProfile(identityId, nodeId, address(sharesContract));
        _setAvailableNodeAddresses(identityId);

        nofs.addOperatorFee(identityId, initialOperatorFee, uint248(block.timestamp));

        emit ProfileCreated(identityId, nodeId, adminWallet, address(sharesContract), initialOperatorFee);
    }

    function setAsk(uint72 identityId, uint96 ask) external onlyIdentityOwner(identityId) {
        if (ask == 0) {
            revert ProfileErrors.ZeroAsk();
        }
        ProfileStorage ps = profileStorage;
        ps.setAsk(identityId, ask);

        emit AskUpdated(identityId, ps.getNodeId(identityId), ask);
    }

    function _setAvailableNodeAddresses(uint72 identityId) internal virtual {
        ProfileStorage ps = profileStorage;
        HashingProxy hp = hashingProxy;

        bytes memory nodeId = ps.getNodeId(identityId);
        bytes32 nodeAddress;

        UnorderedIndexableContractDynamicSetLib.Contract[] memory hashFunctions = hp.getAllHashFunctions();
        require(hashFunctions.length <= parametersStorage.hashFunctionsLimit(), "Too many hash functions!");
        uint8 hashFunctionId;
        for (uint8 i; i < hashFunctions.length; ) {
            hashFunctionId = hashFunctions[i].id;
            nodeAddress = hp.callHashFunction(hashFunctionId, nodeId);
            ps.setNodeAddress(identityId, hashFunctionId, nodeAddress);
            unchecked {
                i++;
            }
        }
    }

    function stakeAccumulatedOperatorFee(uint72 identityId, uint96 restakeAmount) external onlyAdmin(identityId) {
        require(restakeAmount != 0, "Restake amount cannot be 0");

        ProfileStorage ps = profileStorage;

        uint96 oldAccumulatedOperatorFee = ps.getAccumulatedOperatorFee(identityId);

        require(restakeAmount <= oldAccumulatedOperatorFee, "Restake must be <= balance");

        ps.setAccumulatedOperatorFee(identityId, oldAccumulatedOperatorFee - restakeAmount);
        stakingContract.addStake(msg.sender, identityId, restakeAmount);

        emit AccumulatedOperatorFeeRestaked(
            identityId,
            ps.getNodeId(identityId),
            oldAccumulatedOperatorFee,
            oldAccumulatedOperatorFee - restakeAmount
        );
    }

    function startAccumulatedOperatorFeeWithdrawal(
        uint72 identityId,
        uint96 withdrawalAmount
    ) external onlyAdmin(identityId) {
        require(withdrawalAmount != 0, "Withdrawal amount cannot be 0");

        ProfileStorage ps = profileStorage;

        uint96 oldAccumulatedOperatorFee = ps.getAccumulatedOperatorFee(identityId);

        require(withdrawalAmount <= oldAccumulatedOperatorFee, "Withdrawal must be <= balance");

        ps.setAccumulatedOperatorFee(identityId, oldAccumulatedOperatorFee - withdrawalAmount);
        ps.setAccumulatedOperatorFeeWithdrawalAmount(
            identityId,
            ps.getAccumulatedOperatorFeeWithdrawalAmount(identityId) + withdrawalAmount
        );
        ps.setAccumulatedOperatorFeeWithdrawalTimestamp(
            identityId,
            block.timestamp + parametersStorage.stakeWithdrawalDelay()
        );

        emit AccumulatedOperatorFeeWithdrawalStarted(
            identityId,
            ps.getNodeId(identityId),
            oldAccumulatedOperatorFee,
            oldAccumulatedOperatorFee - withdrawalAmount,
            block.timestamp + parametersStorage.stakeWithdrawalDelay()
        );
    }

    function withdrawAccumulatedOperatorFee(uint72 identityId) external onlyAdmin(identityId) {
        ProfileStorage ps = profileStorage;

        uint96 withdrawalAmount = ps.getAccumulatedOperatorFeeWithdrawalAmount(identityId);

        if (withdrawalAmount == 0) {
            revert StakingErrors.WithdrawalWasntInitiated();
        }
        if (ps.getAccumulatedOperatorFeeWithdrawalTimestamp(identityId) >= block.timestamp) {
            revert StakingErrors.WithdrawalPeriodPending(
                block.timestamp,
                ps.getAccumulatedOperatorFeeWithdrawalTimestamp(identityId)
            );
        }
        ps.setAccumulatedOperatorFeeWithdrawalAmount(identityId, 0);
        ps.setAccumulatedOperatorFeeWithdrawalTimestamp(identityId, 0);
        ps.transferAccumulatedOperatorFee(msg.sender, withdrawalAmount);

        emit AccumulatedOperatorFeeWithdrawn(identityId, ps.getNodeId(identityId), withdrawalAmount);
    }

    function _checkIdentityOwner(uint72 identityId) internal view virtual {
        if (
            !identityStorage.keyHasPurpose(identityId, keccak256(abi.encodePacked(msg.sender)), ADMIN_KEY) &&
            !identityStorage.keyHasPurpose(identityId, keccak256(abi.encodePacked(msg.sender)), OPERATIONAL_KEY)
        ) {
            revert GeneralErrors.OnlyProfileAdminOrOperationalAddressesFunction(msg.sender);
        }
    }

    function _checkAdmin(uint72 identityId) internal view virtual {
        if (!identityStorage.keyHasPurpose(identityId, keccak256(abi.encodePacked(msg.sender)), ADMIN_KEY)) {
            revert GeneralErrors.OnlyProfileAdminFunction(msg.sender);
        }
    }

    function _checkOperational(uint72 identityId) internal view virtual {
        if (!identityStorage.keyHasPurpose(identityId, keccak256(abi.encodePacked(msg.sender)), OPERATIONAL_KEY)) {
            revert GeneralErrors.OnlyProfileOperationalWalletFunction(msg.sender);
        }
    }

    function _checkWhitelist() internal view virtual {
        WhitelistStorage ws = whitelistStorage;
        if (ws.whitelistingEnabled() && !ws.whitelisted(msg.sender)) {
            revert GeneralErrors.OnlyWhitelistedAddressesFunction(msg.sender);
        }
    }
}
