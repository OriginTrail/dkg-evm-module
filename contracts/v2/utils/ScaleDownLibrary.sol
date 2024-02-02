// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

library ScaleDownLib {
    function toUint40(uint216 value, uint216 maxValue) internal pure returns (uint40) {
        return uint40((value * type(uint40).max) / maxValue);
    }
}
