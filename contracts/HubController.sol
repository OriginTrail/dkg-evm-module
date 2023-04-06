// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {ContractStatus} from "./abstract/ContractStatus.sol";
import {Named} from "./interface/Named.sol";
import {Versioned} from "./interface/Versioned.sol";
import {ICustodian} from "./interface/ICustodian.sol";
import {Initializable} from "./interface/Initializable.sol";
import {GeneralStructs} from "./structs/GeneralStructs.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract HubController is Named, Versioned, ContractStatus, Ownable {
    string private constant _NAME = "HubController";
    string private constant _VERSION = "1.0.0";

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) ContractStatus(hubAddress) {}

    // @dev Only transactions by HubController owner or one of the owners of the MultiSig Wallet
    modifier onlyOwnerOrMultiSigOwner() {
        _checkOwnerOrMultiSigOwner();
        _;
    }

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function forwardCall(address target, bytes calldata data) external onlyOwnerOrMultiSigOwner returns (bytes memory) {
        require(hub.isContract(target), "Target contract isn't in the Hub");

        (bool success, bytes memory result) = target.call{value: 0}(data);

        if (!success) {
            assembly {
                let ptr := mload(0x40)
                let size := returndatasize()
                returndatacopy(ptr, 0, size)
                revert(ptr, size)
            }
        }

        return result;
    }

    function setAndReinitializeContracts(
        GeneralStructs.Contract[] calldata newContracts,
        GeneralStructs.Contract[] calldata newAssetStorageContracts,
        address[] calldata contractsToReinitialize
    ) external onlyOwnerOrMultiSigOwner {
        for (uint i; i < newContracts.length; ) {
            hub.setContractAddress(newContracts[i].name, newContracts[i].addr);
            unchecked {
                i++;
            }
        }

        for (uint i; i < newAssetStorageContracts.length; ) {
            hub.setAssetStorageAddress(newAssetStorageContracts[i].name, newAssetStorageContracts[i].addr);
            unchecked {
                i++;
            }
        }

        for (uint i; i < contractsToReinitialize.length; ) {
            Initializable(contractsToReinitialize[i]).initialize();
            unchecked {
                i++;
            }
        }
    }

    function setContractAddress(
        string calldata contractName,
        address newContractAddress
    ) external onlyOwnerOrMultiSigOwner {
        hub.setContractAddress(contractName, newContractAddress);
    }

    function setAssetStorageAddress(
        string calldata assetStorageName,
        address assetStorageAddress
    ) external onlyOwnerOrMultiSigOwner {
        hub.setAssetStorageAddress(assetStorageName, assetStorageAddress);
    }

    function renounceHubOwnership() external onlyOwnerOrMultiSigOwner {
        hub.renounceOwnership();
    }

    function transferHubOwnership(address newOwner) external onlyOwnerOrMultiSigOwner {
        hub.transferOwnership(newOwner);
    }

    function _isMultiSigOwner() internal view returns (bool) {
        address[] memory multiSigOwners = ICustodian(hub.getContractAddress("TraceLabsMultiSigWallet")).getOwners();

        for (uint i; i < multiSigOwners.length; ) {
            if (msg.sender == multiSigOwners[i]) return true;
            unchecked {
                i++;
            }
        }

        return false;
    }

    function _checkOwnerOrMultiSigOwner() internal view virtual {
        require((msg.sender == owner()) || _isMultiSigOwner(), "");
    }
}
