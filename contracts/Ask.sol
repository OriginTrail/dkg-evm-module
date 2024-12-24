// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {AskStorage} from "./storage/AskStorage.sol";
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

    AskStorage public askStorage;
    ShardingTableStorage public shardingTableStorage;
    ParametersStorage public parametersStorage;
    ProfileStorage public profileStorage;
    StakingStorage public stakingStorage;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) ContractStatus(hubAddress) {}

    function initialize() public onlyHub {
        askStorage = AskStorage(hub.getContractAddress("AskStorage"));
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

    function onStakeChanged(uint72 identityId, uint96 oldStake, uint96 newStake) external onlyContracts {
        ParametersStorage params = parametersStorage;
        AskStorage ass = askStorage;

        uint96 nodeAsk = profileStorage.getAsk(identityId);

        uint96 minimumStake = params.minimumStake();
        uint96 maximumStake = params.maximumStake();

        uint96 oldStakeAdj = oldStake <= maximumStake ? oldStake : maximumStake;
        uint96 newStakeAdj = newStake <= maximumStake ? newStake : maximumStake;

        uint256 oldWeightedAsk = uint256(nodeAsk) * oldStakeAdj;
        uint256 newWeightedAsk = uint256(nodeAsk) * newStakeAdj;

        bool wasInShardingTable = oldStake >= minimumStake;

        if (wasInShardingTable && newStake < minimumStake) {
            ass.decreaseWeightedActiveAskSum(oldWeightedAsk);
            ass.setPrevTotalActiveStake(ass.totalActiveStake());
            ass.decreaseTotalActiveStake(oldStake);
            return;
        }

        if (oldStake >= maximumStake && newStake >= maximumStake) {
            return;
        }

        uint256 weightedActiveAskSum = ass.weightedActiveAskSum();
        if (weightedActiveAskSum == 0) {
            ass.setPrevWeightedActiveAskSum(newWeightedAsk);
            ass.setPrevTotalActiveStake(newStakeAdj);
            ass.setTotalActiveStake(newStakeAdj);
            ass.setWeightedActiveAskSum(newWeightedAsk);
            return;
        }

        ass.setPrevTotalActiveStake(newStakeAdj);
        ass.setPrevWeightedActiveAskSum(weightedActiveAskSum);
        if (wasInShardingTable) {
            ass.decreaseTotalActiveStake(oldStake);
            ass.decreaseWeightedActiveAskSum(oldWeightedAsk);
        }
        ass.increaseTotalActiveStake(newStake);
        ass.increaseWeightedActiveAskSum(newWeightedAsk);
    }

    function onAskChanged(uint72 identityId, uint96 oldAsk, uint96 newAsk) external onlyContracts {
        StakingStorage ss = stakingStorage;
        ParametersStorage params = parametersStorage;
        ShardingTableStorage sts = shardingTableStorage;
        ProfileStorage ps = profileStorage;
        AskStorage ass = askStorage;

        uint96 currentStake = stakingStorage.getNodeStake(identityId);

        if (currentStake < params.minimumStake()) {
            return;
        }

        uint96 maximumStake = params.maximumStake();
        uint96 stake = currentStake <= maximumStake ? currentStake : maximumStake;
        uint256 newWeightedAsk = uint256(stake) * newAsk;

        uint256 weightedActiveAskSum = ass.weightedActiveAskSum();
        if (weightedActiveAskSum == 0) {
            ass.setWeightedActiveAskSum(newWeightedAsk);
            ass.setPrevWeightedActiveAskSum(newWeightedAsk);
            ass.setPrevTotalActiveStake(stake);
            ass.setTotalActiveStake(stake);
            return;
        }

        (uint256 oldLowerBound, uint256 oldUpperBound) = ass.getAskBounds();

        bool isActive = false;
        if (uint256(newAsk) * 1e18 <= oldUpperBound && uint256(newAsk) * 1e18 >= oldLowerBound) {
            ass.setPrevWeightedActiveAskSum(weightedActiveAskSum);
            isActive = true;
        } else if (uint256(oldAsk) * 1e18 <= oldUpperBound && uint256(oldAsk) * 1e18 >= oldLowerBound) {
            ass.setPrevTotalActiveStake(stake);
            ass.setPrevWeightedActiveAskSum(weightedActiveAskSum);
            ass.decreaseTotalActiveStake(stake);
            ass.decreaseWeightedActiveAskSum(uint256(oldAsk) * stake);
        }

        if (isActive) {
            ass.setPrevTotalActiveStake(ass.totalActiveStake());

            uint256 newWeightedActiveAskSum = 0;
            uint96 newTotalActiveStake = 0;

            (uint256 newLowerBound, uint256 newUpperBound) = ass.getAskBounds();

            uint72 nodesCount = shardingTableStorage.nodesCount();
            for (uint72 i; i < nodesCount; i++) {
                uint72 nextIdentityId = sts.indexToIdentityId(i);
                uint256 nodeAsk = uint256(ps.getAsk(nextIdentityId));

                if (nodeAsk * 1e18 <= newUpperBound && nodeAsk * 1e18 >= newLowerBound) {
                    uint96 nodeStake = ss.getNodeStake(nextIdentityId);
                    newWeightedActiveAskSum += (nodeAsk * nodeStake);
                    newTotalActiveStake += nodeStake;
                }
            }

            ass.setWeightedActiveAskSum(newWeightedActiveAskSum);
            ass.setTotalActiveStake(newTotalActiveStake);
        }
    }
}
