// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {Identity} from "./Identity.sol";
import {Shares} from "./Shares.sol";
import {IdentityStorage} from "./storage/IdentityStorage.sol";
import {ParametersStorage} from "./storage/ParametersStorage.sol";
import {ProfileStorage} from "./storage/ProfileStorage.sol";
import {ShardingTable} from "./ShardingTable.sol";
import {ShardingTableStorage} from "./storage/ShardingTableStorage.sol";
import {StakingStorage} from "./storage/StakingStorage.sol";
import {WhitelistStorage} from "./storage/WhitelistStorage.sol";
import {ContractStatus} from "./abstract/ContractStatus.sol";
import {IInitializable} from "./interfaces/IInitializable.sol";
import {INamed} from "./interfaces/INamed.sol";
import {IVersioned} from "./interfaces/IVersioned.sol";
import {ProfileLib} from "./libraries/ProfileLib.sol";
import {IdentityLib} from "./libraries/IdentityLib.sol";
import {Permissions} from "./libraries/Permissions.sol";

contract Profile is INamed, IVersioned, ContractStatus, IInitializable {
    event ProfileCreated(
        uint72 indexed identityId,
        bytes nodeId,
        address adminWallet,
        address sharesContractAddress,
        uint8 initialOperatorFee
    );
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
    string private constant _VERSION = "1.0.0";

    Identity public identityContract;
    ShardingTableStorage public shardingTableStorage;
    ShardingTable public shardingTableContract;
    StakingStorage public stakingStorage;
    IdentityStorage public identityStorage;
    ParametersStorage public parametersStorage;
    ProfileStorage public profileStorage;
    WhitelistStorage public whitelistStorage;

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

    function initialize() public onlyHub {
        identityContract = Identity(hub.getContractAddress("Identity"));
        shardingTableStorage = ShardingTableStorage(hub.getContractAddress("ShardingTableStorage"));
        shardingTableContract = ShardingTable(hub.getContractAddress("ShardingTable"));
        stakingStorage = StakingStorage(hub.getContractAddress("StakingStorage"));
        identityStorage = IdentityStorage(hub.getContractAddress("IdentityStorage"));
        parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));
        profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        whitelistStorage = WhitelistStorage(hub.getContractAddress("WhitelistStorage"));
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
        uint96 initialAsk,
        string calldata sharesTokenName,
        string calldata sharesTokenSymbol,
        uint8 initialOperatorFee
    ) external onlyWhitelisted {
        IdentityStorage ids = identityStorage;
        ProfileStorage ps = profileStorage;
        Identity id = identityContract;

        if (ids.getIdentityId(msg.sender) != 0) {
            revert ProfileLib.IdentityAlreadyExists(ids.getIdentityId(msg.sender), msg.sender);
        }
        if (operationalWallets.length > parametersStorage.opWalletsLimitOnProfileCreation()) {
            revert ProfileLib.TooManyOperationalWallets(
                parametersStorage.opWalletsLimitOnProfileCreation(),
                uint16(operationalWallets.length)
            );
        }
        if (initialAsk == 0) {
            revert ProfileLib.ZeroAsk();
        }
        if (nodeId.length == 0) {
            revert ProfileLib.EmptyNodeId();
        }
        if (ps.nodeIdsList(nodeId)) {
            revert ProfileLib.NodeIdAlreadyExists(nodeId);
        }
        if (keccak256(abi.encodePacked(sharesTokenName)) == keccak256(abi.encodePacked(""))) {
            revert ProfileLib.EmptySharesTokenName();
        }
        if (keccak256(abi.encodePacked(sharesTokenSymbol)) == keccak256(abi.encodePacked(""))) {
            revert ProfileLib.EmptySharesTokenSymbol();
        }
        if (ps.sharesNames(sharesTokenName)) {
            revert ProfileLib.SharesTokenNameAlreadyExists(sharesTokenName);
        }
        if (ps.sharesSymbols(sharesTokenSymbol)) {
            revert ProfileLib.SharesTokenSymbolAlreadyExists(sharesTokenSymbol);
        }
        if (initialOperatorFee > 100) {
            revert ProfileLib.OperatorFeeOutOfRange(initialOperatorFee);
        }
        uint72 identityId = id.createIdentity(msg.sender, adminWallet);
        id.addOperationalWallets(identityId, operationalWallets);

        Shares sharesContract = new Shares(address(hub), sharesTokenName, sharesTokenSymbol);

        ps.createProfile(identityId, nodeId, initialAsk, address(sharesContract), initialOperatorFee);

        shardingTableContract.insertNode(identityId);

        emit ProfileCreated(identityId, nodeId, adminWallet, address(sharesContract), initialOperatorFee);
    }

    function setAsk(uint72 identityId, uint96 ask) external onlyIdentityOwner(identityId) {
        if (ask == 0) {
            revert ProfileLib.ZeroAsk();
        }
        ProfileStorage ps = profileStorage;
        uint96 oldAsk = ps.getAsk(identityId);
        ps.setAsk(identityId, ask);
        shardingTableStorage.onAskChanged(oldAsk, ask, stakingStorage.getNodeStake(identityId));

        emit AskUpdated(identityId, ps.getNodeId(identityId), ask);
    }

    function changeOperatorFee(uint72 identityId, uint8 newOperatorFee) external onlyAdmin(identityId) {
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
    }

    function _checkIdentityOwner(uint72 identityId) internal view virtual {
        if (
            !identityStorage.keyHasPurpose(
                identityId,
                keccak256(abi.encodePacked(msg.sender)),
                IdentityLib.ADMIN_KEY
            ) &&
            !identityStorage.keyHasPurpose(
                identityId,
                keccak256(abi.encodePacked(msg.sender)),
                IdentityLib.OPERATIONAL_KEY
            )
        ) {
            revert Permissions.OnlyProfileAdminOrOperationalAddressesFunction(msg.sender);
        }
    }

    function _checkAdmin(uint72 identityId) internal view virtual {
        if (
            !identityStorage.keyHasPurpose(identityId, keccak256(abi.encodePacked(msg.sender)), IdentityLib.ADMIN_KEY)
        ) {
            revert Permissions.OnlyProfileAdminFunction(msg.sender);
        }
    }

    function _checkOperational(uint72 identityId) internal view virtual {
        if (
            !identityStorage.keyHasPurpose(
                identityId,
                keccak256(abi.encodePacked(msg.sender)),
                IdentityLib.OPERATIONAL_KEY
            )
        ) {
            revert Permissions.OnlyProfileOperationalWalletFunction(msg.sender);
        }
    }

    function _checkWhitelist() internal view virtual {
        WhitelistStorage ws = whitelistStorage;
        if (ws.whitelistingEnabled() && !ws.whitelisted(msg.sender)) {
            revert Permissions.OnlyWhitelistedAddressesFunction(msg.sender);
        }
    }
}
