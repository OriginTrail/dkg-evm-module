// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {HashingProxy} from "./HashingProxy.sol";
import {ScoringProxy} from "./ScoringProxy.sol";
import {ContractStatus} from "./abstract/ContractStatus.sol";
import {ICustodian} from "./interface/ICustodian.sol";
import {Indexable} from "./interface/Indexable.sol";
import {Initializable} from "./interface/Initializable.sol";
import {Named} from "./interface/Named.sol";
import {Versioned} from "./interface/Versioned.sol";
import {GeneralStructs} from "./structs/GeneralStructs.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract HubController is Named, Versioned, ContractStatus, Ownable {
    string private constant _NAME = "HubController";
    string private constant _VERSION = "1.0.1";

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

    /**
     * @dev Forwards a function call to a specified target contract.
     * @notice This function can only be called by the contract owner or a multisig owner.
     * @param target The address of the target contract.
     * @param data The calldata containing the function signature and arguments for the target contract's function.
     * @return result The return data of the target contract's function call.
     */
    function forwardCall(address target, bytes calldata data) public onlyOwnerOrMultiSigOwner returns (bytes memory) {
        // Check if the target contract is registered in the Hub
        require(hub.isContract(target) || hub.isAssetStorage(target), "Target contract isn't in the Hub");

        // Perform the function call to the target contract with the specified calldata
        (bool success, bytes memory result) = target.call{value: 0}(data);

        // If the call is unsuccessful, revert the transaction with the original revert reason
        if (!success) {
            assembly {
                // Load the free memory pointer from memory slot 0x40
                // Memory slot 0x40 is conventionally used to store the free memory pointer in Solidity, which points
                // to the next available memory slot for storing data during the execution of a contract function.
                let ptr := mload(0x40)
                // Get the size of the return data from the unsuccessful call
                let size := returndatasize()
                // Copy the return data to the memory location pointed to by ptr
                returndatacopy(ptr, 0, size)
                // Revert the transaction with the return data as the revert reason
                revert(ptr, size)
            }
        }

        return result;
    }

    function setAndReinitializeContracts(
        GeneralStructs.Contract[] calldata newContracts,
        GeneralStructs.Contract[] calldata newAssetStorageContracts,
        address[] calldata contractsToReinitialize,
        GeneralStructs.ForwardCallInputArgs[] calldata forwardCallsData,
        address[] calldata newHashFunctions,
        address[] calldata newScoreFunctions
    ) external onlyOwnerOrMultiSigOwner {
        _setContracts(newContracts);
        _setAssetStorageContracts(newAssetStorageContracts);
        _reinitializeContracts(contractsToReinitialize);
        _forwardCalls(forwardCallsData);
        _setHashFunctions(newHashFunctions);
        _setScoreFunctions(newScoreFunctions);
    }

    function setContractAddress(
        string calldata contractName,
        address newContractAddress
    ) external onlyOwnerOrMultiSigOwner {
        if (hub.isContract(contractName)) {
            // solhint-disable-next-line no-empty-blocks
            try ContractStatus(hub.getContractAddress(contractName)).setStatus(false) {} catch {}
        }
        hub.setContractAddress(contractName, newContractAddress);
        // solhint-disable-next-line no-empty-blocks
        try ContractStatus(newContractAddress).setStatus(true) {} catch {}
    }

    function setAssetStorageAddress(
        string calldata assetStorageName,
        address assetStorageAddress
    ) external onlyOwnerOrMultiSigOwner {
        hub.setAssetStorageAddress(assetStorageName, assetStorageAddress);
    }

    function renounceHubOwnership() external onlyOwner {
        hub.renounceOwnership();
    }

    function transferHubOwnership(address newOwner) external onlyOwner {
        hub.transferOwnership(newOwner);
    }

    function _setContracts(GeneralStructs.Contract[] calldata newContracts) internal {
        for (uint i; i < newContracts.length; ) {
            if (hub.isContract(newContracts[i].name)) {
                // solhint-disable-next-line no-empty-blocks
                try ContractStatus(hub.getContractAddress(newContracts[i].name)).setStatus(false) {} catch {}
            }
            hub.setContractAddress(newContracts[i].name, newContracts[i].addr);
            // solhint-disable-next-line no-empty-blocks
            try ContractStatus(newContracts[i].addr).setStatus(true) {} catch {}
            unchecked {
                i++;
            }
        }
    }

    function _setAssetStorageContracts(GeneralStructs.Contract[] calldata newAssetStorageContracts) internal {
        for (uint i; i < newAssetStorageContracts.length; ) {
            hub.setAssetStorageAddress(newAssetStorageContracts[i].name, newAssetStorageContracts[i].addr);
            unchecked {
                i++;
            }
        }
    }

    function _reinitializeContracts(address[] calldata contractsToReinitialize) internal {
        for (uint i; i < contractsToReinitialize.length; ) {
            Initializable(contractsToReinitialize[i]).initialize();
            unchecked {
                i++;
            }
        }
    }

    function _forwardCalls(GeneralStructs.ForwardCallInputArgs[] calldata forwardCallsData) internal {
        for (uint i; i < forwardCallsData.length; ) {
            address contractAddress = hub.getContractAddress(forwardCallsData[i].contractName);
            for (uint j; j < forwardCallsData[i].encodedData.length; ) {
                forwardCall(contractAddress, forwardCallsData[i].encodedData[j]);
                unchecked {
                    j++;
                }
            }
            unchecked {
                i++;
            }
        }
    }

    function _setHashFunctions(address[] calldata newHashFunctions) internal {
        if (newHashFunctions.length == 0) return;
        HashingProxy hashingProxy = HashingProxy(hub.getContractAddress("HashingProxy"));
        for (uint i; i < newHashFunctions.length; ) {
            hashingProxy.setContractAddress(Indexable(newHashFunctions[i]).id(), newHashFunctions[i]);
            unchecked {
                i++;
            }
        }
    }

    function _setScoreFunctions(address[] calldata newScoreFunctions) internal {
        if (newScoreFunctions.length == 0) return;
        ScoringProxy scoringProxy = ScoringProxy(hub.getContractAddress("ScoringProxy"));
        for (uint i; i < newScoreFunctions.length; ) {
            scoringProxy.setContractAddress(Indexable(newScoreFunctions[i]).id(), newScoreFunctions[i]);
            unchecked {
                i++;
            }
        }
    }

    function _isMultiSigOwner(address multiSigAddress) internal view returns (bool) {
        try ICustodian(multiSigAddress).getOwners() returns (address[] memory multiSigOwners) {
            for (uint i = 0; i < multiSigOwners.length; i++) {
                if (msg.sender == multiSigOwners[i]) {
                    return true;
                }
            } // solhint-disable-next-line no-empty-blocks
        } catch {}

        return false;
    }

    function _checkOwnerOrMultiSigOwner() internal view virtual {
        address hubControllerOwner = owner();
        require(
            (msg.sender == hubControllerOwner) || _isMultiSigOwner(hubControllerOwner),
            "Owner / MultiSig owner function!"
        );
    }
}
