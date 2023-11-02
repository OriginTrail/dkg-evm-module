import { randomBytes } from 'crypto';

import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BytesLike } from 'ethers';
import hre from 'hardhat';

import {
  AssertionStorage,
  ContentAsset,
  ContentAssetStorage,
  Hub,
  HubController,
  ParametersStorage,
  Profile,
  ServiceAgreementStorageProxy,
  ServiceAgreementV1,
  Staking,
  Token,
  UnfinalizedStateStorage,
} from '../../../typechain';
import { ContentAssetStructs } from '../../../typechain/contracts/v1/assets/ContentAsset';
import { CommitManagerV1U1, ServiceAgreementStructsV1 } from '../../../typechain/contracts/v1/CommitManagerV1U1';
import { ZERO_ADDRESS, ZERO_BYTES32 } from '../../helpers/constants';

type ContentAssetFixture = {
  accounts: SignerWithAddress[];
  AssertionStorage: AssertionStorage;
  ParametersStorage: ParametersStorage;
  CommitManagerV1U1: CommitManagerV1U1;
  ContentAsset: ContentAsset;
  ContentAssetStorage: ContentAssetStorage;
  ServiceAgreementStorageProxy: ServiceAgreementStorageProxy;
  ServiceAgreementV1: ServiceAgreementV1;
  Token: Token;
  Profile: Profile;
  Staking: Staking;
  UnfinalizedStateStorage: UnfinalizedStateStorage;
};

