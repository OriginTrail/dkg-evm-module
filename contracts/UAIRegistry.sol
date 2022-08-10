// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v4.6.0) (token/ERC721/ERC721.sol)

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./Hub.sol";

/**
 * @dev Implementation of https://eips.ethereum.org/EIPS/eip-721[ERC721] Non-Fungible Token Standard, including
 * the Metadata extension, but not including the Enumerable extension, which is available separately as
 * {ERC721Enumerable}.
 */
contract UAIRegistry is ERC721, AccessControl, Ownable  {
    Hub public hub;

    // Base URI
    string private baseURI;
    uint256 private tokenId;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");


    constructor(address hubAddress) ERC721("DKG Asset Graphs", "DKG"){
        require(hubAddress != address(0));
        hub = Hub(hubAddress);

        setBaseURI("https://web3explorer.origintrail.io/token-resolver/");
        tokenId = 0;
    }

    function setupRole(address minter) public onlyOwner {
        _setupRole(MINTER_ROLE, minter);
    }

    function setBaseURI(string memory URI) public onlyOwner {
        baseURI = URI;
    }

    function _baseURI() internal override view returns  (string memory) {
        return baseURI;
    }

    function mintUAI(address to) public returns (uint256) {
        require(hasRole(MINTER_ROLE, msg.sender), "Caller is not a minter");
        //TODO check if tokenId < 2^256

        _mint(to, tokenId);
        return tokenId++;
    }

    function transfer(address from, address to, uint256 _tokenId) public {
        _transfer(from, to, _tokenId);
    }

    function exists(uint256 _tokenId) public view returns (bool) {
        return _exists(_tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
