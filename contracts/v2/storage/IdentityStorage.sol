// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {HubDependent} from "../../v1/abstract/HubDependent.sol";
import {IERC734Extended} from "../../v1/interface/IERC734Extended.sol";
import {Named} from "../../v1/interface/Named.sol";
import {Versioned} from "../../v1/interface/Versioned.sol";
import {ByteArr} from "../../v1/utils/ByteArr.sol";
import {OPERATIONAL_KEY} from "../../v1/constants/IdentityConstants.sol";
import {IdentityStorage} from "../../v1/storage/IdentityStorage.sol";

contract IdentityStorageV2 is IdentityStorage {
    using ByteArr for bytes32[];

    string private constant _VERSION_V2 = "2.0.0";

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) IdentityStorage(hubAddress) {}

    function version() external pure virtual override returns (string memory) {
        return _VERSION_V2;
    }

    function removeKey(uint72 identityId, bytes32 _key) external virtual override onlyContracts {
        IdentityStorage.Identity storage identity = identities[identityId];

        uint256 index;
        (index, ) = identity.keysByPurpose[identity.keys[_key].purpose].indexOf(_key);
        identity.keysByPurpose[identity.keys[_key].purpose].removeByIndex(index);

        emit KeyRemoved(identityId, identity.keys[_key].key, identity.keys[_key].purpose, identity.keys[_key].keyType);

        delete identity.keys[_key];
    }
}
