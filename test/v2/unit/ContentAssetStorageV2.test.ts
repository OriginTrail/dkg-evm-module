import { randomBytes } from 'crypto';

import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BytesLike } from 'ethers';
import hre from 'hardhat';

import { ContentAsset, ContentAssetStorageV2, HubController, ServiceAgreementV1, Token } from '../../../typechain';
import { ContentAssetStructs } from '../../../typechain/contracts/v1/assets/ContentAsset';

type ContentAssetStorageV2Fixture = {
  accounts: SignerWithAddress[];
  HubController: HubController;
  Token: Token;
  ServiceAgreementV1: ServiceAgreementV1;
  ContentAsset: ContentAsset;
  ContentAssetStorageV2: ContentAssetStorageV2;
};

describe('@v2 @unit ContentAssetStorageV2', function () {
  let accounts: SignerWithAddress[];
  let HubController: HubController;
  let Token: Token;
  let ServiceAgreementV1: ServiceAgreementV1;
  let ContentAsset: ContentAsset;
  let ContentAssetStorageV2: ContentAssetStorageV2;

  const assertionId = '0x' + randomBytes(32).toString('hex');
  const assetInputStruct: ContentAssetStructs.AssetInputArgsStruct = {
    assertionId: assertionId,
    size: 1000,
    triplesNumber: 10,
    chunksNumber: 10,
    epochsNumber: 5,
    tokenAmount: hre.ethers.utils.parseEther('250'),
    scoreFunctionId: 1,
    immutable_: false,
  };

  async function deployContentAssetStorageV2Fixture(): Promise<ContentAssetStorageV2Fixture> {
    await hre.deployments.fixture(['HubV2', 'Token', 'ContentAssetStorageV2', 'IdentityStorageV2', 'ContentAsset']);
    HubController = await hre.ethers.getContract<HubController>('HubController');
    Token = await hre.ethers.getContract<Token>('Token');
    ServiceAgreementV1 = await hre.ethers.getContract<ServiceAgreementV1>('ServiceAgreementV1');
    ContentAsset = await hre.ethers.getContract<ContentAsset>('ContentAsset');
    ContentAssetStorageV2 = await hre.ethers.getContract<ContentAssetStorageV2>('ContentAssetStorage');
    accounts = await hre.ethers.getSigners();

    return { accounts, HubController, Token, ServiceAgreementV1, ContentAsset, ContentAssetStorageV2 };
  }

  async function createAsset(): Promise<{ tokenId: number; keyword: BytesLike; agreementId: BytesLike }> {
    await Token.increaseAllowance(ServiceAgreementV1.address, assetInputStruct.tokenAmount);
    const receipt = await (await ContentAsset.createAsset(assetInputStruct)).wait();
    const tokenId = Number(receipt.logs[0].topics[3]);

    const keyword = hre.ethers.utils.solidityPack(
      ['address', 'bytes32'],
      [ContentAssetStorageV2.address, assetInputStruct.assertionId],
    );
    const agreementId = hre.ethers.utils.soliditySha256(
      ['address', 'uint256', 'bytes'],
      [ContentAssetStorageV2.address, tokenId, keyword],
    );
    return { tokenId, keyword, agreementId };
  }

  beforeEach(async function () {
    hre.helpers.resetDeploymentsJson();
    ({ accounts, ContentAssetStorageV2 } = await loadFixture(deployContentAssetStorageV2Fixture));
  });

  // Test for successful deployment
  it('Should deploy successfully with correct initial parameters', async function () {
    expect(await ContentAssetStorageV2.name()).to.equal('ContentAssetStorage');
    expect(await ContentAssetStorageV2.version()).to.equal('2.0.0');
  });

  // Test for ERC4906 interface support
  it('Should correctly identify supported interfaces', async function () {
    expect(await ContentAssetStorageV2.supportsInterface('0x49064906')).to.be.true;
  });

  // Test for token ID generation
  it('Should increment and return correct token ID on generateTokenId', async function () {
    const { tokenId: tokenId1 } = await createAsset();
    expect(tokenId1).to.be.equal(1);
    const { tokenId: tokenId2 } = await createAsset();
    expect(tokenId2).to.be.equal(2);
  });

  // Test for token URI generation
  it('Should return the correct token URI', async function () {
    const { tokenId } = await createAsset();
    expect((await ContentAssetStorageV2.tokenURI(tokenId)).toLowerCase()).to.be.equal(
      `did:dkg:hardhat:31337/${ContentAssetStorageV2.address.toLowerCase()}/${tokenId}`,
    );
  });

  // Test for setting base URI
  it('Should update tokenBaseURI correctly', async function () {
    const { tokenId } = await createAsset();
    expect((await ContentAssetStorageV2.tokenURI(tokenId)).toLowerCase()).to.be.equal(
      `did:dkg:hardhat:31337/${ContentAssetStorageV2.address.toLowerCase()}/${tokenId}`,
    );

    // Update Base URI
    await expect(
      HubController.forwardCall(
        ContentAssetStorageV2.address,
        ContentAssetStorageV2.interface.encodeFunctionData('setBaseURI', ['https://dkg.resolver.origintrail.io/']),
      ),
    ).to.emit(ContentAssetStorageV2, 'BatchMetadataUpdate');

    // Expect new token URI
    expect((await ContentAssetStorageV2.tokenURI(tokenId)).toLowerCase()).to.be.equal(
      `https://dkg.resolver.origintrail.io/did:dkg:hardhat:31337/${ContentAssetStorageV2.address.toLowerCase()}/${tokenId}`,
    );
  });

  // Test for getting the last token ID
  it('Should return correct last token ID', async function () {
    const { tokenId: tokenId1 } = await createAsset();
    expect(await ContentAssetStorageV2.lastTokenId()).to.be.equal(tokenId1);

    const { tokenId: tokenId2 } = await createAsset();
    expect(await ContentAssetStorageV2.lastTokenId()).to.be.equal(tokenId2);

    const { tokenId: tokenId3 } = await createAsset();
    expect(await ContentAssetStorageV2.lastTokenId()).to.be.equal(tokenId3);
  });
});
