// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

contract Migrations {
    address public owner = msg.sender;
    uint public lastCompletedMigration;

    modifier restricted() {
        require(msg.sender == owner, "Fn can only be called by owner");
        _;
    }

    function setCompleted(uint completed) public restricted {
        lastCompletedMigration = completed;
    }
}
