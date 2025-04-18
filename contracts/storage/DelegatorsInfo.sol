// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {StakingStorage} from "./StakingStorage.sol";
import {IInitializable} from "../interfaces/IInitializable.sol";
import {INamed} from "../interfaces/INamed.sol";
import {IVersioned} from "../interfaces/IVersioned.sol";
import {ContractStatus} from "../abstract/ContractStatus.sol";

contract DelegatorsInfo is INamed, IVersioned, ContractStatus, IInitializable {
    string private constant _NAME = "DelegatorsInfo";
    string private constant _VERSION = "1.0.0";

    // IdentityId => Delegators
    mapping(uint72 => address[]) public nodeDelegatorAddresses;
    // IdentityId => Delegator => Index
    mapping(uint72 => mapping(address => uint256)) public nodeDelegatorIndex;
    // IdentityId => Delegator => IsDelegator
    mapping(uint72 => mapping(address => bool)) public isDelegatorMap;

    event DelegatorAdded(uint72 indexed identityId, address indexed delegator);
    event DelegatorRemoved(uint72 indexed identityId, address indexed delegator);

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) ContractStatus(hubAddress) {}

    function initialize() public onlyHub {}

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function addDelegator(uint72 identityId, address delegator) external onlyContracts {
        nodeDelegatorIndex[identityId][delegator] = nodeDelegatorAddresses[identityId].length;
        nodeDelegatorAddresses[identityId].push(delegator);
        isDelegatorMap[identityId][delegator] = true;

        emit DelegatorAdded(identityId, delegator);
    }

    function removeDelegator(uint72 identityId, address delegator) external onlyContracts {
        if (!isDelegatorMap[identityId][delegator]) {
            revert("Delegator not found");
        }

        uint256 indexToRemove = nodeDelegatorIndex[identityId][delegator];
        uint256 lastIndex = nodeDelegatorAddresses[identityId].length - 1;

        if (indexToRemove != lastIndex) {
            address lastDelegator = nodeDelegatorAddresses[identityId][lastIndex];
            nodeDelegatorAddresses[identityId][indexToRemove] = lastDelegator;
            nodeDelegatorIndex[identityId][lastDelegator] = indexToRemove;
        }

        nodeDelegatorAddresses[identityId].pop();
        delete nodeDelegatorIndex[identityId][delegator];
        delete isDelegatorMap[identityId][delegator];

        emit DelegatorRemoved(identityId, delegator);
    }

    function getDelegators(uint72 identityId) external view returns (address[] memory) {
        return nodeDelegatorAddresses[identityId];
    }

    function getDelegatorIndex(uint72 identityId, address delegator) external view returns (uint256) {
        return nodeDelegatorIndex[identityId][delegator];
    }

    function isNodeDelegator(uint72 identityId, address delegator) external view returns (bool) {
        return isDelegatorMap[identityId][delegator];
    }

    function migrate(address[] memory newAddresses) public {
        StakingStorage ss = StakingStorage(hub.getContractAddress("StakingStorage"));
        for (uint256 i = 0; i < newAddresses.length; ) {
            bytes32 addressHash = keccak256(abi.encodePacked(newAddresses[i]));
            uint72[] memory delegatorNodes = ss.getDelegatorNodes(addressHash);
            for (uint256 j = 0; j < delegatorNodes.length; ) {
                if (isDelegatorMap[delegatorNodes[j]][newAddresses[i]]) {
                    unchecked {
                        j++;
                    }
                    continue;
                }
                nodeDelegatorIndex[delegatorNodes[j]][newAddresses[i]] = nodeDelegatorAddresses[delegatorNodes[j]]
                    .length;
                nodeDelegatorAddresses[delegatorNodes[j]].push(newAddresses[i]);
                isDelegatorMap[delegatorNodes[j]][newAddresses[i]] = true;

                emit DelegatorAdded(delegatorNodes[j], newAddresses[i]);

                unchecked {
                    j++;
                }
            }
            unchecked {
                i++;
            }
        }
    }
}
