// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;

library HubLib {
    struct Contract {
        string name;
        address addr;
    }

    struct ForwardCallInputArgs {
        string contractName;
        bytes[] encodedData;
    }
}
