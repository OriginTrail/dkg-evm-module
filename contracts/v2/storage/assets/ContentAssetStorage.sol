// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {ContentAssetStorage} from "../../../v1/storage/assets/ContentAssetStorage.sol";
import {IERC4906} from "@openzeppelin/contracts/interfaces/IERC4906.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC165} from "@openzeppelin/contracts/interfaces/IERC165.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {ContentAssetErrors} from "../../errors/assets/ContentAssetErrors.sol";

contract ContentAssetStorageV2 is ContentAssetStorage, IERC4906 {
    using Strings for address;
    using Strings for uint256;

    string private constant _VERSION = "2.0.1";

    // Interface ID as defined in ERC-4906. This does not correspond to a traditional interface ID as ERC-4906 only
    // defines events and does not include any external function.
    bytes4 private constant ERC4906_INTERFACE_ID = bytes4(0x49064906);

    uint256 internal _tokenId = 1;

    string public tokenBaseURI;

    // solhint-disable-next-line no-empty-blocks
    constructor(address hubAddress) ContentAssetStorage(hubAddress) {}

    function version() external pure override returns (string memory) {
        return _VERSION;
    }

    /**
     * @dev See {IERC165-supportsInterface}
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721, IERC165) returns (bool) {
        return interfaceId == ERC4906_INTERFACE_ID || super.supportsInterface(interfaceId);
    }

    function generateTokenId() external virtual override onlyContracts returns (uint256) {
        unchecked {
            return _tokenId++;
        }
    }

    function lastTokenId() public view virtual returns (uint256) {
        if (_tokenId == 1) revert ContentAssetErrors.NoMintedAssets();

        unchecked {
            return _tokenId - 1;
        }
    }

    function setBaseURI(string memory baseURI) external virtual onlyHubOwner {
        tokenBaseURI = baseURI;

        if (_tokenId > 1) emit BatchMetadataUpdate(1, lastTokenId());
    }

    function _baseURI() internal view virtual override returns (string memory) {
        return tokenBaseURI;
    }
}
