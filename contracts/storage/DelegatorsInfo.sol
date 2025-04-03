// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {ShardingTableStorage} from "./ShardingTableStorage.sol";
import {StakingStorage} from "./StakingStorage.sol";
import {IInitializable} from "../interfaces/IInitializable.sol";
import {INamed} from "../interfaces/INamed.sol";
import {IVersioned} from "../interfaces/IVersioned.sol";
import {ContractStatus} from "../abstract/ContractStatus.sol";

contract DelegatorsInfo is INamed, IVersioned, ContractStatus, IInitializable {
    string private constant _NAME = "DelegatorsInfo";
    string private constant _VERSION = "1.0.0";

    ShardingTableStorage public shardingTableStorage;

    // IdentityId => Delegators
    mapping(uint72 => address[]) public nodeDelegators;
    // IdentityId => Delegator => Index
    mapping(uint72 => mapping(address => uint256)) public nodeDelegatorIndex;
    // IdentityId => Delegator => IsDelegator
    mapping(uint72 => mapping(address => bool)) public isDelegatorMap;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) ContractStatus(hubAddress) {}

    function initialize() public onlyHub {
        shardingTableStorage = ShardingTableStorage(hub.getContractAddress("ShardingTableStorage"));
    }

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function addDelegator(uint72 identityId, address delegator) external onlyContracts {
        nodeDelegatorIndex[identityId][delegator] = nodeDelegators[identityId].length;
        nodeDelegators[identityId].push(delegator);
    }

    function removeDelegator(uint72 identityId, address delegator) external onlyContracts {
        uint256 index = nodeDelegatorIndex[identityId][delegator];

        if (nodeDelegators[identityId].length == index - 1) {
            nodeDelegators[identityId].pop();
        } else {
            nodeDelegators[identityId][index] = nodeDelegators[identityId][nodeDelegators[identityId].length - 1];
            nodeDelegators[identityId].pop();
        }
    }

    function getDelegators(uint72 identityId) external view returns (address[] memory) {
        return nodeDelegators[identityId];
    }

    function getDelegatorIndex(uint72 identityId, address delegator) external view returns (uint256) {
        return nodeDelegatorIndex[identityId][delegator];
    }

    function isDelegator(uint72 identityId, address delegator) external view returns (bool) {
        return isDelegatorMap[identityId][delegator];
    }

    function migrate(address[] memory newAddress) external onlyContracts {
        StakingStorage ss = StakingStorage(hub.getContractAddress("StakingStorage"));
        for (uint256 i = 0; i < newAddress.length; ) {
            bytes32 addressHash = keccak256(abi.encodePacked(newAddress[i]));
            uint72[] memory delegatorNodes = ss.getDelegatorNodes(addressHash);
            for (uint256 j = 0; j < delegatorNodes.length; ) {
                if (isDelegatorMap[delegatorNodes[j]][newAddress[i]]) {
                    unchecked {
                        j++;
                    }
                    continue;
                }
                nodeDelegatorIndex[delegatorNodes[j]][newAddress[i]] = nodeDelegators[delegatorNodes[j]].length;
                nodeDelegators[delegatorNodes[j]].push(newAddress[i]);
                isDelegatorMap[delegatorNodes[j]][newAddress[i]] = true;
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
