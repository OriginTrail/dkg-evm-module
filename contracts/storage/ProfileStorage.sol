// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {HubDependent} from "../abstract/HubDependent.sol";
import {ProfileLib} from "../libraries/ProfileLib.sol";
import {INamed} from "../interfaces/INamed.sol";
import {IVersioned} from "../interfaces/IVersioned.sol";

contract ProfileStorage is INamed, IVersioned, HubDependent {
    string private constant _NAME = "ProfileStorage";
    string private constant _VERSION = "1.0.0";

    event ProfileCreated(uint72 indexed identityId, string nodeName, bytes nodeId, uint8 initialOperatorFee);
    event ProfileDeleted(uint72 indexed identityId, bytes nodeId);
    event NodeNameUpdated(uint72 indexed identityId, string oldName, string newName);
    event NodeIdUpdated(uint72 indexed identityId, bytes oldNodeId, bytes newNodeId);
    event NodeAskUpdated(uint72 indexed identityId, uint96 oldAsk, uint96 newAsk);
    event OperatorFeeAdded(uint72 indexed identityId, uint8 feePercentage, uint256 effectiveDate);
    event OperatorFeesReplaced(
        uint72 indexed identityId,
        uint8 oldFeePercentage,
        uint8 newFeePercentage,
        uint256 effectiveDate
    );
    event OperatorFeesUpdated(uint72 indexed identityId, ProfileLib.OperatorFee[] operatorFees);

    mapping(uint72 => ProfileLib.ProfileInfo) public profiles;
    mapping(bytes => bool) public nodeIdsList;
    mapping(uint72 => uint256) public askUpdateCooldown;

    constructor(address hubAddress) HubDependent(hubAddress) {}

    function name() external pure override returns (string memory) {
        return _NAME;
    }

    function version() external pure override returns (string memory) {
        return _VERSION;
    }

    function createProfile(
        uint72 identityId,
        string calldata nodeName,
        bytes calldata nodeId,
        uint8 initialOperatorFee
    ) external onlyContracts {
        ProfileLib.ProfileInfo storage profile = profiles[identityId];
        profile.name = nodeName;
        profile.nodeId = nodeId;
        profile.operatorFees.push(ProfileLib.OperatorFee(initialOperatorFee, block.timestamp));
        nodeIdsList[nodeId] = true;
        emit ProfileCreated(identityId, nodeName, nodeId, initialOperatorFee);
    }

    function getProfile(
        uint72 identityId
    ) external view returns (string memory, bytes memory, uint96, ProfileLib.OperatorFee[] memory) {
        ProfileLib.ProfileInfo storage profile = profiles[identityId];
        return (profile.name, profile.nodeId, profile.ask, profile.operatorFees);
    }

    function deleteProfile(uint72 identityId) external onlyContracts {
        bytes memory nodeId = profiles[identityId].nodeId;
        nodeIdsList[nodeId] = false;
        delete profiles[identityId];
        emit ProfileDeleted(identityId, nodeId);
    }

    function getName(uint72 identityId) external view returns (string memory) {
        return profiles[identityId].name;
    }

    function setName(uint72 identityId, string memory _name) external onlyContracts {
        ProfileLib.ProfileInfo storage profile = profiles[identityId];
        string memory oldName = profile.name;

        profile.name = _name;

        emit NodeNameUpdated(identityId, oldName, _name);
    }

    function getNodeId(uint72 identityId) external view returns (bytes memory) {
        return profiles[identityId].nodeId;
    }

    function setNodeId(uint72 identityId, bytes calldata nodeId) external onlyContracts {
        ProfileLib.ProfileInfo storage profile = profiles[identityId];
        bytes memory oldNodeId = profile.nodeId;

        nodeIdsList[oldNodeId] = false;
        profile.nodeId = nodeId;
        nodeIdsList[nodeId] = true;

        emit NodeIdUpdated(identityId, oldNodeId, nodeId);
    }

    function setAsk(uint72 identityId, uint96 ask) external onlyContracts {
        ProfileLib.ProfileInfo storage profile = profiles[identityId];
        uint96 oldAsk = profile.ask;

        profile.ask = ask;

        emit NodeAskUpdated(identityId, oldAsk, ask);
    }

    function setAskUpdateCooldown(uint72 identityId, uint256 cooldownEnd) external onlyContracts {
        askUpdateCooldown[identityId] = cooldownEnd;
    }

    function getAsk(uint72 identityId) external view returns (uint96) {
        return profiles[identityId].ask;
    }

    function addOperatorFee(uint72 identityId, uint8 feePercentage, uint256 effectiveDate) external onlyContracts {
        profiles[identityId].operatorFees.push(ProfileLib.OperatorFee(feePercentage, effectiveDate));
        emit OperatorFeeAdded(identityId, feePercentage, effectiveDate);
    }

    function getOperatorFee(uint72 identityId) external view returns (uint8) {
        return getActiveOperatorFeePercentage(identityId);
    }

    function getOperatorFees(uint72 identityId) external view returns (ProfileLib.OperatorFee[] memory) {
        return profiles[identityId].operatorFees;
    }

    function setOperatorFees(uint72 identityId, ProfileLib.OperatorFee[] memory operatorFees) external onlyContracts {
        profiles[identityId].operatorFees = operatorFees;
        emit OperatorFeesUpdated(identityId, operatorFees);
    }

    function replacePendingOperatorFee(
        uint72 identityId,
        uint8 feePercentage,
        uint256 effectiveDate
    ) external onlyContracts {
        if (
            profiles[identityId].operatorFees.length == 0 ||
            block.timestamp >
            profiles[identityId].operatorFees[profiles[identityId].operatorFees.length - 1].effectiveDate
        ) {
            revert ProfileLib.NoPendingOperatorFee();
        }

        uint8 oldFeePercentage = profiles[identityId]
            .operatorFees[profiles[identityId].operatorFees.length - 1]
            .feePercentage;
        profiles[identityId].operatorFees[profiles[identityId].operatorFees.length - 1] = ProfileLib.OperatorFee({
            feePercentage: feePercentage,
            effectiveDate: effectiveDate
        });

        emit OperatorFeesReplaced(identityId, oldFeePercentage, feePercentage, effectiveDate);
    }

    function getOperatorFeesLength(uint72 identityId) external view returns (uint256) {
        return profiles[identityId].operatorFees.length;
    }

    function getOperatorFeeByIndex(
        uint72 identityId,
        uint256 index
    ) public view returns (ProfileLib.OperatorFee memory) {
        return profiles[identityId].operatorFees[index];
    }

    function getOperatorFeeByTimestamp(
        uint72 identityId,
        uint256 timestamp
    ) external view returns (ProfileLib.OperatorFee memory) {
        return _getOperatorFeeByTimestamp(identityId, timestamp, false);
    }

    function getOperatorFeeByTimestampReverse(
        uint72 identityId,
        uint256 timestamp
    ) external view returns (ProfileLib.OperatorFee memory) {
        return _getOperatorFeeByTimestamp(identityId, timestamp, true);
    }

    function getLatestOperatorFee(uint72 identityId) external view returns (ProfileLib.OperatorFee memory) {
        return _safeGetLatestOperatorFee(identityId);
    }

    function getActiveOperatorFee(uint72 identityId) external view returns (ProfileLib.OperatorFee memory) {
        if (
            block.timestamp >
            profiles[identityId].operatorFees[profiles[identityId].operatorFees.length - 1].effectiveDate
        ) {
            return profiles[identityId].operatorFees[profiles[identityId].operatorFees.length - 1];
        } else {
            return profiles[identityId].operatorFees[profiles[identityId].operatorFees.length - 2];
        }
    }

    function getOperatorFeePercentageByIndex(uint72 identityId, uint256 index) external view returns (uint8) {
        return profiles[identityId].operatorFees[index].feePercentage;
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
        return _safeGetLatestOperatorFee(identityId).feePercentage;
    }

    function getActiveOperatorFeePercentage(uint72 identityId) public view returns (uint8) {
        if (profiles[identityId].operatorFees.length == 0) {
            return 0;
        }

        if (
            block.timestamp >
            profiles[identityId].operatorFees[profiles[identityId].operatorFees.length - 1].effectiveDate
        ) {
            return profiles[identityId].operatorFees[profiles[identityId].operatorFees.length - 1].feePercentage;
        } else {
            return profiles[identityId].operatorFees[profiles[identityId].operatorFees.length - 2].feePercentage;
        }
    }

    function getOperatorFeeEffectiveDateByIndex(uint72 identityId, uint256 index) external view returns (uint256) {
        return profiles[identityId].operatorFees[index].effectiveDate;
    }

    function getOperatorFeeEffectiveDateByTimestamp(
        uint72 identityId,
        uint256 timestamp
    ) external view returns (uint256) {
        return _getOperatorFeeByTimestamp(identityId, timestamp, false).effectiveDate;
    }

    function getOperatorFeeEffectiveDateByTimestampReverse(
        uint72 identityId,
        uint256 timestamp
    ) external view returns (uint256) {
        return _getOperatorFeeByTimestamp(identityId, timestamp, true).effectiveDate;
    }

    function getLatestOperatorFeeEffectiveDate(uint72 identityId) external view returns (uint256) {
        return _safeGetLatestOperatorFee(identityId).effectiveDate;
    }

    function getActiveOperatorFeeEffectiveDate(uint72 identityId) external view returns (uint256) {
        if (profiles[identityId].operatorFees.length == 0) {
            return 0;
        }

        if (
            block.timestamp >
            profiles[identityId].operatorFees[profiles[identityId].operatorFees.length - 1].effectiveDate
        ) {
            return profiles[identityId].operatorFees[profiles[identityId].operatorFees.length - 1].effectiveDate;
        } else {
            return profiles[identityId].operatorFees[profiles[identityId].operatorFees.length - 2].effectiveDate;
        }
    }

    function isOperatorFeeChangePending(uint72 identityId) external view returns (bool) {
        return (profiles[identityId].operatorFees.length != 0 &&
            block.timestamp <=
            profiles[identityId].operatorFees[profiles[identityId].operatorFees.length - 1].effectiveDate);
    }

    function profileExists(uint72 identityId) external view returns (bool) {
        return keccak256(profiles[identityId].nodeId) != keccak256(bytes(""));
    }

    function _safeGetLatestOperatorFee(uint72 identityId) internal view returns (ProfileLib.OperatorFee memory) {
        if (profiles[identityId].operatorFees.length == 0) {
            return ProfileLib.OperatorFee({feePercentage: 0, effectiveDate: 0});
        } else {
            return profiles[identityId].operatorFees[profiles[identityId].operatorFees.length - 1];
        }
    }

    function _getOperatorFeeByTimestamp(
        uint72 identityId,
        uint256 timestamp,
        bool reverseLookup
    ) internal view returns (ProfileLib.OperatorFee memory) {
        ProfileLib.OperatorFee[] storage fees = profiles[identityId].operatorFees;

        if (fees.length == 0) {
            return ProfileLib.OperatorFee({feePercentage: 0, effectiveDate: 0});
        }
        if (timestamp > fees[fees.length - 1].effectiveDate) {
            return fees[fees.length - 1];
        }
        if (timestamp < fees[0].effectiveDate) {
            return fees[0];
        }
        if (reverseLookup) {
            for (uint256 i = fees.length - 1; i > 0; ) {
                unchecked {
                    --i;
                }
                if (fees[i].effectiveDate <= timestamp) {
                    return fees[i];
                }
            }
            return fees[0];
        } else {
            for (uint256 i; i < fees.length; ) {
                if (fees[i].effectiveDate > timestamp) {
                    return i == 0 ? fees[0] : fees[i - 1];
                }
                unchecked {
                    ++i;
                }
            }
        }
        return ProfileLib.OperatorFee({feePercentage: 0, effectiveDate: 0});
    }
}
