import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import hre from 'hardhat';

import {
  ContentAsset,
  ContentAssetStorage,
  Hub,
  ParametersStorage,
  ServiceAgreementStorageProxy,
  ServiceAgreementV1,
  Token,
} from '../typechain';
import { ContentAssetStructs } from '../typechain/contracts/assets/ContentAsset';
import { ZERO_BYTES32 } from './helpers/constants';

type ContentAssetFixture = {
  accounts: SignerWithAddress[];
  ParametersStorage: ParametersStorage;
  ContentAsset: ContentAsset;
  ContentAssetStorage: ContentAssetStorage;
  ServiceAgreementV1: ServiceAgreementV1;
  Token: Token;
};

describe('ContentAsset contract', function () {
  let accounts: SignerWithAddress[];
  let ParametersStorage: ParametersStorage;
  let ContentAsset: ContentAsset;
  let ContentAssetStorage: ContentAssetStorage;
  let ServiceAgreementV1: ServiceAgreementV1;
  let Token: Token;
  const nonExistingTokenId = 99;
  const assertionId = '0x8cc2117b68bcbb1535205d517cb42ef45f25838add571fce4cfb7de7bd617943';
  const assertionId1 = '0x8cc2117b68bcbb1535205d517cb42ef45f25838add571fce4cfb7de7bd289172';
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
  const assetUpdateArgs = {
    assertionId: assertionId1,
    size: 2000,
    triplesNumber: 20,
    chunksNumber: 20,
    tokenAmount: hre.ethers.utils.parseEther('500'),
  };

  async function createAsset(): Promise<string> {
    await Token.increaseAllowance(ServiceAgreementV1.address, assetInputStruct.tokenAmount);
    const receipt = await (await ContentAsset.createAsset(assetInputStruct)).wait();
    const tokenId = receipt.logs[0].topics[3];
    return tokenId;
  }

  async function updateAsset(tokenId: string) {
    await Token.increaseAllowance(ServiceAgreementV1.address, assetUpdateArgs.tokenAmount);
    await ContentAsset.updateAssetState(
      tokenId,
      assetUpdateArgs.assertionId,
      assetUpdateArgs.size,
      assetUpdateArgs.triplesNumber,
      assetUpdateArgs.chunksNumber,
      assetUpdateArgs.tokenAmount,
    );
  }

  async function deployContentAssetFixture(): Promise<ContentAssetFixture> {
    await hre.deployments.fixture(['ContentAsset']);
    const accounts = await hre.ethers.getSigners();
    const ParametersStorage = await hre.ethers.getContract<ParametersStorage>('ParametersStorage');
    const ContentAsset = await hre.ethers.getContract<ContentAsset>('ContentAsset');
    const ContentAssetStorage = await hre.ethers.getContract<ContentAssetStorage>('ContentAssetStorage');
    const ServiceAgreementV1 = await hre.ethers.getContract<ServiceAgreementV1>('ServiceAgreementV1');
    const Token = await hre.ethers.getContract<Token>('Token');

    return { accounts, ParametersStorage, ContentAsset, ContentAssetStorage, ServiceAgreementV1, Token };
  }

  beforeEach(async () => {
    ({ accounts, ParametersStorage, ContentAsset, ContentAssetStorage, ServiceAgreementV1, Token } = await loadFixture(
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
    await Token.increaseAllowance(ServiceAgreementV1.address, assetInputStruct.tokenAmount);

    await expect(ContentAsset.createAsset(assetInputStruct))
      .to.emit(ContentAsset, 'AssetMinted')
      .withArgs(ContentAssetStorage.address, 0, assetInputStruct.assertionId);
  });

  it('Get an assertion ids for non existing asset, expect nothing returned', async () => {
    expect(await ContentAssetStorage.getAssertionIds(nonExistingTokenId)).to.deep.equal([]);
  });

  it('Get an existing asset assertion identifiers, expect one assertion id returned', async () => {
    const tokenId = await createAsset();

    expect(await ContentAssetStorage.ownerOf(tokenId)).to.equal(accounts[0].address);

    const assertionIds = await ContentAssetStorage.getAssertionIds(tokenId);
    expect(assertionIds[0]).to.equal(assetInputStruct.assertionId);
  });

  it('Burn an asset during epoch 0 with failed commit phase, expect asset to be removed', async () => {
    const tokenId = await createAsset();
    const commitWindowDuration = (await ParametersStorage.epochLength())
      .mul(await ParametersStorage.commitWindowDurationPerc())
      .div(hre.ethers.BigNumber.from(100))
      .toNumber();
    await time.increase(commitWindowDuration);

    expect(await ContentAsset.burnAsset(tokenId))
      .to.emit(ContentAsset, 'AssetBurnt')
      .withArgs(ContentAssetStorage.address, tokenId, assetInputStruct.assertionId, assetInputStruct.tokenAmount);

    expect(await ContentAssetStorage.getAssertionIds(tokenId)).to.eql([]);
    expect(await ContentAssetStorage.assertionExists(assetInputStruct.assertionId)).to.equal(false);
  });

  it('Burn an asset during epoch using non-owner account, expect to be reverted', async () => {
    const tokenId = await createAsset();

    const ContentAssetWithNonOwnerSigner = ContentAsset.connect(accounts[1]);

    await expect(ContentAssetWithNonOwnerSigner.burnAsset(tokenId)).to.be.revertedWith(
      'Only asset owner can use this fn',
    );
  });

  it('Burn an asset during commit phase, expect to be reverted', async () => {
    const tokenId = await createAsset();

    await expect(ContentAsset.burnAsset(tokenId)).to.be.revertedWithCustomError(ContentAsset, 'CommitPhaseOngoing');
  });

  it('Burn an asset with succeeded commit phase, expect to be reverted', async () => {
    const tokenId = await createAsset();
    const keyword = hre.ethers.utils.solidityPack(
      ['address', 'bytes32'],
      [ContentAssetStorage.address, assetInputStruct.assertionId],
    );
    const agreementId = hre.ethers.utils.soliditySha256(
      ['address', 'uint256', 'bytes'],
      [ContentAssetStorage.address, tokenId, keyword],
    );
    const epochStateId = hre.ethers.utils.solidityKeccak256(['bytes32', 'uint16', 'uint256'], [agreementId, 0, 0]);
    const ServiceAgreementStorageProxy = await hre.ethers.getContract<ServiceAgreementStorageProxy>(
      'ServiceAgreementStorageProxy',
    );
    const r0 = await ParametersStorage.r0();

    const Hub = await hre.ethers.getContract<Hub>('Hub');
    await Hub.setContractAddress('Test', accounts[0].address);
    for (let i = 0; i < r0; i++) {
      await ServiceAgreementStorageProxy.incrementCommitsCount(epochStateId);
    }

    await expect(ContentAsset.burnAsset(tokenId)).to.be.revertedWithCustomError(ContentAsset, 'CommitPhaseSucceeded');
  });

  it('Burn an asset during epoch 1, expect ro be reverted', async () => {
    const tokenId = await createAsset();

    await time.increase((await ParametersStorage.epochLength()).toNumber());

    await expect(ContentAsset.burnAsset(tokenId)).to.be.revertedWithCustomError(
      ContentAsset,
      'FirstEpochHasAlreadyEnded',
    );
  });

  it('Burn an asset during unfinalized update, expect to be reverted', async () => {
    const tokenId = await createAsset();

    await updateAsset(tokenId);

    await expect(ContentAsset.burnAsset(tokenId)).to.be.revertedWithCustomError(ContentAsset, 'UpdateIsNotFinalized');
  });

  it('Update asset state, expect state updated', async () => {
    const tokenId = await createAsset();
    const newAssertionId = '0x1cc2117b68bcbb1535205d517cb42ef45f25838add571fce4cfb7de7bd6179eb';

    await Token.increaseAllowance(ServiceAgreementV1.address, assetInputStruct.tokenAmount);

    expect(
      await ContentAsset.updateAssetState(
        tokenId,
        newAssertionId,
        assetInputStruct.size,
        assetInputStruct.triplesNumber,
        assetInputStruct.chunksNumber,
        assetInputStruct.tokenAmount,
      ),
    )
      .to.emit(ContentAsset, 'AssetStateUpdated')
      .withArgs(ContentAssetStorage.address, tokenId, newAssertionId, assetInputStruct.tokenAmount);
  });

  it('Update asset state of immutable asset, expect to be reverted', async () => {
    const immutableAssetInputStruct = JSON.parse(JSON.stringify(assetInputStruct)) as typeof assetInputStruct;
    immutableAssetInputStruct.immutable_ = true;
    await Token.increaseAllowance(ServiceAgreementV1.address, immutableAssetInputStruct.tokenAmount);
    const receipt = await (await ContentAsset.createAsset(immutableAssetInputStruct)).wait();
    const tokenId = receipt.logs[0].topics[3];
    const newAssertionId = '0x1cc2117b68bcbb1535205d517cb42ef45f25838add571fce4cfb7de7bd6179eb';

    await Token.increaseAllowance(ServiceAgreementV1.address, immutableAssetInputStruct.tokenAmount);

    await expect(
      ContentAsset.updateAssetState(
        tokenId,
        newAssertionId,
        immutableAssetInputStruct.size,
        immutableAssetInputStruct.triplesNumber,
        immutableAssetInputStruct.chunksNumber,
        immutableAssetInputStruct.tokenAmount,
      ),
    ).to.be.revertedWith('Asset is immutable');
  });

  it('Update asset state using non-owner account, expect to be reverted', async () => {
    const tokenId = await createAsset();
    const newAssertionId = '0x1cc2117b68bcbb1535205d517cb42ef45f25838add571fce4cfb7de7bd6179eb';

    await Token.increaseAllowance(ServiceAgreementV1.address, assetInputStruct.tokenAmount);

    const ContentAssetWithNonOwnerSigner = ContentAsset.connect(accounts[1]);

    await expect(
      ContentAssetWithNonOwnerSigner.updateAssetState(
        tokenId,
        newAssertionId,
        assetInputStruct.size,
        assetInputStruct.triplesNumber,
        assetInputStruct.chunksNumber,
        assetInputStruct.tokenAmount,
      ),
    ).to.be.revertedWith('Only asset owner can use this fn');
  });

  it('Update asset state during pending update, expect to be reverted', async () => {
    const tokenId = await createAsset();
    await updateAsset(tokenId);

    const newAssertionId = '0x1cc2117b68bcbb1535205d517cb42ef45f25838add571fce4cfb7de7bd6179eb';

    await Token.increaseAllowance(ServiceAgreementV1.address, assetInputStruct.tokenAmount);

    await expect(
      ContentAsset.updateAssetState(
        tokenId,
        newAssertionId,
        assetInputStruct.size,
        assetInputStruct.triplesNumber,
        assetInputStruct.chunksNumber,
        assetInputStruct.tokenAmount,
      ),
    ).to.be.revertedWithCustomError(ContentAsset, 'UpdateIsNotFinalized');
  });

  it('Cancel asset state update after failed update commit phase, expect previous state to be active', async () => {
    const tokenId = await createAsset();
    await updateAsset(tokenId);
    await time.increase(await ParametersStorage.updateCommitWindowDuration());

    expect(ContentAsset.cancelAssetStateUpdate(tokenId))
      .to.emit(ContentAsset, 'AssetStateUpdateCanceled')
      .withArgs(ContentAssetStorage.address, tokenId, assetUpdateArgs.assertionId, assetUpdateArgs.tokenAmount);
  });

  it('Cancel asset state update using non-owner account, expect to be reverted', async () => {
    const tokenId = await createAsset();
    await updateAsset(tokenId);

    const ContentAssetWithNonOwnerSigner = ContentAsset.connect(accounts[1]);

    await expect(ContentAssetWithNonOwnerSigner.cancelAssetStateUpdate(tokenId)).to.be.revertedWith(
      'Only asset owner can use this fn',
    );
  });

  it('Cancel asset state update with no pending update, expect to be reverted', async () => {
    const tokenId = await createAsset();

    await expect(ContentAsset.cancelAssetStateUpdate(tokenId)).to.be.revertedWithCustomError(
      ContentAsset,
      'NoPendingUpdate',
    );
  });

  it('Cancel asset state update during update commit phase, expect to be reverted', async () => {
    const tokenId = await createAsset();
    await updateAsset(tokenId);

    await expect(ContentAsset.cancelAssetStateUpdate(tokenId)).to.be.revertedWithCustomError(
      ContentAsset,
      'PendingUpdateFinalization',
    );
  });

  it('Update asset storing period, expect storing period updated', async () => {
    const tokenId = await createAsset();
    const newEpochsNumber = Number(assetInputStruct.epochsNumber) + 1;

    await Token.increaseAllowance(ServiceAgreementV1.address, assetInputStruct.tokenAmount);

    expect(await ContentAsset.updateAssetStoringPeriod(tokenId, newEpochsNumber, assetInputStruct.tokenAmount))
      .to.emit(ContentAsset, 'AssetStoringPeriodExtended')
      .withArgs(ContentAssetStorage.address, tokenId, newEpochsNumber, assetInputStruct.tokenAmount);
  });

  it('Update asset storing period using non-owner account, expect to be reverted', async () => {
    const tokenId = await createAsset();
    const newEpochsNumber = Number(assetInputStruct.epochsNumber) + 1;

    await Token.increaseAllowance(ServiceAgreementV1.address, assetInputStruct.tokenAmount);

    const ContentAssetWithNonOwnerSigner = ContentAsset.connect(accounts[1]);

    await expect(
      ContentAssetWithNonOwnerSigner.updateAssetStoringPeriod(tokenId, newEpochsNumber, assetInputStruct.tokenAmount),
    ).to.be.revertedWith('Only asset owner can use this fn');
  });

  it('Increase asset token amount, expect token amount to be updated', async () => {
    const tokenId = await createAsset();
    const newTokenAmount = Number(assetInputStruct.tokenAmount) + 10;

    await Token.increaseAllowance(ServiceAgreementV1.address, newTokenAmount);

    expect(await ContentAsset.increaseAssetTokenAmount(tokenId, newTokenAmount))
      .to.emit(ContentAsset, 'AssetPaymentIncreased')
      .withArgs(ContentAssetStorage.address, tokenId, newTokenAmount);
  });

  it('Increase asset token amount using non-owner account, expect to be reverted', async () => {
    const tokenId = await createAsset();
    const newTokenAmount = Number(assetInputStruct.tokenAmount) + 10;

    await Token.increaseAllowance(ServiceAgreementV1.address, newTokenAmount);

    const ContentAssetWithNonOwnerSigner = ContentAsset.connect(accounts[1]);

    await expect(ContentAssetWithNonOwnerSigner.increaseAssetTokenAmount(tokenId, newTokenAmount)).to.be.revertedWith(
      'Only asset owner can use this fn',
    );
  });

  it('Increase asset update token amount, expect update token amount to be updated', async () => {
    const tokenId = await createAsset();
    await updateAsset(tokenId);
    const newUpdateTokenAmount = assetUpdateArgs.tokenAmount.add(hre.ethers.utils.parseEther('10'));

    await Token.increaseAllowance(ServiceAgreementV1.address, newUpdateTokenAmount);

    expect(await ContentAsset.increaseAssetUpdateTokenAmount(tokenId, newUpdateTokenAmount))
      .to.emit(ContentAsset, 'AssetUpdatePaymentIncreased')
      .withArgs(ContentAssetStorage.address, tokenId, newUpdateTokenAmount);
  });

  it('Increase asset update token amount using non-owner account, expect to be reverted', async () => {
    const tokenId = await createAsset();
    await updateAsset(tokenId);
    const newUpdateTokenAmount = assetUpdateArgs.tokenAmount.add(hre.ethers.utils.parseEther('10'));

    await Token.increaseAllowance(ServiceAgreementV1.address, newUpdateTokenAmount);

    const ContentAssetWithNonOwnerSigner = ContentAsset.connect(accounts[1]);

    await expect(
      ContentAssetWithNonOwnerSigner.increaseAssetUpdateTokenAmount(tokenId, newUpdateTokenAmount),
    ).to.be.revertedWith('Only asset owner can use this fn');
  });

  it('Increase asset update token amount without pending update, expect to be reverted', async () => {
    const tokenId = await createAsset();
    const newUpdateTokenAmount = assetUpdateArgs.tokenAmount.add(hre.ethers.utils.parseEther('10'));

    await Token.increaseAllowance(ServiceAgreementV1.address, newUpdateTokenAmount);

    await expect(
      ContentAsset.increaseAssetUpdateTokenAmount(tokenId, newUpdateTokenAmount),
    ).to.be.revertedWithCustomError(ContentAsset, 'NoPendingUpdate');
  });
});
