// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {HashingProxy} from "./HashingProxy.sol";
import {Identity} from "./Identity.sol";
import {Shares} from "./Shares.sol";
import {IdentityStorage} from "./storage/IdentityStorage.sol";
import {ParametersStorage} from "./storage/ParametersStorage.sol";
import {ProfileStorage} from "./storage/ProfileStorage.sol";
import {Staking} from "./Staking.sol";
import {WhitelistStorage} from "./storage/WhitelistStorage.sol";
import {ContractStatus} from "./abstract/ContractStatus.sol";
import {Initializable} from "./interface/Initializable.sol";
import {Named} from "./interface/Named.sol";
import {Versioned} from "./interface/Versioned.sol";
import {UnorderedIndexableContractDynamicSetLib} from "./utils/UnorderedIndexableContractDynamicSet.sol";
import {ADMIN_KEY, OPERATIONAL_KEY} from "./constants/IdentityConstants.sol";

contract Profile is Named, Versioned, ContractStatus, Initializable {
    event ProfileCreated(uint72 indexed identityId, bytes nodeId);
    event ProfileDeleted(uint72 indexed identityId);
    event AskUpdated(uint72 indexed identityId, bytes nodeId, uint96 ask);

    string private constant _NAME = "Profile";
    string private constant _VERSION = "1.0.2";

    HashingProxy public hashingProxy;
    Identity public identityContract;
    Staking public stakingContract;
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

    function initialize() public onlyHubOwner {
        hashingProxy = HashingProxy(hub.getContractAddress("HashingProxy"));
        identityContract = Identity(hub.getContractAddress("Identity"));
        stakingContract = Staking(hub.getContractAddress("Staking"));
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
        bytes calldata nodeId,
        string calldata sharesTokenName,
        string calldata sharesTokenSymbol
    ) external onlyWhitelisted {
        IdentityStorage ids = identityStorage;
        ProfileStorage ps = profileStorage;

        require(ids.getIdentityId(msg.sender) == 0, "Identity already exists");
        require(nodeId.length != 0, "Node ID can't be empty");
        require(!ps.nodeIdsList(nodeId), "Node ID is already registered");
        require(
            keccak256(abi.encodePacked(sharesTokenName)) != keccak256(abi.encodePacked("")),
            "Token name cannot be empty"
        );
        require(
            keccak256(abi.encodePacked(sharesTokenSymbol)) != keccak256(abi.encodePacked("")),
            "Token symbol cannot be empty"
        );
        require(!ps.sharesNames(sharesTokenName), "Token name is already taken");
        require(!ps.sharesSymbols(sharesTokenSymbol), "Token symbol is already taken");

        uint72 identityId = identityContract.createIdentity(msg.sender, adminWallet);

        Shares sharesContract = new Shares(address(hub), sharesTokenName, sharesTokenSymbol);

        ps.createProfile(identityId, nodeId, address(sharesContract));
        _setAvailableNodeAddresses(identityId);

        emit ProfileCreated(identityId, nodeId);
    }

    function setAsk(uint72 identityId, uint96 ask) external onlyIdentityOwner(identityId) {
        require(ask != 0, "Ask cannot be 0");
        ProfileStorage ps = profileStorage;
        ps.setAsk(identityId, ask);

        emit AskUpdated(identityId, ps.getNodeId(identityId), ask);
    }

    // function deleteProfile(uint72 identityId) external onlyAdmin(identityId) {
    //     // TODO: add checks
    //     profileStorage.deleteProfile(identityId);
    //     identityContract.deleteIdentity(identityId);
    //
    //     emit ProfileDeleted(identityId);
    // }

    // function changeNodeId(uint72 identityId, bytes calldata nodeId) external onlyOperational(identityId) {
    //     require(nodeId.length != 0, "Node ID can't be empty");

    //     profileStorage.setNodeId(identityId, nodeId);
    // }

    // function addNewNodeIdHash(uint72 identityId, uint8 hashFunctionId) external onlyOperational(identityId) {
    //     HashingProxy hp = hashingProxy;
    //     require(hp.isHashFunction(hashFunctionId), "Hash function doesn't exist");

    //     profileStorage.setNodeAddress(
    //         identityId,
    //         hashFunctionId,
    //         hp.callHashFunction(hashFunctionId, profileStorage.getNodeId(identityId))
    //     );
    // }

    // TODO: Define where it can be called, change internal modifier
    function _setAvailableNodeAddresses(uint72 identityId) internal virtual {
        ProfileStorage ps = profileStorage;
        HashingProxy hp = hashingProxy;

        bytes memory nodeId = ps.getNodeId(identityId);
        bytes32 nodeAddress;

        UnorderedIndexableContractDynamicSetLib.Contract[] memory hashFunctions = hp.getAllHashFunctions();
        uint256 hashFunctionsNumber = hashFunctions.length;
        uint8 hashFunctionId;
        for (uint8 i; i < hashFunctionsNumber; ) {
            hashFunctionId = hashFunctions[i].id;
            nodeAddress = hp.callHashFunction(hashFunctionId, nodeId);
            ps.setNodeAddress(identityId, hashFunctionId, nodeAddress);
            unchecked {
                i++;
            }
        }
    }

    function stakeAccumulatedOperatorFee(uint72 identityId) external onlyAdmin(identityId) {
        ProfileStorage ps = profileStorage;

        uint96 accumulatedOperatorFee = ps.getAccumulatedOperatorFee(identityId);
        require(accumulatedOperatorFee != 0, "You have no operator fees");

        ps.setAccumulatedOperatorFee(identityId, 0);
        stakingContract.addStake(msg.sender, identityId, accumulatedOperatorFee);
    }

    function startAccumulatedOperatorFeeWithdrawal(uint72 identityId) external onlyAdmin(identityId) {
        ProfileStorage ps = profileStorage;

        uint96 accumulatedOperatorFee = ps.getAccumulatedOperatorFee(identityId);

        require(accumulatedOperatorFee != 0, "You have no operator fees");

        ps.setAccumulatedOperatorFee(identityId, 0);
        ps.setAccumulatedOperatorFeeWithdrawalAmount(
            identityId,
            ps.getAccumulatedOperatorFeeWithdrawalAmount(identityId) + accumulatedOperatorFee
        );
        ps.setAccumulatedOperatorFeeWithdrawalTimestamp(
            identityId,
            block.timestamp + parametersStorage.stakeWithdrawalDelay()
        );
    }

    function withdrawAccumulatedOperatorFee(uint72 identityId) external onlyAdmin(identityId) {
        ProfileStorage ps = profileStorage;

        uint96 withdrawalAmount = ps.getAccumulatedOperatorFeeWithdrawalAmount(identityId);

        require(withdrawalAmount != 0, "Withdrawal hasn't been initiated");
        require(
            ps.getAccumulatedOperatorFeeWithdrawalTimestamp(identityId) < block.timestamp,
            "Withdrawal period hasn't ended"
        );

        ps.setAccumulatedOperatorFeeWithdrawalAmount(identityId, 0);
        ps.setAccumulatedOperatorFeeWithdrawalTimestamp(identityId, 0);
        ps.transferAccumulatedOperatorFee(msg.sender, withdrawalAmount);
    }

    function _checkIdentityOwner(uint72 identityId) internal view virtual {
        require(
            identityStorage.keyHasPurpose(identityId, keccak256(abi.encodePacked(msg.sender)), ADMIN_KEY) ||
                identityStorage.keyHasPurpose(identityId, keccak256(abi.encodePacked(msg.sender)), OPERATIONAL_KEY),
            "Fn can be used only by id owner"
        );
    }

    function _checkAdmin(uint72 identityId) internal view virtual {
        require(
            identityStorage.keyHasPurpose(identityId, keccak256(abi.encodePacked(msg.sender)), ADMIN_KEY),
            "Admin function"
        );
    }

    function _checkOperational(uint72 identityId) internal view virtual {
        require(
            identityStorage.keyHasPurpose(identityId, keccak256(abi.encodePacked(msg.sender)), OPERATIONAL_KEY),
            "Fn can be called only by oper."
        );
    }

    function _checkWhitelist() internal view virtual {
        WhitelistStorage ws = whitelistStorage;
        if (ws.whitelistingEnabled()) {
            require(ws.whitelisted(msg.sender), "Address isn't whitelisted");
        }
    }
}
