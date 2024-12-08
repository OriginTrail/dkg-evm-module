// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

import {Guardian} from "../Guardian.sol";
import {Shares} from "../Shares.sol";
import {ProfileLib} from "../libraries/ProfileLib.sol";
import {INamed} from "../interfaces/INamed.sol";
import {IVersioned} from "../interfaces/IVersioned.sol";

contract ProfileStorage is INamed, IVersioned, Guardian {
    string private constant _NAME = "ProfileStorage";
    string private constant _VERSION = "1.0.0";

    // nodeId => isRegistered?
    mapping(bytes => bool) public nodeIdsList;
    // identityId => Profile
    mapping(uint72 => ProfileLib.ProfileDefinition) internal profiles;

    // shares token name => isTaken?
    mapping(string => bool) public sharesNames;
    // shares token ID => isTaken?
    mapping(string => bool) public sharesSymbols;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) Guardian(hubAddress) {}

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function createProfile(
        uint72 identityId,
        bytes calldata nodeId,
        uint96 initialAsk,
        address sharesContractAddress,
        uint8 initialOperatorFee
    ) external onlyContracts {
        ProfileLib.ProfileDefinition storage profile = profiles[identityId];
        profile.nodeId = nodeId;
        profile.ask = initialAsk;
        profile.sharesContractAddress = sharesContractAddress;
        profile.operatorFees.push(
            ProfileLib.OperatorFee({feePercentage: initialOperatorFee, effectiveDate: uint248(block.timestamp)})
        );
        nodeIdsList[nodeId] = true;

        Shares sharesContract = Shares(sharesContractAddress);
        sharesNames[sharesContract.name()] = true;
        sharesSymbols[sharesContract.symbol()] = true;
    }

    function getProfile(
        uint72 identityId
    ) external view returns (bytes memory nodeId, uint96[2] memory profileSettings, address sharesContractAddress) {
        ProfileLib.ProfileDefinition storage profile = profiles[identityId];
        return (profile.nodeId, [profile.ask, profile.accumulatedOperatorFee], profile.sharesContractAddress);
    }

    function deleteProfile(uint72 identityId) external onlyContracts {
        nodeIdsList[profiles[identityId].nodeId] = false;
        delete profiles[identityId];
    }

    function getNodeId(uint72 identityId) external view returns (bytes memory) {
        return profiles[identityId].nodeId;
    }

    function setNodeId(uint72 identityId, bytes calldata nodeId) external onlyContracts {
        ProfileLib.ProfileDefinition storage profile = profiles[identityId];

        nodeIdsList[profile.nodeId] = false;
        profile.nodeId = nodeId;
        nodeIdsList[nodeId] = true;
    }

    function getAsk(uint72 identityId) external view returns (uint96) {
        return profiles[identityId].ask;
    }

    function setAsk(uint72 identityId, uint96 ask) external onlyContracts {
        profiles[identityId].ask = ask;
    }

    function getAccumulatedOperatorFee(uint72 identityId) external view returns (uint96) {
        return profiles[identityId].accumulatedOperatorFee;
    }

    function setAccumulatedOperatorFee(uint72 identityId, uint96 newOperatorFeeAmount) external onlyContracts {
        profiles[identityId].accumulatedOperatorFee = newOperatorFeeAmount;
    }

    function getAccumulatedOperatorFeeWithdrawalAmount(uint72 identityId) external view returns (uint96) {
        return profiles[identityId].accumulatedOperatorFeeWithdrawalAmount;
    }

    function setAccumulatedOperatorFeeWithdrawalAmount(
        uint72 identityId,
        uint96 accumulatedOperatorFeeWithdrawalAmount
    ) external onlyContracts {
        profiles[identityId].accumulatedOperatorFeeWithdrawalAmount = accumulatedOperatorFeeWithdrawalAmount;
    }

    function getAccumulatedOperatorFeeWithdrawalTimestamp(uint72 identityId) external view returns (uint256) {
        return profiles[identityId].operatorFeeWithdrawalTimestamp;
    }

    function setAccumulatedOperatorFeeWithdrawalTimestamp(
        uint72 identityId,
        uint256 operatorFeeWithdrawalTimestamp
    ) external onlyContracts {
        profiles[identityId].operatorFeeWithdrawalTimestamp = operatorFeeWithdrawalTimestamp;
    }

    function getSharesContractAddress(uint72 identityId) external view returns (address) {
        return profiles[identityId].sharesContractAddress;
    }

    function setSharesContractAddress(uint72 identityId, address sharesContractAddress) external onlyContracts {
        profiles[identityId].sharesContractAddress = sharesContractAddress;
    }

    function addOperatorFee(uint72 identityId, uint8 feePercentage, uint248 effectiveDate) external onlyContracts {
        profiles[identityId].operatorFees.push(
            ProfileLib.OperatorFee({feePercentage: feePercentage, effectiveDate: effectiveDate})
        );
    }

    function getOperatorFees(uint72 identityId) external view returns (ProfileLib.OperatorFee[] memory) {
        return profiles[identityId].operatorFees;
    }

    function setOperatorFees(uint72 identityId, ProfileLib.OperatorFee[] memory operatorFees) external onlyContracts {
        profiles[identityId].operatorFees = operatorFees;
    }

    function replacePendingOperatorFee(
        uint72 identityId,
        uint8 feePercentage,
        uint248 effectiveDate
    ) external onlyContracts {
        if (
            profiles[identityId].operatorFees.length == 0 ||
            block.timestamp >
            profiles[identityId].operatorFees[profiles[identityId].operatorFees.length - 1].effectiveDate
        ) {
            revert ProfileLib.NoPendingOperatorFee();
        }

        profiles[identityId].operatorFees[profiles[identityId].operatorFees.length - 1] = ProfileLib.OperatorFee({
            feePercentage: feePercentage,
            effectiveDate: effectiveDate
        });
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
        return _safeGetOperatorFee(identityId, profiles[identityId].operatorFees.length - 1);
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
        return profiles[identityId].operatorFees[profiles[identityId].operatorFees.length - 1].feePercentage;
    }

    function getActiveOperatorFeePercentage(uint72 identityId) external view returns (uint8) {
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

    function getOperatorFeeEffectiveDateByIndex(uint72 identityId, uint256 index) external view returns (uint248) {
        return profiles[identityId].operatorFees[index].effectiveDate;
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
        return _safeGetOperatorFee(identityId, profiles[identityId].operatorFees.length - 1).effectiveDate;
    }

    function getActiveOperatorFeeEffectiveDate(uint72 identityId) external view returns (uint248) {
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

    function transferAccumulatedOperatorFee(address receiver, uint96 amount) external onlyContracts {
        tokenContract.transfer(receiver, amount);
    }

    function _safeGetOperatorFee(
        uint72 identityId,
        uint256 index
    ) internal view returns (ProfileLib.OperatorFee memory) {
        if (profiles[identityId].operatorFees.length == 0) {
            return ProfileLib.OperatorFee({feePercentage: 0, effectiveDate: 0});
        } else {
            return profiles[identityId].operatorFees[index];
        }
    }

    function _getOperatorFeeByTimestamp(
        uint72 identityId,
        uint256 timestamp,
        bool reverseLookup
    ) internal view returns (ProfileLib.OperatorFee memory) {
        if (profiles[identityId].operatorFees.length == 0) {
            return ProfileLib.OperatorFee({feePercentage: 0, effectiveDate: 0});
        }

        if (timestamp > profiles[identityId].operatorFees[profiles[identityId].operatorFees.length - 1].effectiveDate) {
            return profiles[identityId].operatorFees[profiles[identityId].operatorFees.length - 1];
        } else if (timestamp < profiles[identityId].operatorFees[0].effectiveDate) {
            return profiles[identityId].operatorFees[0];
        }

        if (reverseLookup) {
            for (uint256 i = profiles[identityId].operatorFees.length - 1; i > 0; ) {
                unchecked {
                    --i;
                }

                if (profiles[identityId].operatorFees[i].effectiveDate <= timestamp) {
                    return profiles[identityId].operatorFees[i];
                }
            }

            return profiles[identityId].operatorFees[0];
        } else {
            for (uint256 i; i < profiles[identityId].operatorFees.length; ) {
                if (profiles[identityId].operatorFees[i].effectiveDate > timestamp) {
                    return i == 0 ? profiles[identityId].operatorFees[0] : profiles[identityId].operatorFees[i - 1];
                }

                unchecked {
                    i++;
                }
            }
        }

        revert("No fees set");
    }
}