describe('@integration ContentAsset contract', function () {
  let accounts: SignerWithAddress[];
  let AssertionStorage: AssertionStorage;
  let ParametersStorage: ParametersStorage;
  let CommitManagerV1U1: CommitManagerV1U1;
  let ContentAsset: ContentAsset;
  let ContentAssetStorage: ContentAssetStorage;
  let ServiceAgreementStorageProxy: ServiceAgreementStorageProxy;
  let ServiceAgreementV1: ServiceAgreementV1;
  let Token: Token;
  let Profile: Profile;
  let Staking: Staking;
  let UnfinalizedStateStorage: UnfinalizedStateStorage;
  let Hub: Hub;
  let commitInputArgs: ServiceAgreementStructsV1.CommitInputArgsStruct;

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

  async function createAsset(): Promise<{ tokenId: number; keyword: BytesLike; agreementId: BytesLike }> {
    await Token.increaseAllowance(ServiceAgreementV1.address, assetInputStruct.tokenAmount);
    const receipt = await (await ContentAsset.createAsset(assetInputStruct)).wait();
    const tokenId = Number(receipt.logs[0].topics[3]);

    const keyword = hre.ethers.utils.solidityPack(
      ['address', 'bytes32'],
      [ContentAssetStorage.address, assetInputStruct.assertionId],
    );
    const agreementId = hre.ethers.utils.soliditySha256(
      ['address', 'uint256', 'bytes'],
      [ContentAssetStorage.address, tokenId, keyword],
    );
    return { tokenId, keyword, agreementId };
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

  async function createProfile(operational: SignerWithAddress, admin: SignerWithAddress): Promise<number> {
    const OperationalProfile = Profile.connect(operational);

    const receipt = await (
      await OperationalProfile.createProfile(
        admin.address,
        '0x' + randomBytes(32).toString('hex'),
        randomBytes(3).toString('hex'),
        randomBytes(2).toString('hex'),
      )
    ).wait();
    const identityId = Number(receipt.logs[0].topics[1]);

    await OperationalProfile.setAsk(identityId, hre.ethers.utils.parseEther('0.25'));

    const stakeAmount = hre.ethers.utils.parseEther('50000');
    await Token.connect(admin).increaseAllowance(Staking.address, stakeAmount);
    await Staking.connect(admin)['addStake(uint72,uint96)'](identityId, stakeAmount);

    return identityId;
  }

  async function deployContentAssetFixture(): Promise<ContentAssetFixture> {
    await hre.deployments.fixture(['ContentAsset', 'CommitManagerV1U1', 'Profile']);
    accounts = await hre.ethers.getSigners();
    AssertionStorage = await hre.ethers.getContract<AssertionStorage>('AssertionStorage');
    ParametersStorage = await hre.ethers.getContract<ParametersStorage>('ParametersStorage');
    CommitManagerV1U1 = await hre.ethers.getContract<CommitManagerV1U1>('CommitManagerV1U1');
    ContentAsset = await hre.ethers.getContract<ContentAsset>('ContentAsset');
    ContentAssetStorage = await hre.ethers.getContract<ContentAssetStorage>('ContentAssetStorage');
    ServiceAgreementStorageProxy = await hre.ethers.getContract<ServiceAgreementStorageProxy>(
      'ServiceAgreementStorageProxy',
    );
    ServiceAgreementV1 = await hre.ethers.getContract<ServiceAgreementV1>('ServiceAgreementV1');
    Token = await hre.ethers.getContract<Token>('Token');
    Profile = await hre.ethers.getContract<Profile>('Profile');
    Staking = await hre.ethers.getContract<Staking>('Staking');
    UnfinalizedStateStorage = await hre.ethers.getContract<UnfinalizedStateStorage>('UnfinalizedStateStorage');
    Hub = await hre.ethers.getContract<Hub>('Hub');
    const HubController = await hre.ethers.getContract<HubController>('HubController');
    await HubController.setContractAddress('HubOwner', accounts[0].address);

    return {
      accounts,
      AssertionStorage,
      ParametersStorage,
      CommitManagerV1U1,
      ContentAsset,
      ContentAssetStorage,
      ServiceAgreementStorageProxy,
      ServiceAgreementV1,
      Token,
      Profile,
      Staking,
      UnfinalizedStateStorage,
    };
  }

  beforeEach(async () => {
    ({
      accounts,
      ParametersStorage,
      ContentAsset,
      ContentAssetStorage,
      ServiceAgreementStorageProxy,
      ServiceAgreementV1,
      Token,
    } = await loadFixture(deployContentAssetFixture));
  });

  it('Create an asset and verify all data', async () => {
    const serviceAgreementStorageV1Address = await Hub.getContractAddress('ServiceAgreementStorageV1');
    const initialBalance = await Token.balanceOf(serviceAgreementStorageV1Address);
    const initialOwnerBalance = await Token.balanceOf(accounts[0].address);

    const { tokenId, agreementId } = await createAsset();

    const resultBalance = await Token.balanceOf(serviceAgreementStorageV1Address);
    const resultOwnerBalance = await Token.balanceOf(accounts[0].address);

    expect(resultBalance.sub(initialBalance)).to.be.equal(assetInputStruct.tokenAmount);
    expect(initialOwnerBalance.sub(resultOwnerBalance)).to.be.equal(assetInputStruct.tokenAmount);

    const blockNumber = await hre.ethers.provider.getBlockNumber();
    const blockTimestamp = (await hre.ethers.provider.getBlock(blockNumber)).timestamp;

    expect(await ContentAssetStorage.ownerOf(tokenId)).to.be.equal(accounts[0].address);
    expect(await AssertionStorage.getAssertion(assetInputStruct.assertionId)).to.deep.equal([
      blockTimestamp,
      assetInputStruct.size,
      assetInputStruct.triplesNumber,
      assetInputStruct.chunksNumber,
    ]);
    expect(await ContentAssetStorage.getAssertionIssuer(tokenId, assetInputStruct.assertionId, 0)).to.be.equal(
      accounts[0].address,
    );
    expect(await ContentAssetStorage.isMutable(tokenId)).to.be.eql(!assetInputStruct.immutable_);
    expect(await ContentAssetStorage.getAssertionIds(tokenId)).to.deep.equal([assetInputStruct.assertionId]);
    expect(await ServiceAgreementStorageProxy.getAgreementStartTime(agreementId)).to.be.equal(blockTimestamp);
    expect(await ServiceAgreementStorageProxy.getAgreementEpochsNumber(agreementId)).to.be.equal(
      assetInputStruct.epochsNumber,
    );
    expect(await ServiceAgreementStorageProxy.getAgreementEpochLength(agreementId)).to.be.equal(
      await ParametersStorage.epochLength(),
    );
    expect(await ServiceAgreementStorageProxy.getAgreementTokenAmount(agreementId)).to.be.equal(
      assetInputStruct.tokenAmount,
    );
    expect(await ServiceAgreementStorageProxy.getAgreementUpdateTokenAmount(agreementId)).to.be.equal(0);
    expect(await ServiceAgreementStorageProxy.getAgreementScoreFunctionId(agreementId)).to.be.equal(
      assetInputStruct.scoreFunctionId,
    );
  });

  it('Burn an asset during epoch 0 with failed commit phase and verify all data', async () => {
    const { tokenId, agreementId } = await createAsset();
    const commitWindowDuration = (await ParametersStorage.epochLength())
      .mul(await ParametersStorage.commitWindowDurationPerc())
      .div(hre.ethers.BigNumber.from(100))
      .toNumber();
    await time.increase(commitWindowDuration);

    const serviceAgreementStorageV1Address = await Hub.getContractAddress('ServiceAgreementStorageV1');
    const initialBalance = await Token.balanceOf(serviceAgreementStorageV1Address);
    const initialOwnerBalance = await Token.balanceOf(accounts[0].address);

    expect(await ContentAsset.burnAsset(tokenId))
      .to.emit(ContentAsset, 'AssetBurnt')
      .withArgs(ContentAssetStorage.address, tokenId, assetInputStruct.assertionId, assetInputStruct.tokenAmount);

    const resultBalance = await Token.balanceOf(serviceAgreementStorageV1Address);
    const resultOwnerBalance = await Token.balanceOf(accounts[0].address);

    expect(initialBalance.sub(resultBalance)).to.be.equal(assetInputStruct.tokenAmount);
    expect(resultOwnerBalance.sub(initialOwnerBalance)).to.be.equal(assetInputStruct.tokenAmount);

    expect(await ContentAssetStorage.getAssertionIssuer(tokenId, assetInputStruct.assertionId, 0)).to.be.equal(
      ZERO_ADDRESS,
    );
    expect(await ContentAssetStorage.getAssertionIds(tokenId)).to.eql([]);
    expect(await ContentAssetStorage.assertionExists(assetInputStruct.assertionId)).to.equal(false);
    await expect(ContentAssetStorage.ownerOf(tokenId)).to.be.revertedWith('ERC721: invalid token ID');
    expect(await ServiceAgreementStorageProxy.getAgreementStartTime(agreementId)).to.be.equal(0);
    expect(await ServiceAgreementStorageProxy.getAgreementEpochsNumber(agreementId)).to.be.equal(0);
    expect(await ServiceAgreementStorageProxy.getAgreementEpochLength(agreementId)).to.be.equal(0);
    expect(await ServiceAgreementStorageProxy.getAgreementTokenAmount(agreementId)).to.be.equal(0);
    expect(await ServiceAgreementStorageProxy.getAgreementUpdateTokenAmount(agreementId)).to.be.equal(0);
    expect(await ServiceAgreementStorageProxy.getAgreementScoreFunctionId(agreementId)).to.be.equal(0);
  });

  it('Update asset state and verify all data (unfinalized state)', async () => {
    const { tokenId, agreementId } = await createAsset();

    let blockNumber = await hre.ethers.provider.getBlockNumber();
    const createBlockTimestamp = (await hre.ethers.provider.getBlock(blockNumber)).timestamp;

    await Token.increaseAllowance(ServiceAgreementV1.address, assetUpdateArgs.tokenAmount);

    const serviceAgreementStorageV1U1Address = await Hub.getContractAddress('ServiceAgreementStorageV1U1');
    const initialBalance = await Token.balanceOf(serviceAgreementStorageV1U1Address);
    const initialOwnerBalance = await Token.balanceOf(accounts[0].address);

    await updateAsset(tokenId);

    const resultBalance = await Token.balanceOf(serviceAgreementStorageV1U1Address);
    const resultOwnerBalance = await Token.balanceOf(accounts[0].address);

    expect(resultBalance.sub(initialBalance)).to.be.equal(assetUpdateArgs.tokenAmount);
    expect(initialOwnerBalance.sub(resultOwnerBalance)).to.be.equal(assetUpdateArgs.tokenAmount);

    blockNumber = await hre.ethers.provider.getBlockNumber();
    const updateBlockTimestamp = (await hre.ethers.provider.getBlock(blockNumber)).timestamp;

    expect(await ContentAssetStorage.ownerOf(tokenId)).to.be.equal(accounts[0].address);
    expect(await UnfinalizedStateStorage.getUnfinalizedState(tokenId)).to.be.equal(assetUpdateArgs.assertionId);
    expect(await AssertionStorage.getAssertion(assetUpdateArgs.assertionId)).to.deep.equal([
      updateBlockTimestamp,
      assetUpdateArgs.size,
      assetUpdateArgs.triplesNumber,
      assetUpdateArgs.chunksNumber,
    ]);
    expect(await ContentAssetStorage.getAssertionIssuer(tokenId, assetUpdateArgs.assertionId, 1)).to.be.equal(
      ZERO_ADDRESS,
    );
    expect(await UnfinalizedStateStorage.getIssuer(tokenId)).to.be.equal(accounts[0].address);
    expect(await ContentAssetStorage.getAssertionIds(tokenId)).to.deep.equal([assetInputStruct.assertionId]);
    expect(await ServiceAgreementStorageProxy.getAgreementStartTime(agreementId)).to.be.equal(createBlockTimestamp);
    expect(await ServiceAgreementStorageProxy.getAgreementEpochsNumber(agreementId)).to.be.equal(
      assetInputStruct.epochsNumber,
    );
    expect(await ServiceAgreementStorageProxy.getAgreementEpochLength(agreementId)).to.be.equal(
      await ParametersStorage.epochLength(),
    );
    expect(await ServiceAgreementStorageProxy.getAgreementTokenAmount(agreementId)).to.be.equal(
      assetInputStruct.tokenAmount,
    );
    expect(await ServiceAgreementStorageProxy.getAgreementUpdateTokenAmount(agreementId)).to.be.equal(
      assetUpdateArgs.tokenAmount,
    );
    expect(await ServiceAgreementStorageProxy.getAgreementScoreFunctionId(agreementId)).to.be.equal(
      assetInputStruct.scoreFunctionId,
    );
  });

  it('Update asset state and verify all data (finalized state)', async () => {
    const finalizationRequirement = await ParametersStorage.finalizationCommitsNumber();

    const identityIds = [];
    for (let i = 0; i < finalizationRequirement; i++) {
      identityIds.push(await createProfile(accounts[i], accounts[accounts.length - 1]));
    }

    const { tokenId, keyword, agreementId } = await createAsset();

    let blockNumber = await hre.ethers.provider.getBlockNumber();
    const createBlockTimestamp = (await hre.ethers.provider.getBlock(blockNumber)).timestamp;

    await Token.increaseAllowance(ServiceAgreementV1.address, assetUpdateArgs.tokenAmount);

    await updateAsset(tokenId);

    blockNumber = await hre.ethers.provider.getBlockNumber();
    const updateBlockTimestamp = (await hre.ethers.provider.getBlock(blockNumber)).timestamp;

    commitInputArgs = {
      assetContract: ContentAssetStorage.address,
      tokenId: tokenId,
      keyword: keyword,
      hashFunctionId: 1,
      epoch: 0,
    };

    for (let i = 0; i < finalizationRequirement; i++) {
      await CommitManagerV1U1.connect(accounts[i]).submitUpdateCommit(commitInputArgs);
    }

    expect(await ContentAssetStorage.ownerOf(tokenId)).to.be.equal(accounts[0].address);
    expect(await UnfinalizedStateStorage.getUnfinalizedState(tokenId)).to.be.equal(ZERO_BYTES32);
    expect(await AssertionStorage.getAssertion(assetUpdateArgs.assertionId)).to.deep.equal([
      updateBlockTimestamp,
      assetUpdateArgs.size,
      assetUpdateArgs.triplesNumber,
      assetUpdateArgs.chunksNumber,
    ]);
    expect(await ContentAssetStorage.getAssertionIssuer(tokenId, assetUpdateArgs.assertionId, 1)).to.be.equal(
      accounts[0].address,
    );
    expect(await UnfinalizedStateStorage.getIssuer(tokenId)).to.be.equal(ZERO_ADDRESS);
    expect(await ContentAssetStorage.getAssertionIds(tokenId)).to.deep.equal([
      assetInputStruct.assertionId,
      assetUpdateArgs.assertionId,
    ]);
    expect(await ServiceAgreementStorageProxy.getAgreementStartTime(agreementId)).to.be.equal(createBlockTimestamp);
    expect(await ServiceAgreementStorageProxy.getAgreementEpochsNumber(agreementId)).to.be.equal(
      assetInputStruct.epochsNumber,
    );
    expect(await ServiceAgreementStorageProxy.getAgreementEpochLength(agreementId)).to.be.equal(
      await ParametersStorage.epochLength(),
    );
    expect(await ServiceAgreementStorageProxy.getAgreementTokenAmount(agreementId)).to.be.equal(
      hre.ethers.BigNumber.from(assetInputStruct.tokenAmount).add(assetUpdateArgs.tokenAmount),
    );
    expect(await ServiceAgreementStorageProxy.getAgreementUpdateTokenAmount(agreementId)).to.be.equal(0);
    expect(await ServiceAgreementStorageProxy.getAgreementScoreFunctionId(agreementId)).to.be.equal(
      assetInputStruct.scoreFunctionId,
    );
  });

  it('Cancel asset state update after failed update commit phase, expect previous state to be active', async () => {
    const { tokenId, agreementId } = await createAsset();

    let blockNumber = await hre.ethers.provider.getBlockNumber();
    const createBlockTimestamp = (await hre.ethers.provider.getBlock(blockNumber)).timestamp;

    await updateAsset(tokenId);

    blockNumber = await hre.ethers.provider.getBlockNumber();
    const updateBlockTimestamp = (await hre.ethers.provider.getBlock(blockNumber)).timestamp;

    await time.increase(await ParametersStorage.updateCommitWindowDuration());

    const serviceAgreementStorageV1U1Address = await Hub.getContractAddress('ServiceAgreementStorageV1U1');
    const initialBalance = await Token.balanceOf(serviceAgreementStorageV1U1Address);
    const initialOwnerBalance = await Token.balanceOf(accounts[0].address);

    expect(await ContentAsset.cancelAssetStateUpdate(tokenId))
      .to.emit(ContentAsset, 'AssetStateUpdateCanceled')
      .withArgs(ContentAssetStorage.address, tokenId, assetUpdateArgs.assertionId, assetUpdateArgs.tokenAmount);

    const resultBalance = await Token.balanceOf(serviceAgreementStorageV1U1Address);
    const resultOwnerBalance = await Token.balanceOf(accounts[0].address);

    expect(initialBalance.sub(resultBalance)).to.be.equal(assetUpdateArgs.tokenAmount);
    expect(resultOwnerBalance.sub(initialOwnerBalance)).to.be.equal(assetUpdateArgs.tokenAmount);

    expect(await ContentAssetStorage.ownerOf(tokenId)).to.be.equal(accounts[0].address);
    expect(await UnfinalizedStateStorage.getUnfinalizedState(tokenId)).to.be.equal(ZERO_BYTES32);
    expect(await AssertionStorage.getAssertion(assetUpdateArgs.assertionId)).to.deep.equal([
      updateBlockTimestamp,
      assetUpdateArgs.size,
      assetUpdateArgs.triplesNumber,
      assetUpdateArgs.chunksNumber,
    ]);
    expect(await ContentAssetStorage.getAssertionIssuer(tokenId, assetUpdateArgs.assertionId, 1)).to.be.equal(
      ZERO_ADDRESS,
    );
    expect(await UnfinalizedStateStorage.getIssuer(tokenId)).to.be.equal(ZERO_ADDRESS);
    expect(await ContentAssetStorage.getAssertionIds(tokenId)).to.deep.equal([assetInputStruct.assertionId]);
    expect(await ServiceAgreementStorageProxy.getAgreementStartTime(agreementId)).to.be.equal(createBlockTimestamp);
    expect(await ServiceAgreementStorageProxy.getAgreementEpochsNumber(agreementId)).to.be.equal(
      assetInputStruct.epochsNumber,
    );
    expect(await ServiceAgreementStorageProxy.getAgreementEpochLength(agreementId)).to.be.equal(
      await ParametersStorage.epochLength(),
    );
    expect(await ServiceAgreementStorageProxy.getAgreementTokenAmount(agreementId)).to.be.equal(
      assetInputStruct.tokenAmount,
    );
    expect(await ServiceAgreementStorageProxy.getAgreementUpdateTokenAmount(agreementId)).to.be.equal(0);
    expect(await ServiceAgreementStorageProxy.getAgreementScoreFunctionId(agreementId)).to.be.equal(
      assetInputStruct.scoreFunctionId,
    );
  });

  it('Update asset storing period, expect storing period updated', async () => {
    const { tokenId, agreementId } = await createAsset();
    const additionalEpochsNumber = 1;

    await Token.increaseAllowance(ServiceAgreementV1.address, assetInputStruct.tokenAmount);

    const serviceAgreementStorageV1Address = await Hub.getContractAddress('ServiceAgreementStorageV1');
    const initialBalance = await Token.balanceOf(serviceAgreementStorageV1Address);
    const initialOwnerBalance = await Token.balanceOf(accounts[0].address);

    const initialTokenAmount = await ServiceAgreementStorageProxy.getAgreementTokenAmount(agreementId);

    expect(await ContentAsset.extendAssetStoringPeriod(tokenId, additionalEpochsNumber, assetInputStruct.tokenAmount))
      .to.emit(ContentAsset, 'AssetStoringPeriodExtended')
      .withArgs(ContentAssetStorage.address, tokenId, additionalEpochsNumber, assetInputStruct.tokenAmount);

    const resultBalance = await Token.balanceOf(serviceAgreementStorageV1Address);
    const resultOwnerBalance = await Token.balanceOf(accounts[0].address);

    expect(resultBalance.sub(initialBalance)).to.be.equal(assetInputStruct.tokenAmount);
    expect(initialOwnerBalance.sub(resultOwnerBalance)).to.be.equal(assetInputStruct.tokenAmount);
    expect(await ServiceAgreementStorageProxy.getAgreementTokenAmount(agreementId)).to.be.equal(
      initialTokenAmount.add(await assetInputStruct.tokenAmount),
    );
    expect(await ServiceAgreementStorageProxy.getAgreementEpochsNumber(agreementId)).to.be.equal(
      Number(assetInputStruct.epochsNumber) + additionalEpochsNumber,
    );
  });

  it('Increase asset token amount, expect token amount to be updated', async () => {
    const { tokenId, agreementId } = await createAsset();
    const additionalTokenAmount = hre.ethers.utils.parseEther('10');

    await Token.increaseAllowance(ServiceAgreementV1.address, additionalTokenAmount);

    const serviceAgreementStorageV1Address = await Hub.getContractAddress('ServiceAgreementStorageV1');
    const initialBalance = await Token.balanceOf(serviceAgreementStorageV1Address);
    const initialOwnerBalance = await Token.balanceOf(accounts[0].address);

    const initialTokenAmount = await ServiceAgreementStorageProxy.getAgreementTokenAmount(agreementId);

    expect(await ContentAsset.increaseAssetTokenAmount(tokenId, additionalTokenAmount))
      .to.emit(ContentAsset, 'AssetPaymentIncreased')
      .withArgs(ContentAssetStorage.address, tokenId, additionalTokenAmount);

    const resultBalance = await Token.balanceOf(serviceAgreementStorageV1Address);
    const resultOwnerBalance = await Token.balanceOf(accounts[0].address);

    expect(resultBalance.sub(initialBalance)).to.be.equal(additionalTokenAmount);
    expect(initialOwnerBalance.sub(resultOwnerBalance)).to.be.equal(additionalTokenAmount);
    expect(await ServiceAgreementStorageProxy.getAgreementTokenAmount(agreementId)).to.be.equal(
      initialTokenAmount.add(additionalTokenAmount),
    );
  });

  it('Increase asset update token amount, expect update token amount to be updated', async () => {
    const { tokenId, agreementId } = await createAsset();
    await updateAsset(tokenId);
    const additionalUpdateTokenAmount = hre.ethers.utils.parseEther('10');

    await Token.increaseAllowance(ServiceAgreementV1.address, additionalUpdateTokenAmount);

    const serviceAgreementStorageV1U1Address = await Hub.getContractAddress('ServiceAgreementStorageV1U1');
    const initialBalance = await Token.balanceOf(serviceAgreementStorageV1U1Address);
    const initialOwnerBalance = await Token.balanceOf(accounts[0].address);

    const initialUpdateTokenAmount = await ServiceAgreementStorageProxy.getAgreementUpdateTokenAmount(agreementId);

    expect(await ContentAsset.increaseAssetUpdateTokenAmount(tokenId, additionalUpdateTokenAmount))
      .to.emit(ContentAsset, 'AssetUpdatePaymentIncreased')
      .withArgs(ContentAssetStorage.address, tokenId, additionalUpdateTokenAmount);

    const resultBalance = await Token.balanceOf(serviceAgreementStorageV1U1Address);
    const resultOwnerBalance = await Token.balanceOf(accounts[0].address);

    expect(resultBalance.sub(initialBalance)).to.be.equal(additionalUpdateTokenAmount);
    expect(initialOwnerBalance.sub(resultOwnerBalance)).to.be.equal(additionalUpdateTokenAmount);
    expect(await ServiceAgreementStorageProxy.getAgreementUpdateTokenAmount(agreementId)).to.be.equal(
      initialUpdateTokenAmount.add(additionalUpdateTokenAmount),
    );
  });
});
