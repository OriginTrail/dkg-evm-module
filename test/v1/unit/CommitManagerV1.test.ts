import { randomBytes } from 'crypto';

import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { expect } from 'chai';
import { BytesLike } from 'ethers';
import hre from 'hardhat';
import { SignerWithAddress } from 'hardhat-deploy-ethers/signers';

import {
  CommitManagerV1,
  ContentAsset,
  ContentAssetStorage,
  ParametersStorage,
  Profile,
  ServiceAgreementV1,
  Staking,
  Token,
} from '../../../typechain';
import { ContentAssetStructs } from '../../../typechain/contracts/v1/assets/ContentAsset';
import { ServiceAgreementStructsV1 } from '../../../typechain/contracts/v1/CommitManagerV1';

type CommitManagerV1Fixture = {
  accounts: SignerWithAddress[];
  CommitManagerV1: CommitManagerV1;
};

describe('@v1 @unit CommitManagerV1 contract', function () {
  let accounts: SignerWithAddress[];
  let Token: Token;
  let ServiceAgreementV1: ServiceAgreementV1;
  let ContentAsset: ContentAsset;
  let ContentAssetStorage: ContentAssetStorage;
  let CommitManagerV1: CommitManagerV1;
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

  async function createProfile(operational: SignerWithAddress, admin: SignerWithAddress): Promise<number> {
    const OperationalProfile = Profile.connect(operational);

    const receipt = await (
      await OperationalProfile.createProfile(
        admin.address,
        [],
        '0x' + randomBytes(32).toString('hex'),
        randomBytes(3).toString('hex'),
        randomBytes(2).toString('hex'),
        0,
      )
    ).wait();
    const identityId = Number(receipt.logs[0].topics[1]);

    await OperationalProfile.setAsk(identityId, hre.ethers.utils.parseEther('0.25'));

    const stakeAmount = hre.ethers.utils.parseEther('50000');
    await Token.connect(admin).increaseAllowance(Staking.address, stakeAmount);
    await Staking.connect(admin)['addStake(uint72,uint96)'](identityId, stakeAmount);

    return identityId;
  }

  async function deployCommitManagerV1Fixture(): Promise<CommitManagerV1Fixture> {
    await hre.deployments.fixture(['ContentAsset', 'CommitManagerV1', 'Profile']);
    Token = await hre.ethers.getContract<Token>('Token');
    ServiceAgreementV1 = await hre.ethers.getContract<ServiceAgreementV1>('ServiceAgreementV1');
    ContentAsset = await hre.ethers.getContract<ContentAsset>('ContentAsset');
    ContentAssetStorage = await hre.ethers.getContract<ContentAssetStorage>('ContentAssetStorage');
    CommitManagerV1 = await hre.ethers.getContract<CommitManagerV1>('CommitManagerV1');
    ParametersStorage = await hre.ethers.getContract<ParametersStorage>('ParametersStorage');
    Profile = await hre.ethers.getContract<Profile>('Profile');
    Staking = await hre.ethers.getContract<Staking>('Staking');
    accounts = await hre.ethers.getSigners();

    return { accounts, CommitManagerV1 };
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ accounts, CommitManagerV1 } = await loadFixture(deployCommitManagerV1Fixture));
  });

  it('The contract is named "CommitManagerV1"', async () => {
    expect(await CommitManagerV1.name()).to.equal('CommitManagerV1');
  });

  it('The contract is version "1.0.2"', async () => {
    expect(await CommitManagerV1.version()).to.equal('1.0.2');
  });

  it('Create new asset, check if commit window is open, expect to be true', async () => {
    const { agreementId } = await createAsset();

    expect(await CommitManagerV1.isCommitWindowOpen(agreementId, 0)).to.eql(true);
  });

  it('Create new asset, teleport to the end of commit phase and check if commit window is open, expect to be false', async () => {
    const { agreementId } = await createAsset();

    const epochLength = (await ParametersStorage.epochLength()).toNumber();
    const commitWindowDurationPerc = await ParametersStorage.commitWindowDurationPerc();
    const commitWindowDuration = (epochLength * commitWindowDurationPerc) / 100;

    await time.increase(commitWindowDuration + 1);

    expect(await CommitManagerV1.isCommitWindowOpen(agreementId, 0)).to.eql(false);
  });

  it('Create new asset, teleport to second epoch and check if commit window is open, expect to be true', async () => {
    const { agreementId } = await createAsset();

    const epochLength = (await ParametersStorage.epochLength()).toNumber();
    await time.increase(epochLength);

    expect(await CommitManagerV1.isCommitWindowOpen(agreementId, 1)).to.eql(true);
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

    await expect(CommitManagerV1.submitCommit(commitInputArgs)).to.emit(CommitManagerV1, 'CommitSubmitted');
  });

  it('Create new asset, submit R0 commits, expect R0 commits to be returned', async () => {
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
      await expect(CommitManagerV1.connect(accounts[i]).submitCommit(commitInputArgs)).to.emit(
        CommitManagerV1,
        'CommitSubmitted',
      );
    }

    const topCommits = await CommitManagerV1.getTopCommitSubmissions(agreementId, 0);

    expect(topCommits.map((arr) => arr[0])).to.have.deep.members(
      identityIds.map((identityId) => hre.ethers.BigNumber.from(identityId)),
    );
  });
});
