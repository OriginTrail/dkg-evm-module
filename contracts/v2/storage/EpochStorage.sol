// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

contract EpochStorage {
    uint256 public startTime;

    constructor() {
        startTime = calculateCurrentQuarterStart(block.timestamp);
    }

    function calculateCurrentQuarterStart(uint256 currentTime) private pure returns (uint256) {
        (uint year, uint month, ) = timestampToDate(currentTime);
        uint quarterStartMonth = ((month - 1) / 3) * 3 + 1;
        return dateToTimestamp(year, quarterStartMonth, 1);
    }

    function calculateQuarterDuration(uint256 quarterStartTime) private pure returns (uint256) {
        (uint year, uint month, ) = timestampToDate(quarterStartTime);
        uint daysInQuarter = 0;
        for (uint i = 0; i < 3; i++) {
            daysInQuarter += daysInMonth(month + i, year);
        }
        return daysInQuarter * 1 days;
    }

    function daysInMonth(uint month, uint year) private pure returns (uint) {
        if (month == 2) {
            bool isLeapYear = (year % 4 == 0 && (year % 100 != 0 || year % 400 == 0));
            return isLeapYear ? 29 : 28;
        } else if (month == 4 || month == 6 || month == 9 || month == 11) {
            return 30;
        } else {
            return 31;
        }
    }

    function timestampToDate(uint256 timestamp) private pure returns (uint year, uint month, uint day) {
        uint z = timestamp / 86400 + 719468;
        uint era = (z >= 0 ? z : z - 146096) / 146097;
        uint doe = z - era * 146097;
        uint yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
        year = yoe + era * 400;
        uint doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        uint mp = (5 * doy + 2) / 153;
        day = doy - (153 * mp + 2) / 5 + 1;
        month = mp < 10 ? mp + 3 : mp - 9;
        year += (month <= 2) ? 1 : 0;
    }

    function dateToTimestamp(uint year, uint month, uint day) private pure returns (uint256 timestamp) {
        uint y = (month <= 2) ? year - 1 : year;
        uint m = (month <= 2) ? month + 12 : month;
        uint d = day;
        return
            (d -
                32075 +
                (1461 * (y + 4800 + (m - 14) / 12)) /
                4 +
                (367 * (m - 2 - ((m - 14) / 12) * 12)) /
                12 -
                (3 * ((y + 4900 + (m - 14) / 12) / 100)) /
                4) * 86400;
    }

    function getCurrentEpoch() public view returns (uint256) {
        return
            (block.timestamp - startTime) / calculateQuarterDuration(calculateCurrentQuarterStart(block.timestamp)) + 1;
    }
}
