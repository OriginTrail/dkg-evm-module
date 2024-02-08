// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {HubDependent} from "../../v1/abstract/HubDependent.sol";
import {Named} from "../../v1/interface/Named.sol";
import {Versioned} from "../../v1/interface/Versioned.sol";

contract NodeOperatorFeeChangesStorage is Named, Versioned, HubDependent {
    string private constant _NAME = "NodeOperatorFeeChangesStorage";
    string private constant _VERSION = "2.0.0";

    struct OperatorFeeChangeRequest {
        uint8 newFee;
        uint256 timestamp;
    }

    bool private _delayFreePeriodSet;
    uint256 public delayFreePeriodEnd;

    // identityId => operatorFeeChangeRequest
    mapping(uint72 => OperatorFeeChangeRequest) public operatorFeeChangeRequests;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) HubDependent(hubAddress) {}

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

    function createOperatorFeeChangeRequest(uint72 identityId, uint8 newFee, uint256 timestamp) external onlyContracts {
        operatorFeeChangeRequests[identityId] = OperatorFeeChangeRequest({newFee: newFee, timestamp: timestamp});
    }

    function deleteOperatorFeeChangeRequest(uint72 identityId) external onlyContracts {
        delete operatorFeeChangeRequests[identityId];
    }

    function getOperatorFeeChangeRequestNewFee(uint72 identityId) external view returns (uint8) {
        return operatorFeeChangeRequests[identityId].newFee;
    }

    function getOperatorFeeChangeRequestTimestamp(uint72 identityId) external view returns (uint256) {
        return operatorFeeChangeRequests[identityId].timestamp;
    }

    function operatorFeeChangeRequestExists(uint72 identityId) external view returns (bool) {
        return operatorFeeChangeRequests[identityId].timestamp != 0;
    }

    function setDelayFreePeriodEnd(uint256 timestamp) external onlyHubOwner onlyOnce {
        delayFreePeriodEnd = timestamp;
    }
}
