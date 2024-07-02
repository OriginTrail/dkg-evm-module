// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {Guardian} from "../../v1/Guardian.sol";
import {ERC1155Delta} from "../../tokens/ERC1155Delta.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract KnowledgeCollection is ERC1155Delta, Guardian {
    bytes32 merkleRoot;
    uint256 totalSize;
    uint160 totalChunksNumber;
    uint96 totalTokenAmount;

    constructor(address hubAddress, string memory uri) ERC1155Delta(uri) Guardian(hubAddress) {}

    function batchMint(
        bytes32 newMerkleRoot,
        uint256 quantity,
        uint256 size,
        uint160 chunksNumber,
        uint96 tokenAmount
    ) external {
        merkleRoot = newMerkleRoot;
        totalSize += size;
        totalChunksNumber += chunksNumber;
        totalTokenAmount += tokenAmount;

        _mint(msg.sender, quantity);

        IERC20 tknc = tokenContract;
        require(tknc.allowance(msg.sender, address(this)) >= tokenAmount);
        require(tknc.balanceOf(msg.sender) >= tokenAmount);
        tknc.transferFrom(msg.sender, address(this), tokenAmount);
    }
}
