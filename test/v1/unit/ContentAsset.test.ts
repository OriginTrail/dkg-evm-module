import { randomBytes } from 'crypto';

import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre from 'hardhat';
import { SignerWithAddress } from 'hardhat-deploy-ethers/signers';

import {
  ContentAsset,
  ContentAssetStorage,
  HubController,
  ParametersStorage,
  ServiceAgreementStorageProxy,
  ServiceAgreementV1,
  Token,
} from '../../../typechain';
import { ContentAssetStructs } from '../../../typechain/contracts/v1/assets/ContentAsset';
import { ZERO_BYTES32 } from '../../helpers/constants';

type ContentAssetFixture = {
  accounts: SignerWithAddress[];
  ParametersStorage: ParametersStorage;
  ContentAsset: ContentAsset;
  ContentAssetStorage: ContentAssetStorage;
  ServiceAgreementV1: ServiceAgreementV1;
  Token: Token;
};

describe('@v1 @unit ContentAsset contract', function () {
  let accounts: SignerWithAddress[];
  let ParametersStorage: ParametersStorage;
  let ContentAsset: ContentAsset;
  let ContentAssetStorage: ContentAssetStorage;
  let ServiceAgreementV1: ServiceAgreementV1;
  let Token: Token;

  const nonExistingTokenId = 99;
  const assertionId = '0x' + randomBytes(32).toString('hex');
  const assertionId1 = '0x' + randomBytes(32).toString('hex');
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

  async function createAsset(): Promise<number> {
    await Token.increaseAllowance(ServiceAgreementV1.address, assetInputStruct.tokenAmount);
    const receipt = await (await ContentAsset.createAsset(assetInputStruct)).wait();
    const tokenId = Number(receipt.logs[0].topics[3]);
    return tokenId;
  }

  async function updateAsset(tokenId: number) {
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
    accounts = await hre.ethers.getSigners();
    ParametersStorage = await hre.ethers.getContract<ParametersStorage>('ParametersStorage');
    ContentAsset = await hre.ethers.getContract<ContentAsset>('ContentAsset');
    ContentAssetStorage = await hre.ethers.getContract<ContentAssetStorage>('ContentAssetStorage');
    ServiceAgreementV1 = await hre.ethers.getContract<ServiceAgreementV1>('ServiceAgreementV1');
    Token = await hre.ethers.getContract<Token>('Token');
    const HubController = await hre.ethers.getContract<HubController>('HubController');
    await HubController.setContractAddress('HubOwner', accounts[0].address);

    return { accounts, ParametersStorage, ContentAsset, ContentAssetStorage, ServiceAgreementV1, Token };
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ accounts, ParametersStorage, ContentAsset, ContentAssetStorage, ServiceAgreementV1, Token } = await loadFixture(
      deployContentAssetFixture,
    ));
  });

  it('The contract is named "ContentAsset"', async () => {
    expect(await ContentAsset.name()).to.equal('ContentAsset');
  });

  it('The contract is version "1.0.4"', async () => {
    expect(await ContentAsset.version()).to.equal('1.0.4');
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

    await expect(ContentAsset.burnAsset(tokenId))
      .to.emit(ContentAsset, 'AssetBurnt')
      .withArgs(ContentAssetStorage.address, tokenId, assetInputStruct.tokenAmount);

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

    await expect(
      ContentAsset.updateAssetState(
        tokenId,
        newAssertionId,
        assetInputStruct.size,
        assetInputStruct.triplesNumber,
        assetInputStruct.chunksNumber,
        assetInputStruct.tokenAmount,
      ),
    )
      .to.emit(ContentAsset, 'AssetStateUpdated')
      .withArgs(ContentAssetStorage.address, tokenId, 1, assetInputStruct.tokenAmount);
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

    const keyword = hre.ethers.utils.solidityPack(
      ['address', 'bytes32'],
      [ContentAssetStorage.address, assetInputStruct.assertionId],
    );

    const agreementId = hre.ethers.utils.soliditySha256(
      ['address', 'uint256', 'bytes'],
      [ContentAssetStorage.address, tokenId, keyword],
    );
    const epochStateId = hre.ethers.utils.solidityKeccak256(['bytes32', 'uint16', 'uint256'], [agreementId, 0, 1]);
    const ServiceAgreementStorageProxy = await hre.ethers.getContract<ServiceAgreementStorageProxy>(
      'ServiceAgreementStorageProxy',
    );

    await ServiceAgreementStorageProxy.incrementCommitsCount(epochStateId);

    await time.increase(await ParametersStorage.updateCommitWindowDuration());

    await expect(ContentAsset.cancelAssetStateUpdate(tokenId))
      .to.emit(ContentAsset, 'AssetStateUpdateCanceled')
      .withArgs(ContentAssetStorage.address, tokenId, 1, assetUpdateArgs.tokenAmount);
    const commitCount = await ServiceAgreementStorageProxy.getCommitsCount(epochStateId);
    const stateId = hre.ethers.utils.soliditySha256(['bytes32', 'uint256'], [agreementId, 1]);
    const updateCommitDeadline = await ServiceAgreementStorageProxy.getUpdateCommitsDeadline(stateId);

    await expect(commitCount).to.be.equal(0);
    await expect(updateCommitDeadline).to.be.equal(0);
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
    const additionalEpochsNumber = Number(assetInputStruct.epochsNumber) + 1;

    await Token.increaseAllowance(ServiceAgreementV1.address, assetInputStruct.tokenAmount);

    await expect(ContentAsset.extendAssetStoringPeriod(tokenId, additionalEpochsNumber, assetInputStruct.tokenAmount))
      .to.emit(ContentAsset, 'AssetStoringPeriodExtended')
      .withArgs(ContentAssetStorage.address, tokenId, additionalEpochsNumber, assetInputStruct.tokenAmount);
  });

  it('Update asset storing period using non-owner account, expect to be reverted', async () => {
    const tokenId = await createAsset();
    const additionalEpochsNumber = Number(assetInputStruct.epochsNumber) + 1;

    await Token.increaseAllowance(ServiceAgreementV1.address, assetInputStruct.tokenAmount);

    const ContentAssetWithNonOwnerSigner = ContentAsset.connect(accounts[1]);

    await expect(
      ContentAssetWithNonOwnerSigner.extendAssetStoringPeriod(
        tokenId,
        additionalEpochsNumber,
        assetInputStruct.tokenAmount,
      ),
    ).to.be.revertedWith('Only asset owner can use this fn');
  });

  it('Increase asset token amount, expect token amount to be updated', async () => {
    const tokenId = await createAsset();
    const additionalTokenAmount = hre.ethers.utils.parseEther('10');

    await Token.increaseAllowance(ServiceAgreementV1.address, additionalTokenAmount);

    await expect(ContentAsset.increaseAssetTokenAmount(tokenId, additionalTokenAmount))
      .to.emit(ContentAsset, 'AssetPaymentIncreased')
      .withArgs(ContentAssetStorage.address, tokenId, additionalTokenAmount);
  });

  it('Increase asset token amount using non-owner account, expect to be reverted', async () => {
    const tokenId = await createAsset();
    const additionalTokenAmount = hre.ethers.utils.parseEther('10');

    await Token.increaseAllowance(ServiceAgreementV1.address, additionalTokenAmount);

    const ContentAssetWithNonOwnerSigner = ContentAsset.connect(accounts[1]);

    await expect(
      ContentAssetWithNonOwnerSigner.increaseAssetTokenAmount(tokenId, additionalTokenAmount),
    ).to.be.revertedWith('Only asset owner can use this fn');
  });

  it('Increase asset update token amount, expect update token amount to be updated', async () => {
    const tokenId = await createAsset();
    await updateAsset(tokenId);
    const additionalUpdateTokenAmount = hre.ethers.utils.parseEther('10');

    await Token.increaseAllowance(ServiceAgreementV1.address, additionalUpdateTokenAmount);

    await expect(ContentAsset.increaseAssetUpdateTokenAmount(tokenId, additionalUpdateTokenAmount))
      .to.emit(ContentAsset, 'AssetUpdatePaymentIncreased')
      .withArgs(ContentAssetStorage.address, tokenId, additionalUpdateTokenAmount);
  });

  it('Increase asset update token amount using non-owner account, expect to be reverted', async () => {
    const tokenId = await createAsset();
    await updateAsset(tokenId);
    const additionalUpdateTokenAmount = hre.ethers.utils.parseEther('10');

    await Token.increaseAllowance(ServiceAgreementV1.address, additionalUpdateTokenAmount);

    const ContentAssetWithNonOwnerSigner = ContentAsset.connect(accounts[1]);

    await expect(
      ContentAssetWithNonOwnerSigner.increaseAssetUpdateTokenAmount(tokenId, additionalUpdateTokenAmount),
    ).to.be.revertedWith('Only asset owner can use this fn');
  });

  it('Increase asset update token amount without pending update, expect to be reverted', async () => {
    const tokenId = await createAsset();
    const additionalUpdateTokenAmount = hre.ethers.utils.parseEther('10');

    await Token.increaseAllowance(ServiceAgreementV1.address, additionalUpdateTokenAmount);

    await expect(
      ContentAsset.increaseAssetUpdateTokenAmount(tokenId, additionalUpdateTokenAmount),
    ).to.be.revertedWithCustomError(ContentAsset, 'NoPendingUpdate');
  });
});
