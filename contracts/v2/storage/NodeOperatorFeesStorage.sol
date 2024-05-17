// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {HubDependent} from "../../v1/abstract/HubDependent.sol";
import {StakingStorage} from "../../v1/storage/StakingStorage.sol";
import {Named} from "../../v1/interface/Named.sol";
import {Versioned} from "../../v1/interface/Versioned.sol";
import {NodeOperatorErrors} from "../errors/NodeOperatorErrors.sol";
import {NodeOperatorStructs} from "../structs/NodeOperatorStructs.sol";

contract NodeOperatorFeesStorage is Named, Versioned, HubDependent {
    string private constant _NAME = "NodeOperatorFeesStorage";
    string private constant _VERSION = "2.0.0";

    bool private _delayFreePeriodSet;
    uint256 public delayFreePeriodEnd;

    address public oldNOFSAddress;

    // identityId => OperatorFee[]
    mapping(uint72 => NodeOperatorStructs.OperatorFee[]) public operatorFees;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress, address _oldNOFSAddress) HubDependent(hubAddress) {
        oldNOFSAddress = _oldNOFSAddress;
    }

    modifier onlyOnce() {
        require(!_delayFreePeriodSet, "Fn has already been executed");
        _;
        _delayFreePeriodSet = true;
    }

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function operatorFeeMigration(uint72[] calldata identityIds) external {
        NodeOperatorFeesStorage oldNOFS = NodeOperatorFeesStorage(oldNOFSAddress);
        StakingStorage ss = StakingStorage(hub.getContractAddress("StakingStorage"));
        for (uint72 i; i < identityIds.length; ) {
            NodeOperatorStructs.OperatorFee[] memory oldOperatorFees = oldNOFS.getOperatorFees(identityIds[i]);
            if (oldOperatorFees.length != 0) {
                operatorFees[identityIds[i]] = oldOperatorFees;
            } else {
                uint96 feePercentage96 = ss.operatorFees(identityIds[i]);
                require(feePercentage96 <= type(uint8).max, "Fee percentage exceeds uint8 range");
                uint8 feePercentage = uint8(feePercentage96);
                operatorFees[identityIds[i]].push(
                    NodeOperatorStructs.OperatorFee({
                        feePercentage: feePercentage,
                        effectiveDate: uint248(block.timestamp)
                    })
                );
            }
            unchecked {
                i++;
            }
        }
    }

    function addOperatorFee(uint72 identityId, uint8 feePercentage, uint248 effectiveDate) external onlyContracts {
        operatorFees[identityId].push(
            NodeOperatorStructs.OperatorFee({feePercentage: feePercentage, effectiveDate: effectiveDate})
        );
    }

    function getOperatorFees(uint72 identityId) external view returns (NodeOperatorStructs.OperatorFee[] memory) {
        return operatorFees[identityId];
    }

    function deleteOperatorFees(uint72 identityId) external onlyContracts {
        delete operatorFees[identityId];
    }

    function replacePendingOperatorFee(
        uint72 identityId,
        uint8 feePercentage,
        uint248 effectiveDate
    ) external onlyContracts {
        if (
            operatorFees[identityId].length == 0 ||
            block.timestamp > operatorFees[identityId][operatorFees[identityId].length - 1].effectiveDate
        ) {
            revert NodeOperatorErrors.NoPendingOperatorFee();
        }

        operatorFees[identityId][operatorFees[identityId].length - 1] = NodeOperatorStructs.OperatorFee({
            feePercentage: feePercentage,
            effectiveDate: effectiveDate
        });
    }

    function getOperatorFeesLength(uint72 identityId) external view returns (uint256) {
        return operatorFees[identityId].length;
    }

    function getOperatorFeeByIndex(
        uint72 identityId,
        uint256 index
    ) public view returns (NodeOperatorStructs.OperatorFee memory) {
        return operatorFees[identityId][index];
    }

    function getOperatorFeeByTimestamp(
        uint72 identityId,
        uint256 timestamp
    ) external view returns (NodeOperatorStructs.OperatorFee memory) {
        return _getOperatorFeeByTimestamp(identityId, timestamp, false);
    }

    function getOperatorFeeByTimestampReverse(
        uint72 identityId,
        uint256 timestamp
    ) external view returns (NodeOperatorStructs.OperatorFee memory) {
        return _getOperatorFeeByTimestamp(identityId, timestamp, true);
    }

    function getLatestOperatorFee(uint72 identityId) external view returns (NodeOperatorStructs.OperatorFee memory) {
        return _safeGetOperatorFee(identityId, operatorFees[identityId].length - 1);
    }

    function getActiveOperatorFee(uint72 identityId) external view returns (NodeOperatorStructs.OperatorFee memory) {
        if (block.timestamp > operatorFees[identityId][operatorFees[identityId].length - 1].effectiveDate) {
            return operatorFees[identityId][operatorFees[identityId].length - 1];
        } else {
            return operatorFees[identityId][operatorFees[identityId].length - 2];
        }
    }

    function getOperatorFeePercentageByIndex(uint72 identityId, uint256 index) external view returns (uint8) {
        return operatorFees[identityId][index].feePercentage;
    }

    function getOperatorFeePercentageByTimestamp(uint72 identityId, uint256 timestamp) external view returns (uint8) {
        return _getOperatorFeeByTimestamp(identityId, timestamp, false).feePercentage;
    }

    function getOperatorFeePercentageByTimestampReverse(
        uint72 identityId,
        uint256 timestamp
    ) external view returns (uint8) {
        return _getOperatorFeeByTimestamp(identityId, timestamp, true).feePercentage;
    }

    function getLatestOperatorFeePercentage(uint72 identityId) external view returns (uint8) {
        return operatorFees[identityId][operatorFees[identityId].length - 1].feePercentage;
    }

    function getActiveOperatorFeePercentage(uint72 identityId) external view returns (uint8) {
        if (operatorFees[identityId].length == 0) {
            return 0;
        }

        if (block.timestamp > operatorFees[identityId][operatorFees[identityId].length - 1].effectiveDate) {
            return operatorFees[identityId][operatorFees[identityId].length - 1].feePercentage;
        } else {
            return operatorFees[identityId][operatorFees[identityId].length - 2].feePercentage;
        }
    }

    function getOperatorFeeEffectiveDateByIndex(uint72 identityId, uint256 index) external view returns (uint248) {
        return operatorFees[identityId][index].effectiveDate;
    }

    function getOperatorFeeEffectiveDateByTimestamp(
        uint72 identityId,
        uint256 timestamp
    ) external view returns (uint248) {
        return _getOperatorFeeByTimestamp(identityId, timestamp, false).effectiveDate;
    }

    function getOperatorFeeEffectiveDateByTimestampReverse(
        uint72 identityId,
        uint256 timestamp
    ) external view returns (uint248) {
        return _getOperatorFeeByTimestamp(identityId, timestamp, true).effectiveDate;
    }

    function getLatestOperatorFeeEffectiveDate(uint72 identityId) external view returns (uint248) {
        return _safeGetOperatorFee(identityId, operatorFees[identityId].length - 1).effectiveDate;
    }

    function getActiveOperatorFeeEffectiveDate(uint72 identityId) external view returns (uint248) {
        if (operatorFees[identityId].length == 0) {
            return 0;
        }

        if (block.timestamp > operatorFees[identityId][operatorFees[identityId].length - 1].effectiveDate) {
            return operatorFees[identityId][operatorFees[identityId].length - 1].effectiveDate;
        } else {
            return operatorFees[identityId][operatorFees[identityId].length - 2].effectiveDate;
        }
    }

    function isOperatorFeeChangePending(uint72 identityId) external view returns (bool) {
        return (operatorFees[identityId].length != 0 &&
            block.timestamp <= operatorFees[identityId][operatorFees[identityId].length - 1].effectiveDate);
    }

    function setDelayFreePeriodEnd(uint256 timestamp) external onlyHubOwner onlyOnce {
        delayFreePeriodEnd = timestamp;
    }

    function _safeGetOperatorFee(
        uint72 identityId,
        uint256 index
    ) internal view returns (NodeOperatorStructs.OperatorFee memory) {
        if (operatorFees[identityId].length == 0) {
            return NodeOperatorStructs.OperatorFee({feePercentage: 0, effectiveDate: 0});
        } else {
            return operatorFees[identityId][index];
        }
    }

    function _getOperatorFeeByTimestamp(
        uint72 identityId,
        uint256 timestamp,
        bool reverseLookup
    ) internal view returns (NodeOperatorStructs.OperatorFee memory) {
        if (operatorFees[identityId].length == 0) {
            return NodeOperatorStructs.OperatorFee({feePercentage: 0, effectiveDate: 0});
        }

        if (timestamp > operatorFees[identityId][operatorFees[identityId].length - 1].effectiveDate) {
            return operatorFees[identityId][operatorFees[identityId].length - 1];
        } else if (timestamp < operatorFees[identityId][0].effectiveDate) {
            return operatorFees[identityId][0];
        }

        if (reverseLookup) {
            for (uint i = operatorFees[identityId].length - 1; i > 0; ) {
                unchecked {
                    --i;
                }

                if (operatorFees[identityId][i].effectiveDate <= timestamp) {
                    return operatorFees[identityId][i];
                }
            }

            return operatorFees[identityId][0];
        } else {
            for (uint i; i < operatorFees[identityId].length; ) {
                if (operatorFees[identityId][i].effectiveDate > timestamp) {
                    return i == 0 ? operatorFees[identityId][0] : operatorFees[identityId][i - 1];
                }

                unchecked {
                    i++;
                }
            }
        }

        revert("No fees set");
    }
}
