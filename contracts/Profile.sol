// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {Identity} from "./Identity.sol";
import {Ask} from "./Ask.sol";
import {IdentityStorage} from "./storage/IdentityStorage.sol";
import {ParametersStorage} from "./storage/ParametersStorage.sol";
import {ProfileStorage} from "./storage/ProfileStorage.sol";
import {WhitelistStorage} from "./storage/WhitelistStorage.sol";
import {ContractStatus} from "./abstract/ContractStatus.sol";
import {IInitializable} from "./interfaces/IInitializable.sol";
import {INamed} from "./interfaces/INamed.sol";
import {IVersioned} from "./interfaces/IVersioned.sol";
import {ProfileLib} from "./libraries/ProfileLib.sol";
import {IdentityLib} from "./libraries/IdentityLib.sol";
import {Permissions} from "./libraries/Permissions.sol";

contract Profile is INamed, IVersioned, ContractStatus, IInitializable {
    string private constant _NAME = "Profile";
    string private constant _VERSION = "1.0.0";

    Ask public askContract;
    Identity public identityContract;
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
        askContract = Ask(hub.getContractAddress("Ask"));
        identityContract = Identity(hub.getContractAddress("Identity"));
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
        string calldata nodeName,
        bytes calldata nodeId,
        uint16 initialOperatorFee
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
        if (bytes(nodeName).length == 0) {
            revert ProfileLib.EmptyNodeName();
        }
        if (ps.isNameTaken(nodeName)) {
            revert ProfileLib.NodeNameAlreadyExists(nodeName);
        }
        if (nodeId.length == 0) {
            revert ProfileLib.EmptyNodeId();
        }
        if (ps.nodeIdsList(nodeId)) {
            revert ProfileLib.NodeIdAlreadyExists(nodeId);
        }
        if (initialOperatorFee > 10000) {
            revert ProfileLib.OperatorFeeOutOfRange(initialOperatorFee);
        }
        uint72 identityId = id.createIdentity(msg.sender, adminWallet);
        id.addOperationalWallets(identityId, operationalWallets);

        ps.createProfile(identityId, nodeName, nodeId, initialOperatorFee);
    }

    function updateAsk(uint72 identityId, uint96 ask) external onlyIdentityOwner(identityId) {
        if (ask == 0) {
            revert ProfileLib.ZeroAsk();
        }

        ProfileStorage ps = profileStorage;

        if (block.timestamp < ps.askUpdateCooldown(identityId)) {
            revert ProfileLib.AskUpdateOnCooldown(identityId, ps.askUpdateCooldown(identityId));
        }

        ps.setAsk(identityId, ask);
        ps.setAskUpdateCooldown(identityId, block.timestamp + parametersStorage.nodeAskUpdateDelay());
        askContract.recalculateActiveSet();
    }

    function updateOperatorFee(uint72 identityId, uint16 newOperatorFee) external onlyAdmin(identityId) {
        if (newOperatorFee > 10000) {
            revert ProfileLib.InvalidOperatorFee();
        }

        ProfileStorage ps = profileStorage;

        if (ps.isOperatorFeeChangePending(identityId)) {
            ps.replacePendingOperatorFee(
                identityId,
                newOperatorFee,
                block.timestamp + parametersStorage.operatorFeeUpdateDelay()
            );
        } else {
            ps.addOperatorFee(identityId, newOperatorFee, block.timestamp + parametersStorage.operatorFeeUpdateDelay());
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
