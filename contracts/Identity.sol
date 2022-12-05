// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import { Hub } from "./Hub.sol";
import { IdentityStorage } from "./storage/IdentityStorage.sol";
import { Named } from "./interface/Named.sol";
import { Versioned } from "./interface/Versioned.sol";
import { ADMIN_KEY, OPERATIONAL_KEY, ECDSA, RSA } from "./constants/IdentityConstants.sol";

contract Identity is Named, Versioned {

    event IdentityCreated(uint72 indexed identityId, bytes32 indexed operationalKey, bytes32 indexed adminKey);
    event IdentityDeleted(uint72 indexed identityId);

    string constant private _NAME = "Identity";
    string constant private _VERSION = "1.0.0";

    Hub public hub;
    IdentityStorage public identityStorage;

    constructor(address hubAddress) {
        require(hubAddress != address(0));

        hub = Hub(hubAddress);
        initialize();
    }

    modifier onlyOwner() {
		_checkOwner();
		_;
	}

    modifier onlyContracts() {
        _checkHub();
        _;
    }

    modifier onlyAdmin(uint72 identityId) {
        _checkAdmin(identityId);
        _;
    }

    function initialize() public onlyOwner {
		identityStorage = IdentityStorage(hub.getContractAddress("IdentityStorage"));
	}

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function createIdentity(address operational, address admin) external onlyContracts returns (uint72) {
        require(operational != address(0), "Operational address can't be 0x0");
        require(admin != address(0), "Admin address can't be 0x0");

        IdentityStorage ids = identityStorage;

        uint72 identityId = ids.generateIdentityId();

        bytes32 _admin_key = keccak256(abi.encodePacked(admin));
        ids.addKey(identityId, _admin_key, ADMIN_KEY, ECDSA);

        bytes32 _operational_key = keccak256(abi.encodePacked(operational));
        ids.addKey(identityId, _operational_key, OPERATIONAL_KEY, ECDSA);

        ids.setOperationalKeyIdentityId(_operational_key, identityId);

        emit IdentityCreated(
            identityId,
            _operational_key,
            _admin_key
        );

        return identityId;
    }

    function deleteIdentity(uint72 identityId) external onlyContracts {
        identityStorage.deleteIdentity(identityId);

        emit IdentityDeleted(identityId);
    }

    function addKey(uint72 identityId, bytes32 key, uint256 keyPurpose, uint256 keyType)
        external
        onlyAdmin(identityId)
    {
        require(key != bytes32(0), "Key arg is empty");

        IdentityStorage ids = identityStorage;

        bytes32 attachedKey;
        ( , , attachedKey) = ids.getKey(identityId, key);
        require(attachedKey != key, "Key is already attached");

        ids.addKey(identityId, key, keyPurpose, keyType);

        if (keyPurpose == OPERATIONAL_KEY) {
            ids.setOperationalKeyIdentityId(key, identityId);
        }
    }

    function removeKey(uint72 identityId, bytes32 key) external onlyAdmin(identityId) {
        require(key != bytes32(0), "Key arg is empty");

        IdentityStorage ids = identityStorage;

        uint256 purpose;
        bytes32 attachedKey;
        (purpose, , attachedKey) = ids.getKey(identityId, key);
        require(attachedKey == key, "Key isn't attached");

        require(
            !(
                ids.getKeysByPurpose(identityId, ADMIN_KEY).length == 1 &&
                ids.keyHasPurpose(identityId, key, ADMIN_KEY)
            ),
            "Cannot delete the only admin key"
        );
        require(
            !(
                ids.getKeysByPurpose(identityId, OPERATIONAL_KEY).length == 1 &&
                ids.keyHasPurpose(identityId, key, OPERATIONAL_KEY)
            ),
            "Cannot delete the only oper. key"
        );

        ids.removeKey(identityId, key);

        if (purpose == OPERATIONAL_KEY) {
            ids.removeOperationalKeyIdentityId(key);
        }
    }

    function _checkOwner() internal view virtual {
		require(msg.sender == hub.owner(), "Fn can only be used by hub owner");
	}

    function _checkHub() internal view virtual {
        require(hub.isContract(msg.sender), "Fn can only be called by the hub");
    }

    function _checkAdmin(uint72 identityId) internal view virtual {
        require(
            identityStorage.keyHasPurpose(identityId, keccak256(abi.encodePacked(msg.sender)), ADMIN_KEY),
            "Admin function"
        );
    }

}
