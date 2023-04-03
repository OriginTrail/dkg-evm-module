// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import {IdentityStorage} from "./storage/IdentityStorage.sol";
import {ContractStatus} from "./abstract/ContractStatus.sol";
import {Initializable} from "./interface/Initializable.sol";
import {Named} from "./interface/Named.sol";
import {Versioned} from "./interface/Versioned.sol";
import {ADMIN_KEY, OPERATIONAL_KEY, ECDSA, RSA} from "./constants/IdentityConstants.sol";

contract Identity is Named, Versioned, ContractStatus, Initializable {
    event IdentityCreated(uint72 indexed identityId, bytes32 indexed operationalKey, bytes32 indexed adminKey);
    event IdentityDeleted(uint72 indexed identityId);

    string private constant _NAME = "Identity";
    string private constant _VERSION = "1.0.1";

    IdentityStorage public identityStorage;

    constructor(address hubAddress) ContractStatus(hubAddress) {
        initialize();
    }

    modifier onlyAdmin(uint72 identityId) {
        _checkAdmin(identityId);
        _;
    }

    function initialize() public onlyHubOwner {
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
        require(admin != operational, "Admin should != Operational");

        IdentityStorage ids = identityStorage;

        uint72 identityId = ids.generateIdentityId();

        bytes32 adminKey = keccak256(abi.encodePacked(admin));
        ids.addKey(identityId, adminKey, ADMIN_KEY, ECDSA);

        bytes32 operationalKey = keccak256(abi.encodePacked(operational));
        ids.addKey(identityId, operationalKey, OPERATIONAL_KEY, ECDSA);

        ids.setOperationalKeyIdentityId(operationalKey, identityId);

        emit IdentityCreated(identityId, operationalKey, adminKey);

        return identityId;
    }

    function deleteIdentity(uint72 identityId) external onlyContracts {
        identityStorage.deleteIdentity(identityId);

        emit IdentityDeleted(identityId);
    }

    function addKey(
        uint72 identityId,
        bytes32 key,
        uint256 keyPurpose,
        uint256 keyType
    ) external onlyAdmin(identityId) {
        require(key != bytes32(0), "Key arg is empty");

        IdentityStorage ids = identityStorage;

        bytes32 attachedKey;
        (, , attachedKey) = ids.getKey(identityId, key);
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
            !(ids.getKeysByPurpose(identityId, ADMIN_KEY).length == 1 && ids.keyHasPurpose(identityId, key, ADMIN_KEY)),
            "Cannot delete the only admin key"
        );
        require(
            !(ids.getKeysByPurpose(identityId, OPERATIONAL_KEY).length == 1 &&
                ids.keyHasPurpose(identityId, key, OPERATIONAL_KEY)),
            "Cannot delete the only oper. key"
        );

        ids.removeKey(identityId, key);

        if (purpose == OPERATIONAL_KEY) {
            ids.removeOperationalKeyIdentityId(key);
        }
    }

    function _checkAdmin(uint72 identityId) internal view virtual {
        require(
            identityStorage.keyHasPurpose(identityId, keccak256(abi.encodePacked(msg.sender)), ADMIN_KEY),
            "Admin function"
        );
    }
}
