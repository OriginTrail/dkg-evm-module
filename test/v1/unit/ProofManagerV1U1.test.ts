import { randomBytes } from 'crypto';

import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { calculateRoot, getMerkleProof } from 'assertion-tools';
import { expect } from 'chai';
import { BigNumber, BytesLike } from 'ethers';
import hre from 'hardhat';

import {
  CommitManagerV1,
  CommitManagerV1U1,
  ContentAsset,
  ContentAssetStorage,
  IdentityStorage,
  ParametersStorage,
  Profile,
  ProofManagerV1,
  ProofManagerV1U1,
  ServiceAgreementStorageProxy,
  ServiceAgreementV1,
  Staking,
  StakingStorage,
  Token,
} from '../../../typechain';
import { ContentAssetStructs } from '../../../typechain/contracts/v1/assets/ContentAsset';
import { ServiceAgreementStructsV1 as CommitStructs } from '../../../typechain/contracts/v1/CommitManagerV1U1';
import { ServiceAgreementStructsV1 as ProofStructs } from '../../../typechain/contracts/v1/ProofManagerV1U1';

type ProofManagerV1U1Fixture = {
  accounts: SignerWithAddress[];
  ServiceAgreementStorageProxy: ServiceAgreementStorageProxy;
  CommitManagerV1: CommitManagerV1;
  CommitManagerV1U1: CommitManagerV1U1;
  ProofManagerV1: ProofManagerV1;
  ProofManagerV1U1: ProofManagerV1U1;
  ParametersStorage: ParametersStorage;
  IdentityStorage: IdentityStorage;
};

