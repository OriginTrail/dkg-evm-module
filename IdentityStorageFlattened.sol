// Sources flattened with hardhat v2.19.1 https://hardhat.org

// SPDX-License-Identifier: MIT

// File @openzeppelin/contracts/utils/Context.sol@v4.9.3

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts v4.4.1 (utils/Context.sol)

pragma solidity ^0.8.0;

/**
 * @dev Provides information about the current execution context, including the
 * sender of the transaction and its data. While these are generally available
 * via msg.sender and msg.data, they should not be accessed in such a direct
 * manner, since when dealing with meta-transactions the account sending and
 * paying for execution may not be the actual sender (as far as an application
 * is concerned).
 *
 * This contract is only required for intermediate, library-like contracts.
 */
abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        return msg.data;
    }
}

// File @openzeppelin/contracts/access/Ownable.sol@v4.9.3

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v4.9.0) (access/Ownable.sol)

pragma solidity ^0.8.0;

/**
 * @dev Contract module which provides a basic access control mechanism, where
 * there is an account (an owner) that can be granted exclusive access to
 * specific functions.
 *
 * By default, the owner account will be the one that deploys the contract. This
 * can later be changed with {transferOwnership}.
 *
 * This module is used through inheritance. It will make available the modifier
 * `onlyOwner`, which can be applied to your functions to restrict their use to
 * the owner.
 */
