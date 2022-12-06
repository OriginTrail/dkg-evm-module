// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import { HashingProxy } from "./HashingProxy.sol";
import { Hub } from "./Hub.sol";
import { Identity } from "./Identity.sol";
import { Shares } from "./Shares.sol";
import { Staking } from "./Staking.sol";
import { IdentityStorage } from "./storage/IdentityStorage.sol";
import { ParametersStorage } from "./storage/ParametersStorage.sol";
import { ProfileStorage } from "./storage/ProfileStorage.sol";
import { WhitelistStorage } from "./storage/WhitelistStorage.sol";
import { Named } from "./interface/Named.sol";
import { Versioned } from "./interface/Versioned.sol";
import { UnorderedIndexableContractDynamicSetLib } from "./utils/UnorderedIndexableContractDynamicSet.sol";
import { ADMIN_KEY, OPERATIONAL_KEY } from "./constants/IdentityConstants.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";

contract Profile is Named, Versioned {

    event ProfileCreated(uint72 indexed identityId, bytes nodeId);
    event ProfileDeleted(uint72 indexed identityId);
    event AskUpdated(uint72 indexed identityId, bytes nodeId, uint96 ask);

    string constant private _NAME = "Profile";
    string constant private _VERSION = "1.0.0";

    Hub public hub;
    HashingProxy public hashingProxy;
    Identity public identityContract;
    Staking public stakingContract;
    IdentityStorage public identityStorage;
    ParametersStorage public parametersStorage;
    ProfileStorage public profileStorage;
    WhitelistStorage public whitelistStorage;

    constructor(address hubAddress) {
        require(hubAddress != address(0));

        hub = Hub(hubAddress);
        initialize();
    }

    modifier onlyHubOwner() {
		_checkHubOwner();
		_;
	}

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
        profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        whitelistStorage = WhitelistStorage(hub.getContractAddress("WhitelistStorage"));
	}

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function createProfile(address adminWallet, bytes calldata nodeId) external onlyWhitelisted {
        IdentityStorage ids = identityStorage;
        ProfileStorage ps = profileStorage;

        require(ids.getIdentityId(msg.sender) == 0, "Identity already exists");
        require(nodeId.length != 0, "Node ID can't be empty");
        require(!ps.nodeIdRegistered(nodeId), "Node ID is already registered");

        uint72 identityId = identityContract.createIdentity(msg.sender, adminWallet);

        string memory identityIdString = Strings.toString(identityId);
        Shares sharesContract = new Shares(
            address(hub),
            string.concat("Share token ", identityIdString),
            string.concat("DKGSTAKE_", identityIdString)
        );

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
    //     require(hashingProxy.isHashFunction(hashFunctionId), "Hash function doesn't exist");

    //     profileStorage.setNodeAddress(identityId, hashFunctionId);
    // }

    // TODO: Define where it can be called, change internal modifier
    function _setAvailableNodeAddresses(uint72 identityId) internal {
        ProfileStorage ps = profileStorage;
        HashingProxy hp = hashingProxy;

        UnorderedIndexableContractDynamicSetLib.Contract[] memory hashFunctions = hp.getAllHashFunctions();
        uint256 hashFunctionsNumber = hashFunctions.length;
        for (uint8 i; i < hashFunctionsNumber; ) {
            ps.setNodeAddress(identityId, hashFunctions[i].id);
            unchecked { i++; }
        }
    }

    function stakeAccumulatedOperatorFee(uint72 identityId) external onlyAdmin(identityId) {
        ProfileStorage ps = profileStorage;

        require(ps.profileExists(identityId), "Profile doesn't exist");

        uint96 accumulatedOperatorFee = ps.getAccumulatedOperatorFee(identityId);
        require(accumulatedOperatorFee != 0, "You have no operator fees");

        ps.setAccumulatedOperatorFee(identityId, 0);
        stakingContract.addStake(msg.sender, identityId, accumulatedOperatorFee);
    }

    function startAccumulatedOperatorFeeWithdrawal(uint72 identityId) external onlyAdmin(identityId) {
        ProfileStorage ps = profileStorage;

        require(ps.profileExists(identityId), "Profile doesn't exist");

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

        require(ps.profileExists(identityId), "Profile doesn't exist");

        uint96 withdrawalAmount = ps.getAccumulatedOperatorFeeWithdrawalAmount(identityId);

        require(withdrawalAmount != 0, "Withdrawal hasn't been initiated");
        require(
            ps.getAccumulatedOperatorFeeWithdrawalTimestamp(identityId) < block.timestamp,
            "Withdrawal period hasn't ended"
        );

        ps.setAccumulatedOperatorFeeWithdrawalAmount(identityId, 0);
        ps.setAccumulatedOperatorFeeWithdrawalTimestamp(identityId, 0);
        ps.transferTokens(msg.sender, withdrawalAmount);
    }

    function _checkHubOwner() internal view virtual {
		require(msg.sender == hub.owner(), "Fn can only be used by hub owner");
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
