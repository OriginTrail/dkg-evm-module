import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import hre from 'hardhat';

import { ContentAsset, ContentAssetStorage, ServiceAgreementV1, ERC20Token } from '../typechain';
import { ContentAssetStructs } from '../typechain/contracts/assets/ContentAsset';
import { ZERO_BYTES32 } from './helpers/constants';

type ContentAssetFixture = {
  accounts: SignerWithAddress[];
  ContentAsset: ContentAsset;
  ContentAssetStorage: ContentAssetStorage;
  ServiceAgreementV1: ServiceAgreementV1;
  ERC20Token: ERC20Token;
};

describe('ContentAsset contract', function () {
  let accounts: SignerWithAddress[];
  let ContentAsset: ContentAsset;
  let ContentAssetStorage: ContentAssetStorage;
  let ServiceAgreementV1: ServiceAgreementV1;
  let ERC20Token: ERC20Token;
  const nonExistingTokenId = 99;
  const assertionId = '0x8cc2117b68bcbb1535205d517cb42ef45f25838add571fce4cfb7de7bd617943';
  const assetInputStruct: ContentAssetStructs.AssetInputArgsStruct = {
    assertionId: assertionId,
    size: 1000,
    triplesNumber: 10,
    chunksNumber: 10,
    epochsNumber: 5,
    tokenAmount: 250,
    scoreFunctionId: 1,
    immutable_: false,
  };

  async function deployContentAssetFixture(): Promise<ContentAssetFixture> {
    await hre.deployments.fixture(['ContentAsset']);
    const accounts = await hre.ethers.getSigners();
    const ContentAsset = await hre.ethers.getContract<ContentAsset>('ContentAsset');
    const ContentAssetStorage = await hre.ethers.getContract<ContentAssetStorage>('ContentAssetStorage');
    const ServiceAgreementV1 = await hre.ethers.getContract<ServiceAgreementV1>('ServiceAgreementV1');
    const ERC20Token = await hre.ethers.getContract<ERC20Token>('ERC20Token');

    return { accounts, ContentAsset, ContentAssetStorage, ServiceAgreementV1, ERC20Token };
  }

  beforeEach(async () => {
    ({ accounts, ContentAsset, ContentAssetStorage, ServiceAgreementV1, ERC20Token } = await loadFixture(
      deployContentAssetFixture,
    ));
  });

  it('The contract is named "ContentAsset"', async function () {
    expect(await ContentAsset.name()).to.equal('ContentAsset');
  });

  it('The contract is version "1.0.0"', async function () {
    expect(await ContentAsset.version()).to.equal('1.0.0');
  });

  it('Create an asset, send 0 assertionId, expect to fail', async () => {
    assetInputStruct.assertionId = ZERO_BYTES32;
    await expect(ContentAsset.createAsset(assetInputStruct)).to.be.revertedWith('Assertion ID cannot be empty');
    assetInputStruct.assertionId = assertionId;
  });

  it('Create an asset, send size 0, expect to fail', async () => {
    assetInputStruct.size = 0;
    await expect(ContentAsset.createAsset(assetInputStruct)).to.be.revertedWith('Size cannot be 0');
    assetInputStruct.size = 1000;
  });

  it('Create an asset, send 0 epochs number, expect to fail', async () => {
    assetInputStruct.epochsNumber = 0;
    await expect(ContentAsset.createAsset(assetInputStruct)).to.be.revertedWithCustomError(
      ServiceAgreementV1,
      'ZeroEpochsNumber',
    );
    assetInputStruct.epochsNumber = 5;
  });

  it('Create an asset, send 0 token amount, expect to fail', async () => {
    assetInputStruct.tokenAmount = 0;
    await expect(ContentAsset.createAsset(assetInputStruct)).to.be.revertedWithCustomError(
      ServiceAgreementV1,
      'ZeroTokenAmount',
    );
    assetInputStruct.tokenAmount = 250;
  });

  it('Create an asset, expect asset created', async () => {
    await ERC20Token.mint(accounts[0].address, 1000000000000000);
    await ERC20Token.increaseAllowance(ServiceAgreementV1.address, assetInputStruct.tokenAmount);

    await expect(ContentAsset.createAsset(assetInputStruct)).to.emit(ContentAsset, 'AssetMinted');
  });

  it('Get an non existing asset, expect 0 returned', async () => {
    expect(await ContentAssetStorage.getAssertionIds(nonExistingTokenId)).to.deep.equal([]);
  });

  it('Get an existing asset, expect asset returned', async () => {
    await ERC20Token.mint(accounts[0].address, 1000000000000000);
    await ERC20Token.increaseAllowance(ServiceAgreementV1.address, assetInputStruct.tokenAmount);
    const receipt = await (await ContentAsset.createAsset(assetInputStruct)).wait();
    const tokenId = receipt.logs[0].topics[3];

    expect(await ContentAssetStorage.ownerOf(tokenId)).to.equal(accounts[0].address);

    const assertionIds = await ContentAssetStorage.getAssertionIds(tokenId);
    expect(assertionIds[0]).to.equal(assetInputStruct.assertionId);
  });
});