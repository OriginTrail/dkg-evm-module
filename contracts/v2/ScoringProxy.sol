// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {ContractStatus} from "../v1/abstract/ContractStatus.sol";
import {IScoreFunction} from "../v1/interface/IScoreFunction.sol";
import {Named} from "../v1/interface/Named.sol";
import {Versioned} from "../v1/interface/Versioned.sol";
import {UnorderedIndexableContractDynamicSetLib} from "../v1/utils/UnorderedIndexableContractDynamicSet.sol";

contract ScoringProxyV2 is Named, Versioned, ContractStatus {
    using UnorderedIndexableContractDynamicSetLib for UnorderedIndexableContractDynamicSetLib.Set;

    event NewScoringFunctionContract(uint8 indexed scoreFunctionId, address newContractAddress);
    event ScoringFunctionContractUpdated(uint8 indexed scoreFunctionId, address newContractAddress);

    string private constant _NAME = "ScoringProxy";
    string private constant _VERSION = "1.0.1";

    UnorderedIndexableContractDynamicSetLib.Set internal scoreFunctionSet;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) ContractStatus(hubAddress) {}

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function setContractAddress(uint8 scoreFunctionId, address scoringContractAddress) external onlyHubOwner {
        if (scoreFunctionSet.exists(scoreFunctionId)) {
            emit ScoringFunctionContractUpdated(scoreFunctionId, scoringContractAddress);
            scoreFunctionSet.update(scoreFunctionId, scoringContractAddress);
        } else {
            emit NewScoringFunctionContract(scoreFunctionId, scoringContractAddress);
            scoreFunctionSet.append(scoreFunctionId, scoringContractAddress);
        }
    }

    function removeContract(uint8 scoreFunctionId) external onlyHubOwner {
        scoreFunctionSet.remove(scoreFunctionId);
    }

    //remove everthring except id, noramlised distance, normalized stake
    function callScoreFunction(
        uint8 scoreFunctionId,
        uint256 mappedDistance,
        uint256 mappedStake
    ) external view returns (uint40) {
        IScoreFunction scoringFunction = IScoreFunction(scoreFunctionSet.get(scoreFunctionId).addr);

        return scoringFunction.calculateScore(mappedDistance, mappedStake);
    }

    function getScoreFunctionName(uint8 scoreFunctionId) external view returns (string memory) {
        return Named(scoreFunctionSet.get(scoreFunctionId).addr).name();
    }

    function getScoreFunctionContractAddress(uint8 scoreFunctionId) external view returns (address) {
        return scoreFunctionSet.get(scoreFunctionId).addr;
    }

    function getAllScoreFunctions() external view returns (UnorderedIndexableContractDynamicSetLib.Contract[] memory) {
        return scoreFunctionSet.getAll();
    }

    function isScoreFunction(uint8 scoreFunctionId) external view returns (bool) {
        return scoreFunctionSet.exists(scoreFunctionId);
    }
}
