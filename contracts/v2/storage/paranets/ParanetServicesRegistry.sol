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
        address operator,
        address[] calldata paranetServiceAddresses
    ) external onlyContracts returns (bytes32) {
        ParanetStructs.ParanetService storage paranetService = paranetServices[
            keccak256(abi.encodePacked(paranetServiceKAStorageContract, paranetServiceKATokenId))
        ];

        paranetService.paranetServiceKAStorageContract = paranetServiceKAStorageContract;
        paranetService.paranetServiceKATokenId = paranetServiceKATokenId;
        paranetService.operator = operator;
        paranetService.name = paranetServiceName;
        paranetService.description = paranetServiceDescription;
        paranetService.paranetServiceAddresses = paranetServiceAddresses;

        for (uint i; i < paranetServiceAddresses.length; ) {
            paranetService.paranetServiceAddressRegistered[paranetServiceAddresses[i]] = true;

            unchecked {
                i++;
            }
        }

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

    function getParanetServiceMetadata(
        bytes32 paranetServiceId
    ) external view returns (ParanetStructs.ParanetServiceMetadata memory) {
        return
            ParanetStructs.ParanetServiceMetadata({
                paranetServiceKAStorageContract: paranetServices[paranetServiceId].paranetServiceKAStorageContract,
                paranetServiceKATokenId: paranetServices[paranetServiceId].paranetServiceKATokenId,
                operator: paranetServices[paranetServiceId].operator,
                name: paranetServices[paranetServiceId].name,
                description: paranetServices[paranetServiceId].description,
                paranetServiceAddresses: paranetServices[paranetServiceId].paranetServiceAddresses
            });
    }

    function getOperatorAddress(bytes32 paranetServiceId) external view returns (address) {
        return paranetServices[paranetServiceId].operator;
    }

    function setOperatorAddress(bytes32 paranetServiceId, address operator) external onlyContracts {
        paranetServices[paranetServiceId].operator = operator;
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

    function getParanetServiceAddresses(bytes32 paranetServiceId) external view returns (address[] memory) {
        return paranetServices[paranetServiceId].paranetServiceAddresses;
    }

    function setParanetServiceAddresses(
        bytes32 paranetServiceId,
        address[] calldata paranetServiceAddresses
    ) external onlyContracts {
        paranetServices[paranetServiceId].paranetServiceAddresses = paranetServiceAddresses;
    }

    function isParanetServiceAddressRegistered(
        bytes32 paranetServiceId,
        address paranetServiceAddress
    ) external view returns (bool) {
        return paranetServices[paranetServiceId].paranetServiceAddressRegistered[paranetServiceAddress];
    }

    function setIsParanetServiceAddressRegistered(
        bytes32 paranetServiceId,
        address paranetServiceAddress,
        bool isRegistered
    ) external onlyContracts {
        paranetServices[paranetServiceId].paranetServiceAddressRegistered[paranetServiceAddress] = isRegistered;
    }
}
