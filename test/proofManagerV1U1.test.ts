import { randomBytes } from 'crypto';

import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { calculateRoot, getMerkleProof } from 'assertion-tools';
import { expect } from 'chai';
import { BytesLike } from 'ethers';
import hre from 'hardhat';

import {
  CommitManagerV1U1,
  ContentAsset,
  ContentAssetStorage,
  ParametersStorage,
  Profile,
  ProofManagerV1U1,
  ServiceAgreementStorageProxy,
  ServiceAgreementV1,
  Staking,
  StakingStorage,
  Token,
} from '../typechain';
import { ContentAssetStructs } from '../typechain/contracts/assets/ContentAsset';
import { ServiceAgreementStructsV1 as CommitStructs } from '../typechain/contracts/CommitManagerV1U1';
import { ServiceAgreementStructsV1 as ProofStructs } from '../typechain/contracts/ProofManagerV1U1';

type ProofManagerV1U1Fixture = {
  accounts: SignerWithAddress[];
  ServiceAgreementStorageProxy: ServiceAgreementStorageProxy;
  CommitManagerV1U1: CommitManagerV1U1;
  ProofManagerV1U1: ProofManagerV1U1;
  ParametersStorage: ParametersStorage;
};

describe('ProofManagerV1U1 contract', function () {
  let accounts: SignerWithAddress[];
  let Token: Token;
  let ServiceAgreementV1: ServiceAgreementV1;
  let ServiceAgreementStorageProxy: ServiceAgreementStorageProxy;
  let ContentAsset: ContentAsset;
  let ContentAssetStorage: ContentAssetStorage;
  let CommitManagerV1U1: CommitManagerV1U1;
  let ProofManagerV1U1: ProofManagerV1U1;
  let ParametersStorage: ParametersStorage;
  let Profile: Profile;
  let Staking: Staking;
  let StakingStorage: StakingStorage;

  const nQuads = [
    '<http://dbpedia.org/resource/John_Lenno0.6097080100809427> <http://schema.org/birthDate> "1940-10-09"^^<http://www.w3.org/2001/XMLSchema#date> .',
    '<http://dbpedia.org/resource/John_Lenno0.6097080100809427> <http://schema.org/spouse> <http://dbpedia.org/resource/Cynthia_Lennon> .',
    '<http://dbpedia.org/resource/John_Lenno0.6097080100809427> <http://xmlns.com/foaf/0.1/name> "John Lennon" .',
  ];
  const assetInputStruct: ContentAssetStructs.AssetInputArgsStruct = {
    assertionId: calculateRoot(nQuads),
    size: 1000,
    triplesNumber: nQuads.length,
    chunksNumber: nQuads.length,
    epochsNumber: 5,
    tokenAmount: hre.ethers.utils.parseEther('250'),
    scoreFunctionId: 1,
    immutable_: false,
  };
  let proofInputArgs: ProofStructs.ProofInputArgsStruct;

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

  async function submitCommit(operational: SignerWithAddress, tokenId: number, keyword: BytesLike) {
    const commitInputArgs: CommitStructs.CommitInputArgsStruct = {
      assetContract: ContentAssetStorage.address,
      tokenId: tokenId,
      keyword: keyword,
      hashFunctionId: 1,
      epoch: 0,
    };

    await CommitManagerV1U1.connect(operational).submitCommit(commitInputArgs);
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

  async function deployProofManagerV1U1Fixture(): Promise<ProofManagerV1U1Fixture> {
    await hre.deployments.fixture(['ContentAsset', 'CommitManagerV1U1', 'ProofManagerV1U1', 'Profile']);
    Token = await hre.ethers.getContract<Token>('Token');
    ServiceAgreementV1 = await hre.ethers.getContract<ServiceAgreementV1>('ServiceAgreementV1');
    ServiceAgreementStorageProxy = await hre.ethers.getContract<ServiceAgreementStorageProxy>(
      'ServiceAgreementStorageProxy',
    );
    ContentAsset = await hre.ethers.getContract<ContentAsset>('ContentAsset');
    ContentAssetStorage = await hre.ethers.getContract<ContentAssetStorage>('ContentAssetStorage');
    CommitManagerV1U1 = await hre.ethers.getContract<CommitManagerV1U1>('CommitManagerV1U1');
    ProofManagerV1U1 = await hre.ethers.getContract<ProofManagerV1U1>('ProofManagerV1U1');
    ParametersStorage = await hre.ethers.getContract<ParametersStorage>('ParametersStorage');
    Profile = await hre.ethers.getContract<Profile>('Profile');
    Staking = await hre.ethers.getContract<Staking>('Staking');
    StakingStorage = await hre.ethers.getContract<StakingStorage>('StakingStorage');
    accounts = await hre.ethers.getSigners();

    return { accounts, ServiceAgreementStorageProxy, CommitManagerV1U1, ProofManagerV1U1, ParametersStorage };
  }

  beforeEach(async () => {
    ({ accounts, ServiceAgreementStorageProxy, CommitManagerV1U1, CommitManagerV1U1, ParametersStorage } =
      await loadFixture(deployProofManagerV1U1Fixture));
  });

  it('The contract is named "ProofManagerV1U1"', async () => {
    expect(await ProofManagerV1U1.name()).to.equal('ProofManagerV1U1');
  });

  it('The contract is version "1.0.0"', async () => {
    expect(await ProofManagerV1U1.version()).to.equal('1.0.0');
  });

  it('Create a new asset, teleport to the proof phase and check if window is open, expect true', async () => {
    const { agreementId } = await createAsset();

    const epochLength = (await ParametersStorage.epochLength()).toNumber();
    const proofWindowOffsetPerc = await ServiceAgreementStorageProxy.getAgreementProofWindowOffsetPerc(agreementId);
    const delay = (epochLength * proofWindowOffsetPerc) / 100;

    await time.increase(delay);

    expect(await ProofManagerV1U1.isProofWindowOpen(agreementId, 0)).to.eql(true);
  });

  it('Create a new asset, teleport to the moment before proof phase and check if window is open, expect false', async () => {
    const { agreementId } = await createAsset();

    const epochLength = (await ParametersStorage.epochLength()).toNumber();
    const proofWindowOffsetPerc = await ServiceAgreementStorageProxy.getAgreementProofWindowOffsetPerc(agreementId);
    const delay = (epochLength * proofWindowOffsetPerc) / 100;

    await time.increase(delay - 1);

    expect(await ProofManagerV1U1.isProofWindowOpen(agreementId, 0)).to.eql(false);
  });

  it('Create a new asset, teleport to the moment after proof phase and check if window is open, expect false', async () => {
    const { agreementId } = await createAsset();

    const epochLength = (await ParametersStorage.epochLength()).toNumber();
    const proofWindowOffsetPerc = await ServiceAgreementStorageProxy.getAgreementProofWindowOffsetPerc(agreementId);
    const proofWindowDurationPerc = await ParametersStorage.proofWindowDurationPerc();
    const delay = (epochLength * (proofWindowOffsetPerc + proofWindowDurationPerc)) / 100;

    await time.increase(delay);

    expect(await ProofManagerV1U1.isProofWindowOpen(agreementId, 0)).to.eql(false);
  });

  it('Create a new asset, send commit, teleport and send proof, expect ProofSent event and reward received', async () => {
    const identityId = await createProfile(accounts[0], accounts[1]);
    const { tokenId, keyword, agreementId } = await createAsset();
    await submitCommit(accounts[0], tokenId, keyword);

    const commitId = hre.ethers.utils.solidityKeccak256(
      ['bytes32', 'uint16', 'uint256', 'uint96'],
      [agreementId, 0, 0, identityId],
    );

    const challenge = await ProofManagerV1U1.getChallenge(ContentAssetStorage.address, tokenId, 0);

    const epochLength = (await ParametersStorage.epochLength()).toNumber();
    const proofWindowOffsetPerc = await ServiceAgreementStorageProxy.getAgreementProofWindowOffsetPerc(agreementId);
    const delay = (epochLength * proofWindowOffsetPerc) / 100;

    await time.increase(delay);

    const { proof, leaf } = getMerkleProof(nQuads, challenge[1].toNumber());
    proofInputArgs = {
      assetContract: ContentAssetStorage.address,
      tokenId,
      keyword,
      hashFunctionId: 1,
      epoch: 0,
      proof,
      chunkHash: leaf,
    };

    const initialStake = await StakingStorage.totalStakes(identityId);
    const initialAssetReward = await ServiceAgreementStorageProxy.getAgreementTokenAmount(agreementId);

    expect(await ProofManagerV1U1.sendProof(proofInputArgs)).to.emit(ProofManagerV1U1, 'ProofSubmitted');

    const endAssetReward = await ServiceAgreementStorageProxy.getAgreementTokenAmount(agreementId);
    expect(await StakingStorage.totalStakes(identityId)).to.equal(
      initialStake.add(initialAssetReward).sub(endAssetReward),
    );

    expect(await ServiceAgreementStorageProxy.getCommitSubmissionScore(commitId)).to.equal(0);
  });

  it('Create a new asset and get challenge, expect challenge to be valid', async () => {
    const { tokenId } = await createAsset();

    const challenge = await ProofManagerV1U1.getChallenge(ContentAssetStorage.address, tokenId, 0);

    expect(challenge[0]).to.equal(assetInputStruct.assertionId);
    expect(challenge[1]).to.be.within(0, nQuads.length - 1);
  });

  it('Create a new asset, send commit, teleport and send 2 proofs, expect second proof to be reverted', async () => {
    await createProfile(accounts[0], accounts[1]);
    const { tokenId, keyword, agreementId } = await createAsset();
    await submitCommit(accounts[0], tokenId, keyword);

    const challenge = await ProofManagerV1U1.getChallenge(ContentAssetStorage.address, tokenId, 0);

    const epochLength = (await ParametersStorage.epochLength()).toNumber();
    const proofWindowOffsetPerc = await ServiceAgreementStorageProxy.getAgreementProofWindowOffsetPerc(agreementId);
    const delay = (epochLength * proofWindowOffsetPerc) / 100;

    await time.increase(delay);

    const { proof, leaf } = getMerkleProof(nQuads, challenge[1].toNumber());
    proofInputArgs = {
      assetContract: ContentAssetStorage.address,
      tokenId,
      keyword,
      hashFunctionId: 1,
      epoch: 0,
      proof,
      chunkHash: leaf,
    };

    expect(await ProofManagerV1U1.sendProof(proofInputArgs)).to.emit(ProofManagerV1U1, 'ProofSubmitted');
    await expect(ProofManagerV1U1.sendProof(proofInputArgs)).to.be.revertedWithCustomError(
      ProofManagerV1U1,
      'NodeAlreadyRewarded',
    );
  });
});
