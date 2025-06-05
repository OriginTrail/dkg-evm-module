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
    // IdentityId => Delegator => LastClaimedEpoch
    mapping(uint72 => mapping(address => uint256)) public lastClaimedEpoch;
    // IdentityId => Delegator => RollingRewards
    mapping(uint72 => mapping(address => uint256)) public delegatorRollingRewards;
    // IdentityId => Epoch => OperatorFeeClaimed
    mapping(uint72 => mapping(uint256 => bool)) public isOperatorFeeClaimedForEpoch;
    // IdentityId => Epoch => Amount
    mapping(uint72 => mapping(uint256 => uint256)) public EpochLeftoverDelegatorsRewards;
    // IdentityId => Epoch
    mapping(uint72 => uint256) public lastClaimedEpochOperatorFeeAmount;
    // IdentityId => Delegator => HasEverDelegatedToNode
    mapping(uint72 => mapping(address => bool)) public hasEverDelegatedToNode;

    event DelegatorAdded(uint72 indexed identityId, address indexed delegator);
    event DelegatorRemoved(uint72 indexed identityId, address indexed delegator);
    event DelegatorLastClaimedEpochUpdated(
        uint72 indexed identityId,
        address indexed delegator,
        uint256 newLastClaimedEpoch
    );
    event DelegatorRollingRewardsUpdated(
        uint72 indexed identityId,
        address indexed delegator,
        uint256 amount,
        uint256 newTotalRollingRewards
    );
    event IsOperatorFeeClaimedForEpochUpdated(uint72 indexed identityId, uint256 indexed epoch, bool isClaimed);
    event EpochLeftoverDelegatorsRewardsSet(uint72 indexed identityId, uint256 indexed epoch, uint256 amount);
    event LastClaimedEpochOperatorFeeAmountSet(uint72 indexed identityId, uint256 epoch);
    event HasEverDelegatedToNodeUpdated(
        uint72 indexed identityId,
        address indexed delegator,
        bool hasEverDelegatedToNode
    );

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

    function setLastClaimedEpoch(uint72 identityId, address delegator, uint256 epoch) external onlyContracts {
        lastClaimedEpoch[identityId][delegator] = epoch;
        emit DelegatorLastClaimedEpochUpdated(identityId, delegator, epoch);
    }

    function getLastClaimedEpoch(uint72 identityId, address delegator) external view returns (uint256) {
        return lastClaimedEpoch[identityId][delegator];
    }

    function setDelegatorRollingRewards(uint72 identityId, address delegator, uint256 amount) external onlyContracts {
        delegatorRollingRewards[identityId][delegator] = amount;
        emit DelegatorRollingRewardsUpdated(identityId, delegator, amount, amount);
    }

    function addDelegatorRollingRewards(uint72 identityId, address delegator, uint256 amount) external onlyContracts {
        delegatorRollingRewards[identityId][delegator] += amount;
        emit DelegatorRollingRewardsUpdated(
            identityId,
            delegator,
            amount,
            delegatorRollingRewards[identityId][delegator]
        );
    }

    function getDelegatorRollingRewards(uint72 identityId, address delegator) external view returns (uint256) {
        return delegatorRollingRewards[identityId][delegator];
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

    function setIsOperatorFeeClaimedForEpoch(uint72 identityId, uint256 epoch, bool isClaimed) external onlyContracts {
        isOperatorFeeClaimedForEpoch[identityId][epoch] = isClaimed;
        emit IsOperatorFeeClaimedForEpochUpdated(identityId, epoch, isClaimed);
    }

    function getIsOperatorFeeClaimedForEpoch(uint72 identityId, uint256 epoch) external view returns (bool) {
        return isOperatorFeeClaimedForEpoch[identityId][epoch];
    }

    function setEpochLeftoverDelegatorsRewards(
        uint72 identityId,
        uint256 epoch,
        uint256 amount
    ) external onlyContracts {
        EpochLeftoverDelegatorsRewards[identityId][epoch] = amount;
        emit EpochLeftoverDelegatorsRewardsSet(identityId, epoch, amount);
    }

    function getEpochLeftoverDelegatorsRewards(uint72 identityId, uint256 epoch) external view returns (uint256) {
        return EpochLeftoverDelegatorsRewards[identityId][epoch];
    }

    function setLastClaimedEpochOperatorFeeAmount(uint72 identityId, uint256 epoch) external onlyContracts {
        lastClaimedEpochOperatorFeeAmount[identityId] = epoch;
        emit LastClaimedEpochOperatorFeeAmountSet(identityId, epoch);
    }

    function getLastClaimedEpochOperatorFeeAmount(uint72 identityId) external view returns (uint256) {
        return lastClaimedEpochOperatorFeeAmount[identityId];
    }

    function setHasEverDelegatedToNode(
        uint72 identityId,
        address delegator,
        bool _hasEverDelegatedToNode
    ) external onlyContracts {
        hasEverDelegatedToNode[identityId][delegator] = _hasEverDelegatedToNode;
        emit HasEverDelegatedToNodeUpdated(identityId, delegator, _hasEverDelegatedToNode);
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
