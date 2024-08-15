// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {KnowledgeCollectionStructs} from "../../structs/assets/KnowledgeCollectionStructs.sol";
import {Guardian} from "../../../v1/Guardian.sol";
import {ERC1155Delta} from "../../../tokens/ERC1155Delta.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract KnowledgeCollectionsRegistry is ERC1155Delta, Guardian {
    mapping(uint256 => KnowledgeCollectionStructs.KnowledgeCollection) knowledgeCollections;

    uint256 public lastKnowledgeCollectionId = 1;

    constructor(address hubAddress, string memory uri) ERC1155Delta(uri) Guardian(hubAddress) {}

    function createKnowledgeCollection(
        bytes32 newMerkleRoot,
        uint256 quantity,
        uint160 chunksNumber,
        uint96 tokenAmount
    ) external {
        knowledgeCollections[lastKnowledgeCollectionId] = KnowledgeCollectionStructs.KnowledgeCollection({
            merkleRoot: newMerkleRoot,
            totalChunksNumber: chunksNumber,
            totalTokenAmount: tokenAmount
        });

        unchecked {
            lastKnowledgeCollectionId += 1;
        }

        _mint(msg.sender, quantity);

        IERC20 tknc = tokenContract;
        require(tknc.allowance(msg.sender, address(this)) >= tokenAmount);
        require(tknc.balanceOf(msg.sender) >= tokenAmount);
        tknc.transferFrom(msg.sender, address(this), tokenAmount);
    }
}
