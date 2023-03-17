import { randomBytes } from 'crypto';

import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BytesLike } from 'ethers';
import hre from 'hardhat';

import {
  CommitManagerV1U1,
  ContentAsset,
  ContentAssetStorage,
  ParametersStorage,
  Profile,
  ServiceAgreementV1,
  Staking,
  Token,
} from '../typechain';
import { ContentAssetStructs } from '../typechain/contracts/assets/ContentAsset';
import { ServiceAgreementStructsV1 } from '../typechain/contracts/CommitManagerV1U1';

type CommitManagerV1U1Fixture = {
  accounts: SignerWithAddress[];
  CommitManagerV1U1: CommitManagerV1U1;
  ParametersStorage: ParametersStorage;
};

describe('CommitManagerV1U1 contract', function () {
  let accounts: SignerWithAddress[];
  let Token: Token;
  let ServiceAgreementV1: ServiceAgreementV1;
  let ContentAsset: ContentAsset;
  let ContentAssetStorage: ContentAssetStorage;
  let CommitManagerV1U1: CommitManagerV1U1;
  let ParametersStorage: ParametersStorage;
  let Profile: Profile;
  let Staking: Staking;

  const assetInputStruct: ContentAssetStructs.AssetInputArgsStruct = {
    assertionId: '0x' + randomBytes(32).toString('hex'),
    size: 1000,
    triplesNumber: 10,
    chunksNumber: 10,
    epochsNumber: 5,
    tokenAmount: hre.ethers.utils.parseEther('250'),
    scoreFunctionId: 1,
    immutable_: false,
  };
  const assetUpdateArgs = {
    assertionId: '0x' + randomBytes(32).toString('hex'),
    size: 2000,
    triplesNumber: 20,
    chunksNumber: 20,
    tokenAmount: hre.ethers.utils.parseEther('500'),
  };
  let commitInputArgs: ServiceAgreementStructsV1.CommitInputArgsStruct;

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

  async function deployCommitManagerV1U1Fixture(): Promise<CommitManagerV1U1Fixture> {
    await hre.deployments.fixture(['ContentAsset', 'CommitManagerV1U1', 'Profile']);
    Token = await hre.ethers.getContract<Token>('Token');
    ServiceAgreementV1 = await hre.ethers.getContract<ServiceAgreementV1>('ServiceAgreementV1');
    ContentAsset = await hre.ethers.getContract<ContentAsset>('ContentAsset');
    ContentAssetStorage = await hre.ethers.getContract<ContentAssetStorage>('ContentAssetStorage');
    CommitManagerV1U1 = await hre.ethers.getContract<CommitManagerV1U1>('CommitManagerV1U1');
    ParametersStorage = await hre.ethers.getContract<ParametersStorage>('ParametersStorage');
    Profile = await hre.ethers.getContract<Profile>('Profile');
    Staking = await hre.ethers.getContract<Staking>('Staking');
    accounts = await hre.ethers.getSigners();

    return { accounts, CommitManagerV1U1, ParametersStorage };
  }

  beforeEach(async () => {
    ({ accounts, CommitManagerV1U1 } = await loadFixture(deployCommitManagerV1U1Fixture));
  });

  it('The contract is named "CommitManagerV1U1"', async () => {
    expect(await CommitManagerV1U1.name()).to.equal('CommitManagerV1U1');
  });

  it('The contract is version "1.0.0"', async () => {
    expect(await CommitManagerV1U1.version()).to.equal('1.0.0');
  });

  it('Create new asset, check if commit window is open, expect to be true', async () => {
    const { agreementId } = await createAsset();

    expect(await CommitManagerV1U1.isCommitWindowOpen(agreementId, 0)).to.eql(true);
  });

  it('Create new asset, teleport to the end of commit phase and check if commit window is open, expect to be false', async () => {
    const { agreementId } = await createAsset();

    const epochLength = (await ParametersStorage.epochLength()).toNumber();
    const commitWindowDurationPerc = await ParametersStorage.commitWindowDurationPerc();
    const commitWindowDuration = (epochLength * commitWindowDurationPerc) / 100;

    await time.increase(commitWindowDuration + 1);

    expect(await CommitManagerV1U1.isCommitWindowOpen(agreementId, 0)).to.eql(false);
  });

  it('Create new asset, teleport to second epoch and check if commit window is open, expect to be true', async () => {
    const { agreementId } = await createAsset();

    const epochLength = (await ParametersStorage.epochLength()).toNumber();
    await time.increase(epochLength);

    expect(await CommitManagerV1U1.isCommitWindowOpen(agreementId, 1)).to.eql(true);
  });

  it('Create new asset, update it and check if update commit window is open, expect to be true', async () => {
    const { tokenId, agreementId } = await createAsset();
    await updateAsset(tokenId);

    expect(await CommitManagerV1U1.isUpdateCommitWindowOpen(agreementId, 0, 1)).to.eql(true);
  });

  it('Create new asset, update it, teleport to the end of commit window and check if update commit window is open, expect to be false', async () => {
    const { tokenId, agreementId } = await createAsset();
    await updateAsset(tokenId);

    const updateCommitWindowDuration = await ParametersStorage.updateCommitWindowDuration();
    await time.increase(updateCommitWindowDuration);

    expect(await CommitManagerV1U1.isUpdateCommitWindowOpen(agreementId, 0, 1)).to.eql(false);
  });

  it('Create new asset, submit commit, expect CommitSubmitted event', async () => {
    await createProfile(accounts[0], accounts[1]);

    const { tokenId, keyword } = await createAsset();

    commitInputArgs = {
      assetContract: ContentAssetStorage.address,
      tokenId: tokenId,
      keyword: keyword,
      hashFunctionId: 1,
      epoch: 0,
    };

    expect(await CommitManagerV1U1.submitCommit(commitInputArgs)).to.emit(CommitManagerV1U1, 'CommitSubmitted');
  });

  it('Create new asset, submit and R0 commits, expect R0 commits to be returned', async () => {
    const r0 = await ParametersStorage.r0();

    const identityIds = [];
    for (let i = 0; i < r0; i++) {
      identityIds.push(await createProfile(accounts[i], accounts[accounts.length - 1]));
    }

    const { tokenId, keyword, agreementId } = await createAsset();

    commitInputArgs = {
      assetContract: ContentAssetStorage.address,
      tokenId: tokenId,
      keyword: keyword,
      hashFunctionId: 1,
      epoch: 0,
    };

    for (let i = 0; i < r0; i++) {
      expect(await CommitManagerV1U1.connect(accounts[i]).submitCommit(commitInputArgs)).to.emit(
        CommitManagerV1U1,
        'CommitSubmitted',
      );
    }

    const topCommits = await CommitManagerV1U1.getTopCommitSubmissions(agreementId, 0, 0);

    expect(topCommits.map((arr) => arr[0])).to.have.deep.members(
      identityIds.map((identityId) => hre.ethers.BigNumber.from(identityId)),
    );
  });

  it('Create new asset, update asset, submit update commit, expect CommitSubmitted event', async () => {
    await createProfile(accounts[0], accounts[1]);

    const { tokenId, keyword } = await createAsset();
    await updateAsset(tokenId);

    commitInputArgs = {
      assetContract: ContentAssetStorage.address,
      tokenId: tokenId,
      keyword: keyword,
      hashFunctionId: 1,
      epoch: 0,
    };

    expect(await CommitManagerV1U1.submitUpdateCommit(commitInputArgs)).to.emit(CommitManagerV1U1, 'CommitSubmitted');
  });

  it('Create new asset, update it and submit <finalizationCommitsNumber> update commits, expect StateFinalized event', async () => {
    const finalizationRequirement = await ParametersStorage.finalizationCommitsNumber();

    const identityIds = [];
    for (let i = 0; i < finalizationRequirement; i++) {
      identityIds.push(await createProfile(accounts[i], accounts[accounts.length - 1]));
    }

    const { tokenId, keyword, agreementId } = await createAsset();
    await updateAsset(tokenId);

    commitInputArgs = {
      assetContract: ContentAssetStorage.address,
      tokenId: tokenId,
      keyword: keyword,
      hashFunctionId: 1,
      epoch: 0,
    };

    for (let i = 0; i < finalizationRequirement - 1; i++) {
      expect(await CommitManagerV1U1.connect(accounts[i]).submitUpdateCommit(commitInputArgs)).to.emit(
        CommitManagerV1U1,
        'CommitSubmitted',
      );
    }
    expect(
      await CommitManagerV1U1.connect(accounts[identityIds.length - 1]).submitUpdateCommit(commitInputArgs),
    ).to.emit(CommitManagerV1U1, 'StateFinalized');

    const topCommits = await CommitManagerV1U1.getTopCommitSubmissions(agreementId, 0, 1);

    expect(topCommits.map((arr) => arr[0])).to.include.deep.members(
      identityIds.map((identityId) => hre.ethers.BigNumber.from(identityId)),
    );
  });
});
