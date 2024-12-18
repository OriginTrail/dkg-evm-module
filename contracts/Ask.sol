// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {ShardingTableStorage} from "./storage/ShardingTableStorage.sol";
import {ParametersStorage} from "./storage/ParametersStorage.sol";
import {ProfileStorage} from "./storage/ProfileStorage.sol";
import {StakingStorage} from "./storage/StakingStorage.sol";
import {INamed} from "./interfaces/INamed.sol";
import {IVersioned} from "./interfaces/IVersioned.sol";
import {IInitializable} from "./interfaces/IInitializable.sol";
import {ContractStatus} from "./abstract/ContractStatus.sol";

contract Ask is INamed, IVersioned, ContractStatus, IInitializable {
    string private constant _NAME = "Ask";
    string private constant _VERSION = "1.0.0";

    uint256 public constant UPPER_BOUND_FACTOR = 1467000000000000000;
    uint256 public constant LOWER_BOUND_FACTOR = 533000000000000000;

    ShardingTableStorage public shardingTableStorage;
    ParametersStorage public parametersStorage;
    ProfileStorage public profileStorage;
    StakingStorage public stakingStorage;

    uint256 public prevWeightedActiveAskSum;
    uint256 public weightedActiveAskSum;

    uint96 public totalActiveStake;

    // index => identityId
    mapping(uint72 => uint72) public indexToIdentityId;

    mapping(uint72 => uint256) public nodeWeightedActiveAsk;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) ContractStatus(hubAddress) {}

    function initialize() public onlyHub {
        shardingTableStorage = ShardingTableStorage(hub.getContractAddress("ShardingTableStorage"));
        parametersStorage = ParametersStorage(hub.getContractAddress("ParametersStorage"));
        profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        stakingStorage = StakingStorage(hub.getContractAddress("StakingStorage"));
    }

    function name() public pure virtual returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual returns (string memory) {
        return _VERSION;
    }

    function getStakeWeightedAverageAsk() external view returns (uint256) {
        return totalActiveStake > 0 ? weightedActiveAskSum / totalActiveStake : 0;
    }

    function setWeightedAskSum(uint256 _weightedActiveAskSum) external onlyContracts {
        weightedActiveAskSum = _weightedActiveAskSum;
    }

    function onStakeChanged(uint72 identityId, uint96 newStake) external onlyContracts {
        ParametersStorage ps = parametersStorage;
        ShardingTableStorage sts = shardingTableStorage;
        StakingStorage ss = stakingStorage;

        if (newStake < ps.minimumStake()) {
            return;
        }

        uint256 oldUpperBound = prevWeightedActiveAskSum * UPPER_BOUND_FACTOR;
        uint256 oldLowerBound = prevWeightedActiveAskSum * LOWER_BOUND_FACTOR;

        uint96 maximumStake = ps.maximumStake();
        uint96 stake = newStake <= maximumStake ? newStake : maximumStake;

        uint256 newWeightedAsk = profileStorage.getAsk(identityId) * stake;
        bool isActive = false;
        if (newWeightedAsk * 1e18 <= oldUpperBound && newWeightedAsk * 1e18 >= oldLowerBound) {
            prevWeightedActiveAskSum = weightedActiveAskSum;
            nodeWeightedActiveAsk[identityId] = newWeightedAsk;
            isActive = true;
        } else {
            nodeWeightedActiveAsk[identityId] = 0;
        }

        if (isActive) {
            weightedActiveAskSum = 0;
            totalActiveStake = 0;
            uint256 newUpperBound = prevWeightedActiveAskSum * UPPER_BOUND_FACTOR;
            uint256 newLowerBound = prevWeightedActiveAskSum * LOWER_BOUND_FACTOR;

            uint72 nodesCount = sts.nodesCount();
            for (uint72 i; i < nodesCount; i++) {
                uint72 nextIdentityId = indexToIdentityId[i];
                uint256 weightedActiveAsk = nodeWeightedActiveAsk[nextIdentityId];

                if (weightedActiveAsk * 1e18 <= newUpperBound && weightedActiveAsk * 1e18 >= newLowerBound) {
                    weightedActiveAskSum += weightedActiveAsk;
                    totalActiveStake += ss.getNodeStake(nextIdentityId);
                } else {
                    nodeWeightedActiveAsk[nextIdentityId] = 0;
                }
            }
        }
    }

    function onAskChanged(uint72 identityId, uint96 newAsk) external onlyContracts {
        StakingStorage ss = stakingStorage;

        uint96 currentStake = stakingStorage.getNodeStake(identityId);

        if (currentStake < parametersStorage.minimumStake()) {
            return;
        }

        uint256 oldUpperBound = prevWeightedActiveAskSum * UPPER_BOUND_FACTOR;
        uint256 oldLowerBound = prevWeightedActiveAskSum * LOWER_BOUND_FACTOR;

        uint256 newWeightedAsk = currentStake * newAsk;
        bool isActive = false;
        if (newWeightedAsk * 1e18 <= oldUpperBound && newWeightedAsk * 1e18 >= oldLowerBound) {
            prevWeightedActiveAskSum = weightedActiveAskSum;
            nodeWeightedActiveAsk[identityId] = newWeightedAsk;
            isActive = true;
        } else {
            nodeWeightedActiveAsk[identityId] = 0;
        }

        if (isActive) {
            weightedActiveAskSum = 0;
            totalActiveStake = 0;
            uint256 newUpperBound = prevWeightedActiveAskSum * UPPER_BOUND_FACTOR;
            uint256 newLowerBound = prevWeightedActiveAskSum * LOWER_BOUND_FACTOR;

            uint72 nodesCount = shardingTableStorage.nodesCount();
            for (uint72 i; i < nodesCount; i++) {
                uint72 nextIdentityId = indexToIdentityId[i];
                uint256 weightedActiveAsk = nodeWeightedActiveAsk[nextIdentityId];

                if (weightedActiveAsk * 1e18 <= newUpperBound && weightedActiveAsk * 1e18 >= newLowerBound) {
                    weightedActiveAskSum += weightedActiveAsk;
                    totalActiveStake += ss.getNodeStake(nextIdentityId);
                } else {
                    nodeWeightedActiveAsk[nextIdentityId] = 0;
                }
            }
        }
    }
}
