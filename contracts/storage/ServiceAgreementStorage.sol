// SPDX-License-Identifier: MIT

pragma solidity^0.8.0;

import {Hub} from '../Hub.sol';


contract ServiceAgreementStorage {
    struct CommitWindow {
        uint256 closingBlock;
        bool isOpen;
    }

    struct ProofSubmission {
        bytes node_id;
        uint256 stake;
        uint256 multiplier;
    }

    struct ServiceAgreement {
        CommitWindow commitWindow;
        ProofSubmission[] proofSubmissions;
    }

    Hub public hub;

    // UAL -> ServiceAgreement
    mapping(uint256 => ServiceAgreement) serviceAgreements;

    constructor (address hubAddress) {
        require(hubAddress != address(0));
        hub = Hub(hubAddress);
    }

    function openCommitWindow(uint256 UAL, uint256 blocks_num)
        public
    {
        serviceAgreements[UAL].commitWindow.closingBlock = block.number + blocks_num;
        serviceAgreements[UAL].commitWindow.isOpen = true;
    }

    function closeCommitWindow(uint256 UAL)
        public
    {
        serviceAgreements[UAL].commitWindow.isOpen = false;
    }

    function isCommitWindowOpen(uint256 UAL, uint256 epoch_num)
        public
    {

    }

    function submitCommit()
        public
    {

    }

    function getCommits()
        public
    {

    }

    function _calculateMultiplier()
        internal
    {

    }
}
