// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {HubDependentV2} from "../../abstract/HubDependent.sol";
import {Named} from "../../../v1/interface/Named.sol";
import {Versioned} from "../../../v1/interface/Versioned.sol";
import {ParanetStructs} from "../../structs/paranets/ParanetStructs.sol";

contract ParanetServicesRegistry is Named, Versioned, HubDependentV2 {
    string private constant _NAME = "ParanetServicesRegistry";
    string private constant _VERSION = "2.0.0";

    // Paranet Service ID => Paranet Service Object
    mapping(bytes32 => ParanetStructs.ParanetService) paranetServices;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) HubDependentV2(hubAddress) {}

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function registerParanetService(
        address paranetServiceKAStorageContract,
        uint256 paranetServiceKATokenId,
        string calldata paranetServiceName,
        string calldata paranetServiceDescription,
        address worker,
        bytes calldata metadata
    ) external onlyContracts returns (bytes32) {
        paranetServices[
            keccak256(abi.encodePacked(paranetServiceKAStorageContract, paranetServiceKATokenId))
        ] = ParanetStructs.ParanetService({
            paranetServiceKAStorageContract: paranetServiceKAStorageContract,
            paranetServiceKATokenId: paranetServiceKATokenId,
            operator: msg.sender,
            worker: worker,
            name: paranetServiceName,
            description: paranetServiceDescription,
            metadata: metadata
        });

        return keccak256(abi.encodePacked(paranetServiceKAStorageContract, paranetServiceKATokenId));
    }

    function deleteParanetService(bytes32 paranetServiceId) external onlyContracts {
        delete paranetServices[paranetServiceId];
    }

    function paranetServiceExists(bytes32 paranetServiceId) external view returns (bool) {
        return
            keccak256(
                abi.encodePacked(
                    paranetServices[paranetServiceId].paranetServiceKAStorageContract,
                    paranetServices[paranetServiceId].paranetServiceKATokenId
                )
            ) == paranetServiceId;
    }

    function getParanetServiceObject(
        bytes32 paranetServiceId
    ) external view returns (ParanetStructs.ParanetService memory) {
        return paranetServices[paranetServiceId];
    }

    function getOperatorAddress(bytes32 paranetServiceId) external view returns (address) {
        return paranetServices[paranetServiceId].operator;
    }

    function setOperatorAddress(bytes32 paranetServiceId, address operator) external onlyContracts {
        paranetServices[paranetServiceId].operator = operator;
    }

    function getWorkerAddress(bytes32 paranetServiceId) external view returns (address) {
        return paranetServices[paranetServiceId].worker;
    }

    function setWorkerAddress(bytes32 paranetServiceId, address worker) external onlyContracts {
        paranetServices[paranetServiceId].worker = worker;
    }

    function getName(bytes32 paranetServiceId) external view returns (string memory) {
        return paranetServices[paranetServiceId].name;
    }

    function setName(bytes32 paranetServiceId, string calldata name_) external onlyContracts {
        paranetServices[paranetServiceId].name = name_;
    }

    function getDescription(bytes32 paranetServiceId) external view returns (string memory) {
        return paranetServices[paranetServiceId].description;
    }

    function setDescription(bytes32 paranetServiceId, string calldata description_) external onlyContracts {
        paranetServices[paranetServiceId].description = description_;
    }

    function getMetadata(bytes32 paranetServiceId) external view returns (bytes memory) {
        return paranetServices[paranetServiceId].metadata;
    }

    function setMetadata(bytes32 paranetServiceId, bytes calldata metadata) external onlyContracts {
        paranetServices[paranetServiceId].metadata = metadata;
    }
}
