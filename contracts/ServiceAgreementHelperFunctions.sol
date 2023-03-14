// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import {HashingProxy} from "./HashingProxy.sol";
import {Hub} from "./Hub.sol";
import {Named} from "./interface/Named.sol";
import {Versioned} from "./interface/Versioned.sol";
import {GeneralErrors} from "./errors/GeneralErrors.sol";
import {ServiceAgreementErrorsV1U1} from "./errors/ServiceAgreementErrorsV1U1.sol";

contract ServiceAgreementHelperFunctions is Named, Versioned {
    string private constant _NAME = "ServiceAgreementHelperFunctions";
    string private constant _VERSION = "1.0.0";

    Hub public hub;
    HashingProxy public hashingProxy;

    error ScoreError();

    constructor(address hubAddress) {
        require(hubAddress != address(0), "Hub Address cannot be 0x0");

        hub = Hub(hubAddress);
        initialize();
    }

    modifier onlyHubOwner() {
        _checkHubOwner();
        _;
    }

    function initialize() public onlyHubOwner {
        hashingProxy = HashingProxy(hub.getContractAddress("HashingProxy"));
    }

    function name() external pure virtual override returns (string memory) {
        return _NAME;
    }

    function version() external pure virtual override returns (string memory) {
        return _VERSION;
    }

    function generateAgreementId(
        address assetContract,
        uint256 tokenId,
        bytes calldata keyword,
        uint8 hashFunctionId
    ) public view virtual returns (bytes32) {
        if (!hub.isAssetStorage(assetContract))
            revert ServiceAgreementErrorsV1U1.AssetStorageNotInTheHub(assetContract);
        if (keccak256(keyword) == keccak256("")) revert ServiceAgreementErrorsV1U1.EmptyKeyword();

        return hashingProxy.callHashFunction(hashFunctionId, abi.encodePacked(assetContract, tokenId, keyword));
    }

    function _checkHubOwner() internal view virtual {
        if (msg.sender != hub.owner()) revert GeneralErrors.OnlyHubOwnerFunction(msg.sender);
    }
}