describe('@v1 @unit ProofManagerV1U1 contract', function () {
  let accounts: SignerWithAddress[];
  let Token: Token;
  let ServiceAgreementV1: ServiceAgreementV1;
  let ServiceAgreementStorageProxy: ServiceAgreementStorageProxy;
  let ContentAsset: ContentAsset;
  let ContentAssetStorage: ContentAssetStorage;
  let CommitManagerV1: CommitManagerV1;
  let CommitManagerV1U1: CommitManagerV1U1;
  let ProofManagerV1: ProofManagerV1;
  let ProofManagerV1U1: ProofManagerV1U1;
  let ParametersStorage: ParametersStorage;
  let IdentityStorage: IdentityStorage;
  let Profile: Profile;
  let Staking: Staking;
  let StakingStorage: StakingStorage;

  const nQuadsCreate = [
    '<http://dbpedia.org/resource/Albert_Einstein> <http://schema.org/birthDate> "1879-03-14"^^<http://www.w3.org/2001/XMLSchema#date> .',
    '<http://dbpedia.org/resource/Albert_Einstein> <http://schema.org/spouse> <http://dbpedia.org/resource/Mileva_Marić> .',
    '<http://dbpedia.org/resource/Albert_Einstein> <http://xmlns.com/foaf/0.1/name> "Albert Einstein" .',
  ];
  const nQuadsUpdate = [
    '<http://dbpedia.org/resource/John_Lenno0.6097080100809427> <http://schema.org/birthDate> "1940-10-09"^^<http://www.w3.org/2001/XMLSchema#date> .',
    '<http://dbpedia.org/resource/John_Lenno0.6097080100809427> <http://schema.org/spouse> <http://dbpedia.org/resource/Cynthia_Lennon> .',
    '<http://dbpedia.org/resource/John_Lenno0.6097080100809427> <http://xmlns.com/foaf/0.1/name> "John Lennon" .',
  ];
  const assetInputStruct: ContentAssetStructs.AssetInputArgsStruct = {
    assertionId: calculateRoot(nQuadsCreate),
    size: 1000,
    triplesNumber: nQuadsCreate.length,
    chunksNumber: nQuadsCreate.length,
    epochsNumber: 5,
    tokenAmount: hre.ethers.utils.parseEther('250'),
    scoreFunctionId: 1,
    immutable_: false,
  };
  const assetUpdateArgs = {
    assertionId: calculateRoot(nQuadsUpdate),
    size: 2000,
    triplesNumber: nQuadsUpdate.length,
    chunksNumber: nQuadsUpdate.length,
    tokenAmount: hre.ethers.utils.parseEther('500'),
  };
  let commitInputArgs: CommitStructs.CommitInputArgsStruct;
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

  async function finalizeUpdate(tokenId: number, keyword: BytesLike): Promise<number[]> {
    const finalizationRequirement = await ParametersStorage.finalizationCommitsNumber();

    const identityIds = [];
    for (let i = 0; i < finalizationRequirement; i++) {
      identityIds.push(await createProfile(accounts[i], accounts[accounts.length - 1]));
    }

    commitInputArgs = {
      assetContract: ContentAssetStorage.address,
      tokenId: tokenId,
      keyword: keyword,
      hashFunctionId: 1,
      epoch: 0,
    };

    for (let i = 0; i < finalizationRequirement; i++) {
      await expect(CommitManagerV1U1.connect(accounts[i]).submitUpdateCommit(commitInputArgs)).to.emit(
        CommitManagerV1U1,
        'CommitSubmitted',
      );
    }

    return identityIds;
  }

  async function submitCommitV1U1(operational: SignerWithAddress, tokenId: number, keyword: BytesLike, epoch: number) {
    const commitInputArgs: CommitStructs.CommitInputArgsStruct = {
      assetContract: ContentAssetStorage.address,
      tokenId: tokenId,
      keyword: keyword,
      hashFunctionId: 1,
      epoch,
    };

    await expect(CommitManagerV1.connect(operational).submitCommit(commitInputArgs)).to.be.revertedWithCustomError(
      CommitManagerV1,
      'ServiceAgreementDoesntExist',
    );
    await CommitManagerV1U1.connect(operational).submitCommit(commitInputArgs);
  }

  async function createProfile(operational: SignerWithAddress, admin: SignerWithAddress): Promise<number> {
    const OperationalProfile = Profile.connect(operational);

    let identityId = (await IdentityStorage.getIdentityId(operational.address)).toNumber();
    const profileExists = identityId !== 0;

    if (!profileExists) {
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
      identityId = Number(receipt.logs[0].topics[1]);
    }

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
    CommitManagerV1 = await hre.ethers.getContract<CommitManagerV1>('CommitManagerV1');
    CommitManagerV1U1 = await hre.ethers.getContract<CommitManagerV1U1>('CommitManagerV1U1');
    ProofManagerV1 = await hre.ethers.getContract<ProofManagerV1>('ProofManagerV1');
    ProofManagerV1U1 = await hre.ethers.getContract<ProofManagerV1U1>('ProofManagerV1U1');
    ParametersStorage = await hre.ethers.getContract<ParametersStorage>('ParametersStorage');
    IdentityStorage = await hre.ethers.getContract<IdentityStorage>('IdentityStorage');
    Profile = await hre.ethers.getContract<Profile>('Profile');
    Staking = await hre.ethers.getContract<Staking>('Staking');
    StakingStorage = await hre.ethers.getContract<StakingStorage>('StakingStorage');
    accounts = await hre.ethers.getSigners();

    return {
      accounts,
      ServiceAgreementStorageProxy,
      CommitManagerV1,
      CommitManagerV1U1,
      ProofManagerV1,
      ProofManagerV1U1,
      ParametersStorage,
      IdentityStorage,
    };
  }

  async function submitProofV1U1AndReturnReward(
    identityId: number,
    account: SignerWithAddress,
    tokenId: number,
    keyword: BytesLike,
    epoch: number,
  ) {
    const challenge = await ProofManagerV1U1.connect(account).getChallenge(ContentAssetStorage.address, tokenId, epoch);
    const { proof, leaf } = getMerkleProof(nQuadsUpdate, challenge[1].toNumber());

    const proofInputArgs = {
      assetContract: ContentAssetStorage.address,
      tokenId,
      keyword,
      hashFunctionId: 1,
      epoch,
      proof,
      chunkHash: leaf,
    };

    await expect(ProofManagerV1.connect(account).sendProof(proofInputArgs)).to.be.revertedWithCustomError(
      ProofManagerV1,
      'ServiceAgreementDoesntExist',
    );
    await ProofManagerV1U1.connect(account).sendProof(proofInputArgs);
    const filter = Staking.filters.StakeIncreased(identityId);
    const event = (await Staking.queryFilter(filter)).pop();
    if (!event) throw new Error(`Event is undefined for account ${account}`);
    return event.args.newStake.sub(event.args.oldStake);
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ accounts, ServiceAgreementStorageProxy, CommitManagerV1U1, CommitManagerV1U1, ParametersStorage } =
      await loadFixture(deployProofManagerV1U1Fixture));
  });

  it('The contract is named "ProofManagerV1U1"', async () => {
    expect(await ProofManagerV1U1.name()).to.equal('ProofManagerV1U1');
  });

  it('The contract is version "1.0.2"', async () => {
    expect(await ProofManagerV1U1.version()).to.equal('1.0.2');
  });

  it('Create a new asset, update and finalize update, teleport to the proof phase and check if window is open, expect true', async () => {
    const { tokenId, keyword, agreementId } = await createAsset();
    await updateAsset(tokenId);
    await finalizeUpdate(tokenId, keyword);

    const epochLength = (await ParametersStorage.epochLength()).toNumber();
    const proofWindowOffsetPerc = await ServiceAgreementStorageProxy.getAgreementProofWindowOffsetPerc(agreementId);
    const delay = (epochLength * proofWindowOffsetPerc) / 100;

    await time.increase(delay);

    await expect(ProofManagerV1.isProofWindowOpen(agreementId, 0)).to.be.revertedWithCustomError(
      ProofManagerV1,
      'ServiceAgreementDoesntExist',
    );
    expect(await ProofManagerV1U1.isProofWindowOpen(agreementId, 0)).to.eql(true);
  });

  it('Create a new asset, update and finalize update, teleport to the moment before proof phase and check if window is open, expect false', async () => {
    const { tokenId, keyword, agreementId } = await createAsset();
    await updateAsset(tokenId);
    await finalizeUpdate(tokenId, keyword);

    const epochLength = (await ParametersStorage.epochLength()).toNumber();
    const startTime = (await ServiceAgreementStorageProxy.getAgreementStartTime(agreementId)).toNumber();
    const proofWindowOffsetPerc = await ServiceAgreementStorageProxy.getAgreementProofWindowOffsetPerc(agreementId);
    const proofWindowStart = startTime + (epochLength * proofWindowOffsetPerc) / 100;

    await time.increaseTo(proofWindowStart - 1);

    await expect(ProofManagerV1.isProofWindowOpen(agreementId, 0)).to.be.revertedWithCustomError(
      ProofManagerV1,
      'ServiceAgreementDoesntExist',
    );
    expect(await ProofManagerV1U1.isProofWindowOpen(agreementId, 0)).to.eql(false);
  });

  it('Create a new asset, update and finalize update, teleport to the moment after proof phase and check if window is open, expect false', async () => {
    const { tokenId, keyword, agreementId } = await createAsset();
    await updateAsset(tokenId);
    await finalizeUpdate(tokenId, keyword);

    const epochLength = (await ParametersStorage.epochLength()).toNumber();
    const startTime = (await ServiceAgreementStorageProxy.getAgreementStartTime(agreementId)).toNumber();
    const proofWindowOffsetPerc = await ServiceAgreementStorageProxy.getAgreementProofWindowOffsetPerc(agreementId);
    const proofWindowDurationPerc = await ParametersStorage.proofWindowDurationPerc();
    const proofWindowEnd = startTime + (epochLength * (proofWindowOffsetPerc + proofWindowDurationPerc)) / 100;

    await time.increaseTo(proofWindowEnd);

    await expect(ProofManagerV1.isProofWindowOpen(agreementId, 0)).to.be.revertedWithCustomError(
      ProofManagerV1,
      'ServiceAgreementDoesntExist',
    );
    expect(await ProofManagerV1U1.isProofWindowOpen(agreementId, 0)).to.eql(false);
  });

  it('Create a new asset, update and finalize update, teleport to the second epoch, send commit, teleport and send proof, expect ProofSent event and reward received', async () => {
    const { tokenId, keyword, agreementId } = await createAsset();
    await updateAsset(tokenId);
    const identityIds = await finalizeUpdate(tokenId, keyword);

    const epochLength = (await ParametersStorage.epochLength()).toNumber();
    await time.increase(epochLength);

    await submitCommitV1U1(accounts[0], tokenId, keyword, 1);

    const commitId = hre.ethers.utils.solidityKeccak256(
      ['bytes32', 'uint16', 'uint256', 'uint96'],
      [agreementId, 1, 1, identityIds[0]],
    );

    const challenge = await ProofManagerV1U1.getChallenge(ContentAssetStorage.address, tokenId, 1);

    const proofWindowOffsetPerc = await ServiceAgreementStorageProxy.getAgreementProofWindowOffsetPerc(agreementId);
    const delay = (epochLength * proofWindowOffsetPerc) / 100;

    await time.increase(delay);

    const { proof, leaf } = getMerkleProof(nQuadsUpdate, challenge[1].toNumber());
    proofInputArgs = {
      assetContract: ContentAssetStorage.address,
      tokenId,
      keyword,
      hashFunctionId: 1,
      epoch: 1,
      proof,
      chunkHash: leaf,
    };

    const initialStake = await StakingStorage.totalStakes(identityIds[0]);
    const initialAssetReward = await ServiceAgreementStorageProxy.getAgreementTokenAmount(agreementId);

    await expect(ProofManagerV1.sendProof(proofInputArgs)).to.be.revertedWithCustomError(
      ProofManagerV1,
      'ServiceAgreementDoesntExist',
    );
    await expect(ProofManagerV1U1.sendProof(proofInputArgs)).to.emit(ProofManagerV1U1, 'ProofSubmitted');

    const endAssetReward = await ServiceAgreementStorageProxy.getAgreementTokenAmount(agreementId);
    expect(await StakingStorage.totalStakes(identityIds[0])).to.equal(
      initialStake.add(initialAssetReward).sub(endAssetReward),
    );

    expect(await ServiceAgreementStorageProxy.getCommitSubmissionScore(commitId)).to.equal(0);
  });

  it('Create a new asset, update and finalize update, get challenge, expect challenge to be valid', async () => {
    const { tokenId, keyword } = await createAsset();
    await updateAsset(tokenId);
    await finalizeUpdate(tokenId, keyword);

    const challenge = await ProofManagerV1U1.getChallenge(ContentAssetStorage.address, tokenId, 1);

    expect(challenge[0]).to.equal(assetUpdateArgs.assertionId);
    expect(challenge[1]).to.be.within(0, nQuadsUpdate.length - 1);
  });

  it('Create a new asset, update and finalize update, teleport to the second epoch, send commit, teleport and send 2 proofs, expect second proof to be reverted', async () => {
    const { tokenId, keyword, agreementId } = await createAsset();
    await updateAsset(tokenId);
    await finalizeUpdate(tokenId, keyword);

    const epochLength = (await ParametersStorage.epochLength()).toNumber();

    await time.increase(epochLength);

    await submitCommitV1U1(accounts[0], tokenId, keyword, 1);

    const challenge = await ProofManagerV1U1.getChallenge(ContentAssetStorage.address, tokenId, 1);

    const proofWindowOffsetPerc = await ServiceAgreementStorageProxy.getAgreementProofWindowOffsetPerc(agreementId);
    const delay = (epochLength * proofWindowOffsetPerc) / 100;

    await time.increase(delay);

    const { proof, leaf } = getMerkleProof(nQuadsUpdate, challenge[1].toNumber());
    proofInputArgs = {
      assetContract: ContentAssetStorage.address,
      tokenId,
      keyword,
      hashFunctionId: 1,
      epoch: 1,
      proof,
      chunkHash: leaf,
    };

    await expect(ProofManagerV1.sendProof(proofInputArgs)).to.be.revertedWithCustomError(
      ProofManagerV1,
      'ServiceAgreementDoesntExist',
    );
    await expect(ProofManagerV1U1.sendProof(proofInputArgs)).to.emit(ProofManagerV1U1, 'ProofSubmitted');
    await expect(ProofManagerV1U1.sendProof(proofInputArgs)).to.be.revertedWithCustomError(
      ProofManagerV1U1,
      'NodeAlreadyRewarded',
    );
  });

  it('Create a new asset, update and finalize update, teleport to the second epoch, 3 nodes send commit, teleport to proof phase, send 3 proofs and check that reward is equal for all 3 nodes', async () => {
    const rewards = [];

    const { tokenId, keyword, agreementId } = await createAsset();
    await updateAsset(tokenId);
    const identityIds = await finalizeUpdate(tokenId, keyword);

    const epochLength = (await ParametersStorage.epochLength()).toNumber();

    await time.increase(epochLength);

    // All nodes submit their commits
    for (let i = 0; i < identityIds.length; i++) {
      await submitCommitV1U1(accounts[i], tokenId, keyword, 1);
    }

    const proofWindowOffsetPerc = await ServiceAgreementStorageProxy.getAgreementProofWindowOffsetPerc(agreementId);
    const delay = (epochLength * proofWindowOffsetPerc) / 100;
    await time.increase(delay);

    // All nodes submit their proofs and store the rewards received
    for (const [i, identityId] of identityIds.entries()) {
      const reward = await submitProofV1U1AndReturnReward(identityId, accounts[i], tokenId, keyword, 1);
      rewards.push(reward);
    }

    // Check that all nodes received the same reward (or the discrepancy is less than or equal to 1 wei)
    for (let i = 0; i < rewards.length - 1; i++) {
      expect(
        rewards[i]
          .sub(rewards[i + 1])
          .abs()
          .lte(1),
      ).to.be.true;
    }
  });

  it('Create a new asset, update and finalize it, teleport to the second epoch, 2 nodes send commit, teleport to proof phase, send 2 proofs and check that reward for the next epoch has increased', async () => {
    const rewards: BigNumber[][] = [[], [], []];

    const { tokenId, keyword, agreementId } = await createAsset();
    await updateAsset(tokenId);
    const identityIds = await finalizeUpdate(tokenId, keyword);

    const epochLength = (await ParametersStorage.epochLength()).toNumber();

    await time.increase(epochLength);

    let epoch = 1;
    for (let i = 0; i < 2; i++) {
      await submitCommitV1U1(accounts[i], tokenId, keyword, 1);
    }

    const proofWindowOffsetPerc = await ServiceAgreementStorageProxy.getAgreementProofWindowOffsetPerc(agreementId);
    const delay = (epochLength * proofWindowOffsetPerc) / 100;

    await time.increase(delay);

    for (let i = 0; i < 2; i++) {
      // First two nodes submit their proofs
      const reward = await submitProofV1U1AndReturnReward(identityIds[i], accounts[i], tokenId, keyword, epoch);
      rewards[i].push(reward);
    }
    rewards[2].push(hre.ethers.BigNumber.from(0));

    await time.increase(epochLength - delay); // Increase time to the third epoch

    epoch = 2;
    for (let i = 0; i < identityIds.length; i++) {
      // All nodes submit their commits for the second epoch
      await submitCommitV1U1(accounts[i], tokenId, keyword, epoch);
    }

    await time.increase(delay); // increase time to proof window

    for (let i = 0; i < identityIds.length; i++) {
      // All nodes submit their proofs for the second epoch
      const reward = await submitProofV1U1AndReturnReward(identityIds[i], accounts[i], tokenId, keyword, epoch);
      rewards[i].push(reward);
    }

    // Check that the reward for the second epoch is greater than for the first epoch
    for (let i = 0; i < 2; i++) {
      expect(rewards[i][1].gt(rewards[i][0])).to.be.true;
    }

    // Check that all nodes received the same reward for the second epoch
    for (let i = 0; i < rewards.length - 1; i++) {
      expect(
        rewards[i][1]
          .sub(rewards[i + 1][1])
          .abs()
          .lte(1),
      ).to.be.true;
    }
  });

  it('Rewards are equal for all nodes in each epoch, including when some nodes miss commits or proofs', async () => {
    const rewards: BigNumber[][] = [[], [], []];

    const { tokenId, keyword, agreementId } = await createAsset();
    await updateAsset(tokenId);
    const identityIds = await finalizeUpdate(tokenId, keyword);

    const epochLength = (await ParametersStorage.epochLength()).toNumber();
    const proofWindowOffsetPerc = await ServiceAgreementStorageProxy.getAgreementProofWindowOffsetPerc(agreementId);
    const delay = (epochLength * proofWindowOffsetPerc) / 100;

    await time.increase(delay);

    for (let i = 0; i < identityIds.length; i++) {
      const reward = await submitProofV1U1AndReturnReward(identityIds[i], accounts[i], tokenId, keyword, 0);
      rewards[i].push(reward);
    }

    await time.increase(epochLength - delay);

    for (let epoch = 1; epoch < 5; epoch++) {
      const shouldCommit = [epoch !== 1 && epoch !== 3, true, true];
      const shouldProve = [epoch !== 1 && epoch !== 3, epoch !== 3 && epoch !== 4, true];

      for (let i = 0; i < identityIds.length; i++) {
        if (shouldCommit[i]) {
          await submitCommitV1U1(accounts[i], tokenId, keyword, epoch);
        }
      }

      await time.increase(delay);

      for (let i = 0; i < identityIds.length; i++) {
        if (shouldProve[i]) {
          const reward = await submitProofV1U1AndReturnReward(identityIds[i], accounts[i], tokenId, keyword, epoch);
          rewards[i].push(reward);
        } else {
          rewards[i].push(hre.ethers.BigNumber.from(0));
        }
      }

      await time.increase(epochLength - delay);
    }
    // Check that all nodes received the same reward for each epoch they submitted proofs
    for (let epoch = 0; epoch < 5; epoch++) {
      const epochRewards = rewards.map((r) => r[epoch]);
      for (let i = 0; i < epochRewards.length - 1; i++) {
        if (epochRewards[i].isZero() || epochRewards[i + 1].isZero()) continue;
        expect(
          epochRewards[i]
            .sub(epochRewards[i + 1])
            .abs()
            .lte(1),
        ).to.be.true;
      }
    }
  });

  it('Each node submits commits and proofs for each epoch, verify all rewards in all epochs are the same, and total rewards equals initial token amount in service agreement', async () => {
    let rewards: BigNumber[] = [];
    const totalEpochs = 5;

    const { tokenId, keyword, agreementId } = await createAsset();
    await updateAsset(tokenId);
    const identityIds = await finalizeUpdate(tokenId, keyword);

    const initialTokenAmount = await ServiceAgreementStorageProxy.getAgreementTokenAmount(agreementId);

    const epochLength = (await ParametersStorage.epochLength()).toNumber();
    const proofWindowOffsetPerc = await ServiceAgreementStorageProxy.getAgreementProofWindowOffsetPerc(agreementId);
    const delay = (epochLength * proofWindowOffsetPerc) / 100;

    await time.increase(delay);

    for (let i = 0; i < identityIds.length; i++) {
      const reward = await submitProofV1U1AndReturnReward(identityIds[i], accounts[i], tokenId, keyword, 0);
      rewards.push(reward);
    }

    for (let i = 0; i < rewards.length - 1; i++) {
      expect(
        rewards[i]
          .sub(rewards[i + 1])
          .abs()
          .lte(1),
      ).to.be.true;
    }

    await time.increase(epochLength - delay);

    let totalReward = BigNumber.from(0);
    totalReward = rewards.reduce((total, reward) => total.add(reward), totalReward);
    rewards = [];

    // Run through each epoch
    for (let epoch = 1; epoch < totalEpochs; epoch++) {
      // All nodes submit their commits
      for (let i = 0; i < identityIds.length; i++) {
        await submitCommitV1U1(accounts[i], tokenId, keyword, epoch);
      }

      const epochLength = (await ParametersStorage.epochLength()).toNumber();
      const proofWindowOffsetPerc = await ServiceAgreementStorageProxy.getAgreementProofWindowOffsetPerc(agreementId);
      const delay = (epochLength * proofWindowOffsetPerc) / 100;
      await time.increase(delay);

      // All nodes submit their proofs and store the rewards received
      for (const [i, identityId] of identityIds.entries()) {
        const reward = await submitProofV1U1AndReturnReward(identityId, accounts[i], tokenId, keyword, epoch);
        rewards.push(reward);
      }

      // Check that all nodes received the same reward (or the discrepancy is less than or equal to 1 wei)
      for (let i = 0; i < rewards.length - 1; i++) {
        expect(
          rewards[i]
            .sub(rewards[i + 1])
            .abs()
            .lte(1),
        ).to.be.true;
      }

      await time.increase(epochLength - delay);
      // Calculate total reward and reset rewards for next epoch
      totalReward = rewards.reduce((total, reward) => total.add(reward), totalReward);
      rewards = []; // Reset rewards for next epoch
    }

    expect(totalReward.eq(initialTokenAmount)).to.be.true;

    // Check that the token amount stored in the service agreement at the end of the test is 0
    const finalTokenAmount = await ServiceAgreementStorageProxy.getAgreementTokenAmount(agreementId);
    expect(finalTokenAmount.eq(0)).to.be.true;
  });

  it('Variable number of nodes send commits and proofs each epoch, verify all rewards in all epochs are the same, and total rewards equals initial token amount in service agreement', async () => {
    let rewards = [];
    const totalEpochs = 5;

    const { tokenId, keyword, agreementId } = await createAsset();
    await updateAsset(tokenId);
    const identityIds = await finalizeUpdate(tokenId, keyword);

    const initialTokenAmount = await ServiceAgreementStorageProxy.getAgreementTokenAmount(agreementId);

    const epochLength = (await ParametersStorage.epochLength()).toNumber();
    const proofWindowOffsetPerc = await ServiceAgreementStorageProxy.getAgreementProofWindowOffsetPerc(agreementId);
    const delay = (epochLength * proofWindowOffsetPerc) / 100;

    await time.increase(delay);

    for (let i = 0; i < identityIds.length; i++) {
      const reward = await submitProofV1U1AndReturnReward(identityIds[i], accounts[i], tokenId, keyword, 0);
      rewards.push(reward);
    }

    for (let i = 0; i < rewards.length - 1; i++) {
      expect(
        rewards[i]
          .sub(rewards[i + 1])
          .abs()
          .lte(1),
      ).to.be.true;
    }

    await time.increase(epochLength - delay);

    let totalReward = BigNumber.from(0);
    totalReward = rewards.reduce((total, reward) => total.add(reward), totalReward);
    rewards = []; // Reset rewards for next epoch

    // Define wallet subsets for commit and proof phases for each epoch
    const walletSubsetsForCommit = [
      [],
      accounts.slice(0, 2), // less than 3 nodes send commits
      accounts.slice(0, 3), // 3 nodes send commits
      accounts.slice(0, 3), // 3 nodes send commits
      accounts.slice(0, 3), // 3 nodes send commits
    ];

    const walletSubsetsForProof = [
      [],
      accounts.slice(0, 2), // Less than 3 nodes send proofs
      accounts.slice(0, 2), // Less than 3 nodes send proofs
      accounts.slice(0, 3), // 3 nodes send proofs
      accounts.slice(0, 3), // 3 nodes send proofs
    ];

    // Run through each epoch
    for (let epoch = 1; epoch < totalEpochs; epoch++) {
      const currentWalletSubsetForCommit = walletSubsetsForCommit[epoch];
      const currentWalletSubsetForProof = walletSubsetsForProof[epoch];

      // Subset of nodes submit their commits
      for (const operationalWallet of currentWalletSubsetForCommit) {
        await submitCommitV1U1(operationalWallet, tokenId, keyword, epoch);
      }

      const epochLength = (await ParametersStorage.epochLength()).toNumber();
      const proofWindowOffsetPerc = await ServiceAgreementStorageProxy.getAgreementProofWindowOffsetPerc(agreementId);
      const delay = (epochLength * proofWindowOffsetPerc) / 100;
      await time.increase(delay);

      // Subset of nodes submit their proofs and store the rewards received
      for (const operationalWallet of currentWalletSubsetForProof) {
        const identity = identityIds[accounts.indexOf(operationalWallet)];
        const reward = await submitProofV1U1AndReturnReward(identity, operationalWallet, tokenId, keyword, epoch);
        rewards.push(reward);
      }

      // Check that all nodes received the same reward (or the discrepancy is less than or equal to 1 wei)
      for (let i = 0; i < rewards.length - 1; i++) {
        expect(
          rewards[i]
            .sub(rewards[i + 1])
            .abs()
            .lte(1),
        ).to.be.true;
      }

      await time.increase(epochLength - delay);

      // Calculate total reward and reset rewards for next epoch
      totalReward = rewards.reduce((total, reward) => total.add(reward), totalReward);
      rewards = []; // Reset rewards for next epoch
    }

    expect(totalReward.eq(initialTokenAmount)).to.be.true;

    // Check that the token amount stored in the service agreement at the end of the test is 0
    const finalTokenAmount = await ServiceAgreementStorageProxy.getAgreementTokenAmount(agreementId);
    expect(finalTokenAmount.eq(0)).to.be.true;
  });
});