abstract contract Ownable is Context {
    address private _owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /**
     * @dev Initializes the contract setting the deployer as the initial owner.
     */
    constructor() {
        _transferOwnership(_msgSender());
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view virtual returns (address) {
        return _owner;
    }

    /**
     * @dev Throws if the sender is not the owner.
     */
    function _checkOwner() internal view virtual {
        require(owner() == _msgSender(), "Ownable: caller is not the owner");
    }

    /**
     * @dev Leaves the contract without owner. It will not be possible to call
     * `onlyOwner` functions. Can only be called by the current owner.
     *
     * NOTE: Renouncing ownership will leave the contract without an owner,
     * thereby disabling any functionality that is only available to the owner.
     */
    function renounceOwnership() public virtual onlyOwner {
        _transferOwnership(address(0));
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public virtual onlyOwner {
        require(newOwner != address(0), "Ownable: new owner is the zero address");
        _transferOwnership(newOwner);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Internal function without access restriction.
     */
    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}

// File contracts/v1/interface/Named.sol

// Original license: SPDX_License_Identifier: MIT

pragma solidity ^0.8.16;

interface Named {
    function name() external view returns (string memory);
}

// File contracts/v1/interface/Versioned.sol

// Original license: SPDX_License_Identifier: MIT

pragma solidity ^0.8.16;

interface Versioned {
    function version() external view returns (string memory);
}

// File contracts/v1/utils/UnorderedNamedContractDynamicSet.sol

// Original license: SPDX_License_Identifier: MIT

pragma solidity ^0.8.16;

library UnorderedNamedContractDynamicSetLib {
    struct Contract {
        string name;
        address addr;
    }

    struct Set {
        mapping(string => uint256) stringIndexPointers;
        mapping(address => uint256) addressIndexPointers;
        Contract[] contractList;
    }

    function append(Set storage self, string calldata name, address addr) internal {
        require(
            keccak256(abi.encodePacked(name)) != keccak256(abi.encodePacked("")),
            "NamedContractSet: Name cannot be empty"
        );
        require(addr != address(0), "NamedContractSet: Address cannot be 0x0");
        require(!exists(self, name), "NamedContractSet: Contract with given name already exists");
        self.stringIndexPointers[name] = size(self);
        self.addressIndexPointers[addr] = size(self);
        self.contractList.push(Contract(name, addr));
    }

    function update(Set storage self, string calldata name, address addr) internal {
        require(addr != address(0), "NamedContractSet: Address cannot be 0x0");
        require(exists(self, name), "NamedContractSet: Contract with given name doesn't exists");
        delete self.addressIndexPointers[self.contractList[self.stringIndexPointers[name]].addr];
        self.addressIndexPointers[addr] = self.stringIndexPointers[name];
        self.contractList[self.stringIndexPointers[name]].addr = addr;
    }

    function remove(Set storage self, string calldata name) internal {
        require(exists(self, name), "NamedContractSet: Contract with given name doesn't exist");
        uint256 contractToRemoveIndex = self.stringIndexPointers[name];

        delete self.addressIndexPointers[self.contractList[contractToRemoveIndex].addr];

        Contract memory contractToMove = self.contractList[size(self) - 1];

        self.stringIndexPointers[contractToMove.name] = contractToRemoveIndex;
        self.addressIndexPointers[contractToMove.addr] = contractToRemoveIndex;
        self.contractList[contractToRemoveIndex] = contractToMove;

        delete self.stringIndexPointers[name];
        self.contractList.pop();
    }

    function remove(Set storage self, address addr) internal {
        require(exists(self, addr), "NamedContractSet: Contract with given address doesn't exist");
        uint256 contractToRemoveIndex = self.addressIndexPointers[addr];

        delete self.stringIndexPointers[self.contractList[contractToRemoveIndex].name];

        Contract memory contractToMove = self.contractList[size(self) - 1];

        self.stringIndexPointers[contractToMove.name] = contractToRemoveIndex;
        self.addressIndexPointers[contractToMove.addr] = contractToRemoveIndex;
        self.contractList[contractToRemoveIndex] = contractToMove;

        delete self.addressIndexPointers[addr];
        self.contractList.pop();
    }

    function get(Set storage self, string calldata name) internal view returns (Contract memory) {
        require(exists(self, name), "NamedContractSet: Contract with given name doesn't exist");
        return self.contractList[self.stringIndexPointers[name]];
    }

    function get(Set storage self, address addr) internal view returns (Contract memory) {
        require(exists(self, addr), "NamedContractSet: Contract with given address doesn't exist");
        return self.contractList[self.addressIndexPointers[addr]];
    }

    function get(Set storage self, uint256 index) internal view returns (Contract memory) {
        return self.contractList[index];
    }

    function getAll(Set storage self) internal view returns (Contract[] memory) {
        return self.contractList;
    }

    function getIndex(Set storage self, string calldata name) internal view returns (uint256) {
        return self.stringIndexPointers[name];
    }

    function getIndex(Set storage self, address addr) internal view returns (uint256) {
        return self.addressIndexPointers[addr];
    }

    function exists(Set storage self, string calldata name) internal view returns (bool) {
        if (size(self) == 0) {
            return false;
        }
        return
            keccak256(abi.encodePacked(self.contractList[self.stringIndexPointers[name]].name)) ==
            keccak256(abi.encodePacked(name));
    }

    function exists(Set storage self, address addr) internal view returns (bool) {
        if (size(self) == 0) {
            return false;
        }
        return addr == self.contractList[self.addressIndexPointers[addr]].addr;
    }

    function size(Set storage self) internal view returns (uint256) {
        return self.contractList.length;
    }
}

// File contracts/v1/Hub.sol

// Original license: SPDX_License_Identifier: MIT

pragma solidity ^0.8.16;

contract Hub is Named, Versioned, Ownable {
    using UnorderedNamedContractDynamicSetLib for UnorderedNamedContractDynamicSetLib.Set;

    event NewContract(string contractName, address newContractAddress);
    event ContractChanged(string contractName, address newContractAddress);
    event NewAssetStorage(string contractName, address newContractAddress);
    event AssetStorageChanged(string contractName, address newContractAddress);

    string private constant _NAME = "Hub";
    string private constant _VERSION = "1.0.0";

    UnorderedNamedContractDynamicSetLib.Set internal contractSet;
    UnorderedNamedContractDynamicSetLib.Set internal assetStorageSet;

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function setContractAddress(string calldata contractName, address newContractAddress) external onlyOwner {
        if (contractSet.exists(contractName)) {
            emit ContractChanged(contractName, newContractAddress);
            contractSet.update(contractName, newContractAddress);
        } else {
            emit NewContract(contractName, newContractAddress);
            contractSet.append(contractName, newContractAddress);
        }
    }

    function setAssetStorageAddress(string calldata assetStorageName, address assetStorageAddress) external onlyOwner {
        if (assetStorageSet.exists(assetStorageName)) {
            emit AssetStorageChanged(assetStorageName, assetStorageAddress);
            assetStorageSet.update(assetStorageName, assetStorageAddress);
        } else {
            emit NewAssetStorage(assetStorageName, assetStorageAddress);
            assetStorageSet.append(assetStorageName, assetStorageAddress);
        }
    }

    function getContractAddress(string calldata contractName) external view returns (address) {
        return contractSet.get(contractName).addr;
    }

    function getAssetStorageAddress(string calldata assetStorageName) external view returns (address) {
        return assetStorageSet.get(assetStorageName).addr;
    }

    function getAllContracts() external view returns (UnorderedNamedContractDynamicSetLib.Contract[] memory) {
        return contractSet.getAll();
    }

    function getAllAssetStorages() external view returns (UnorderedNamedContractDynamicSetLib.Contract[] memory) {
        return assetStorageSet.getAll();
    }

    function isContract(string calldata contractName) external view returns (bool) {
        return contractSet.exists(contractName);
    }

    function isContract(address selectedContractAddress) external view returns (bool) {
        return contractSet.exists(selectedContractAddress);
    }

    function isAssetStorage(string calldata assetStorageName) external view returns (bool) {
        return assetStorageSet.exists(assetStorageName);
    }

    function isAssetStorage(address assetStorageAddress) external view returns (bool) {
        return assetStorageSet.exists(assetStorageAddress);
    }
}

// File contracts/v1/abstract/HubDependent.sol

// Original license: SPDX_License_Identifier: MIT

pragma solidity ^0.8.16;

abstract contract HubDependent {
    Hub public hub;

    constructor(address hubAddress) {
        require(hubAddress != address(0), "Hub Address cannot be 0x0");

        hub = Hub(hubAddress);
    }

    modifier onlyHubOwner() {
        _checkHubOwner();
        _;
    }

    modifier onlyContracts() {
        _checkHub();
        _;
    }

    function _checkHubOwner() internal view virtual {
        require(msg.sender == hub.owner(), "Fn can only be used by hub owner");
    }

    function _checkHub() internal view virtual {
        require(hub.isContract(msg.sender), "Fn can only be called by the hub");
    }
}

// File contracts/v1/constants/IdentityConstants.sol

// Original license: SPDX_License_Identifier: MIT

pragma solidity ^0.8.16;

uint256 constant ADMIN_KEY = 1;
uint256 constant OPERATIONAL_KEY = 2;
uint256 constant ECDSA = 1;
uint256 constant RSA = 2;

// File contracts/v1/interface/IERC734Extended.sol

// Original license: SPDX_License_Identifier: MIT

pragma solidity ^0.8.16;

interface IERC734Extended {
    event KeyAdded(uint72 indexed identityId, bytes32 indexed key, uint256 purpose, uint256 keyType);
    event KeyRemoved(uint72 indexed identityId, bytes32 indexed key, uint256 purpose, uint256 keyType);

    struct Key {
        uint256 purpose; //e.g., ADMIN_KEY = 1, OPERATIONAL_KEY = 2, etc.
        uint256 keyType; // e.g. 1 = ECDSA, 2 = RSA, etc.
        bytes32 key;
    }

    function addKey(uint72 identityId, bytes32 _key, uint256 _purpose, uint256 _keyType) external;

    function removeKey(uint72 identityId, bytes32 _key) external;

    function keyHasPurpose(uint72 identityId, bytes32 _key, uint256 _purpose) external view returns (bool exists);

    function getKey(
        uint72 identityId,
        bytes32 _key
    ) external view returns (uint256 purpose, uint256 keyType, bytes32 key);

    function getKeysByPurpose(uint72 identityId, uint256 _purpose) external view returns (bytes32[] memory keys);
}

// File contracts/v1/utils/ByteArr.sol

// Original license: SPDX_License_Identifier: MIT

pragma solidity ^0.8.16;

library ByteArr {
    function indexOf(bytes32[] storage self, bytes32 item) internal view returns (uint index, bool isThere) {
        for (uint i; i < self.length; i++) {
            if (self[i] == item) {
                return (i, true);
            }
        }
        return (0, false);
    }

    function removeByIndex(bytes32[] storage self, uint256 index) internal returns (bytes32[] memory) {
        require(index < self.length, "Index is out of array length");

        self[index] = self[self.length - 1];
        self.pop();

        return self;
    }

    function getFuncHash(bytes storage _data) internal view returns (bytes4) {
        bytes4 output;
        for (uint i; i < 4; i++) {
            output |= bytes4(_data[i] & 0xFF) >> (i * 8);
        }
        return output;
    }
}

// File contracts/v1/storage/IdentityStorage.sol

// Original license: SPDX_License_Identifier: MIT

pragma solidity ^0.8.16;

contract IdentityStorage is IERC734Extended, Named, Versioned, HubDependent {
    using ByteArr for bytes32[];

    string private constant _NAME = "IdentityStorage";
    string private constant _VERSION = "1.0.0";

    uint72 private _identityId;

    struct Identity {
        mapping(bytes32 => Key) keys;
        mapping(uint256 => bytes32[]) keysByPurpose;
    }

    // operationalKey => identityId
    mapping(bytes32 => uint72) public identityIds;
    // identityId => Identity
    mapping(uint72 => Identity) internal identities;

    constructor(address hubAddress) HubDependent(hubAddress) {
        _identityId = 1;
    }

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function deleteIdentity(uint72 identityId) external virtual onlyContracts {
        bytes32[] memory operationalKeys = identities[identityId].keysByPurpose[OPERATIONAL_KEY];
        uint256 operationalKeysNumber = operationalKeys.length;

        for (uint256 i; i < operationalKeysNumber; ) {
            delete identityIds[operationalKeys[i]];
            unchecked {
                i++;
            }
        }

        delete identities[identityId];
    }

    function addKey(
        uint72 identityId,
        bytes32 _key,
        uint256 _purpose,
        uint256 _type
    ) external virtual override onlyContracts {
        Identity storage identity = identities[identityId];
        identity.keys[_key].purpose = _purpose;
        identity.keys[_key].keyType = _type;
        identity.keys[_key].key = _key;
        identity.keysByPurpose[_purpose].push(_key);

        emit KeyAdded(identityId, _key, _purpose, _type);
    }

    function removeKey(uint72 identityId, bytes32 _key) external virtual override onlyContracts {
        Identity storage identity = identities[identityId];

        uint256 index;
        (index, ) = identity.keysByPurpose[identity.keys[_key].purpose].indexOf(_key);
        identity.keysByPurpose[identity.keys[_key].purpose].removeByIndex(index);

        delete identity.keys[_key];

        emit KeyRemoved(identityId, identity.keys[_key].key, identity.keys[_key].purpose, identity.keys[_key].keyType);
    }

    function keyHasPurpose(
        uint72 identityId,
        bytes32 _key,
        uint256 _purpose
    ) external view virtual override returns (bool) {
        return identities[identityId].keys[_key].purpose == _purpose;
    }

    function getKey(
        uint72 identityId,
        bytes32 _key
    ) external view virtual override returns (uint256, uint256, bytes32) {
        return (
            identities[identityId].keys[_key].purpose,
            identities[identityId].keys[_key].keyType,
            identities[identityId].keys[_key].key
        );
    }

    function getKeysByPurpose(
        uint72 identityId,
        uint256 _purpose
    ) external view virtual override returns (bytes32[] memory) {
        return identities[identityId].keysByPurpose[_purpose];
    }

    function getIdentityId(address operational) external view returns (uint72) {
        return identityIds[keccak256(abi.encodePacked(operational))];
    }

    function setOperationalKeyIdentityId(bytes32 operationalKey, uint72 identityId) external virtual onlyContracts {
        identityIds[operationalKey] = identityId;
    }

    function removeOperationalKeyIdentityId(bytes32 operationalKey) external virtual onlyContracts {
        delete identityIds[operationalKey];
    }

    function generateIdentityId() external virtual onlyContracts returns (uint72) {
        unchecked {
            return _identityId++;
        }
    }
}
