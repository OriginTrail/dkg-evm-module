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

        uint256 nodeWeightedAsk = ass.nodeWeightedAsk(identityId);
        bool wasActive = nodeWeightedAsk != 0;

        if (newStake < params.minimumStake()) {
            if (wasActive) {
                ass.decreaseWeightedActiveAskSum(ass.nodeWeightedAsk(identityId));
                ass.setPrevTotalActiveStake(ass.totalActiveStake());
                ass.decreaseTotalActiveStake(oldStake);
                ass.setNodeWeightedAsk(identityId, 0);
            }
            return;
        }

        uint96 maximumStake = params.maximumStake();

        if (oldStake >= maximumStake && newStake >= maximumStake) {
            return;
        }

        uint96 stake = newStake <= maximumStake ? newStake : maximumStake;
        uint256 newWeightedAsk = uint256(profileStorage.getAsk(identityId)) * stake;

        uint256 weightedActiveAskSum = ass.weightedActiveAskSum();
        if (weightedActiveAskSum == 0) {
            ass.setWeightedActiveAskSum(newWeightedAsk);
            ass.setPrevWeightedActiveAskSum(newWeightedAsk);
            ass.setNodeWeightedAsk(identityId, newWeightedAsk);
            ass.setPrevTotalActiveStake(stake);
            ass.setTotalActiveStake(stake);
            return;
        }

        ass.setPrevTotalActiveStake(stake);
        ass.setPrevWeightedActiveAskSum(weightedActiveAskSum);
        if (wasActive) {
            ass.decreaseTotalActiveStake(oldStake);
            ass.decreaseWeightedActiveAskSum(nodeWeightedAsk);
        }

        ass.increaseTotalActiveStake(newStake);
        ass.increaseWeightedActiveAskSum(newWeightedAsk);
        ass.setNodeWeightedAsk(identityId, newWeightedAsk);
    }

    function onAskChanged(uint72 identityId, uint96 newAsk) external onlyContracts {
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
            ass.setNodeWeightedAsk(identityId, newWeightedAsk);
            ass.setPrevTotalActiveStake(stake);
            ass.setTotalActiveStake(stake);
            return;
        }

        (uint256 oldLowerBound, uint256 oldUpperBound) = ass.getAskBounds();

        bool isActive = false;
        if (newAsk * 1e18 <= oldUpperBound && newAsk * 1e18 >= oldLowerBound) {
            ass.setPrevWeightedActiveAskSum(weightedActiveAskSum);
            ass.setNodeWeightedAsk(identityId, newWeightedAsk);
            isActive = true;
        } else if (ass.nodeWeightedAsk(identityId) != 0) {
            ass.setPrevTotalActiveStake(stake);
            ass.setPrevWeightedActiveAskSum(weightedActiveAskSum);
            ass.decreaseTotalActiveStake(stake);
            ass.decreaseWeightedActiveAskSum(ass.nodeWeightedAsk(identityId));
            ass.setNodeWeightedAsk(identityId, 0);
        }

        if (isActive) {
            ass.setPrevTotalActiveStake(ass.totalActiveStake());

            uint256 newWeightedActiveAskSum = 0;
            uint96 newTotalActiveStake = 0;

            (uint256 newLowerBound, uint256 newUpperBound) = ass.getAskBounds();

            uint72 nodesCount = shardingTableStorage.nodesCount();
            for (uint72 i; i < nodesCount; i++) {
                uint72 nextIdentityId = sts.indexToIdentityId(i);
                uint96 nodeAsk = ps.getAsk(nextIdentityId);

                if (nodeAsk * 1e18 <= newUpperBound && nodeAsk * 1e18 >= newLowerBound) {
                    newWeightedActiveAskSum += ass.nodeWeightedAsk(nextIdentityId);
                    newTotalActiveStake += ss.getNodeStake(nextIdentityId);
                } else {
                    ass.setNodeWeightedAsk(identityId, 0);
                }
            }

            ass.setWeightedActiveAskSum(newWeightedActiveAskSum);
            ass.setTotalActiveStake(newTotalActiveStake);
        }
    }
}
