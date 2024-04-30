// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {HubDependent} from "../../v1/abstract/HubDependent.sol";
import {Named} from "../../v1/interface/Named.sol";
import {Versioned} from "../../v1/interface/Versioned.sol";
import {ParanetStructs} from "../structs/paranets/ParanetStructs.sol";

contract ParanetIncentivesPool is Named, Versioned, HubDependent {
    string private constant _NAME = "ParanetIncentivesPool";
    string private constant _VERSION = "1.0.0";

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) HubDependent(hubAddress) {}

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }
}
