import { randomBytes } from 'crypto';

import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { calculateRoot, getMerkleProof } from 'assertion-tools';
import { expect } from 'chai';
import { BigNumber, BytesLike } from 'ethers';
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
} from '../../typechain';
import { ContentAssetStructs } from '../../typechain/contracts/assets/ContentAsset';
import { ServiceAgreementStructsV1 as CommitStructs } from '../../typechain/contracts/CommitManagerV1U1';
import { ServiceAgreementStructsV1 as ProofStructs } from '../../typechain/contracts/ProofManagerV1U1';

type ProofManagerV1U1Fixture = {
  accounts: SignerWithAddress[];
  ServiceAgreementStorageProxy: ServiceAgreementStorageProxy;
  CommitManagerV1U1: CommitManagerV1U1;
  ProofManagerV1U1: ProofManagerV1U1;
  ParametersStorage: ParametersStorage;
};

describe('@unit ProofManagerV1U1 contract', function () {
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

  async function submitCommit(operational: SignerWithAddress, tokenId: number, keyword: BytesLike, epoch = 0) {
    const commitInputArgs: CommitStructs.CommitInputArgsStruct = {
      assetContract: ContentAssetStorage.address,
      tokenId: tokenId,
      keyword: keyword,
      hashFunctionId: 1,
      epoch,
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

  async function submitProofAndReturnReward(
    identityId: number,
    account: SignerWithAddress,
    tokenId: number,
    keyword: BytesLike,
    epoch: number,
  ) {
    const challenge = await ProofManagerV1U1.connect(account).getChallenge(ContentAssetStorage.address, tokenId, epoch);
    const { proof, leaf } = getMerkleProof(nQuads, challenge[1].toNumber());

    const proofInputArgs = {
      assetContract: ContentAssetStorage.address,
      tokenId,
      keyword,
      hashFunctionId: 1,
      epoch,
      proof,
      chunkHash: leaf,
    };

    await ProofManagerV1U1.connect(account).sendProof(proofInputArgs);
    const filter = Staking.filters.StakeIncreased(identityId);
    const event = (await Staking.queryFilter(filter)).pop();
    if (!event) throw new Error(`Event is undefined for account ${account}`);
    return event.args.newStake.sub(event.args.oldStake);
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

  it('Create a new asset, 3 nodes send commit, teleport to proof phase, send 3 proofs and check that reward is equal for all 3 nodes', async () => {
    const operationalWallets = [accounts[0], accounts[2], accounts[3]];
    const identities = [];
    const rewards = [];

    const { tokenId, keyword, agreementId } = await createAsset();

    // All nodes submit their commits
    for (const operationalWallet of operationalWallets) {
      const identity = await createProfile(operationalWallet, accounts[1]);
      identities.push(identity);
      await submitCommit(operationalWallet, tokenId, keyword);
    }

    const epochLength = (await ParametersStorage.epochLength()).toNumber();
    const proofWindowOffsetPerc = await ServiceAgreementStorageProxy.getAgreementProofWindowOffsetPerc(agreementId);
    const delay = (epochLength * proofWindowOffsetPerc) / 100;
    await time.increase(delay);

    // All nodes submit their proofs and store the rewards received
    for (const i in operationalWallets) {
      const reward = await submitProofAndReturnReward(identities[i], operationalWallets[i], tokenId, keyword, 0);
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

  it('Create a new asset, 2 nodes send commit, teleport to proof phase, send 2 proofs and check that reward for the next epoch has increased', async () => {
    const operationalWallets = [accounts[0], accounts[2], accounts[3]];
    const identities = [];
    const rewards: BigNumber[][] = [[], [], []];

    const { tokenId, keyword, agreementId } = await createAsset();

    for (let i = 0; i < operationalWallets.length; i++) {
      const identity = await createProfile(operationalWallets[i], accounts[1]);
      identities.push(identity);
    }

    let epoch = 0;
    for (let i = 0; i < 2; i++) {
      // Only the first two nodes submit their commits
      await submitCommit(operationalWallets[i], tokenId, keyword, epoch);
    }

    const epochLength = (await ParametersStorage.epochLength()).toNumber();
    const proofWindowOffsetPerc = await ServiceAgreementStorageProxy.getAgreementProofWindowOffsetPerc(agreementId);
    const delay = (epochLength * proofWindowOffsetPerc) / 100;

    await time.increase(delay);

    for (let i = 0; i < 2; i++) {
      // First two nodes submit their proofs
      const reward = await submitProofAndReturnReward(identities[i], operationalWallets[i], tokenId, keyword, epoch);
      rewards[i].push(reward);
    }
    rewards[2].push(hre.ethers.BigNumber.from(0));

    await time.increase(epochLength - delay); // Increase time to the second epoch

    epoch = 1;
    for (let i = 0; i < operationalWallets.length; i++) {
      // All nodes submit their commits for the second epoch
      await submitCommit(operationalWallets[i], tokenId, keyword, epoch);
    }

    await time.increase(delay); // increase time to proof window

    for (let i = 0; i < operationalWallets.length; i++) {
      // All nodes submit their proofs for the second epoch
      const reward = await submitProofAndReturnReward(identities[i], operationalWallets[i], tokenId, keyword, epoch);
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
    const operationalWallets = [accounts[0], accounts[2], accounts[3]];
    const identities = [];
    const rewards: BigNumber[][] = [[], [], []];

    const { tokenId, keyword, agreementId } = await createAsset();

    const epochLength = (await ParametersStorage.epochLength()).toNumber();
    const proofWindowOffsetPerc = await ServiceAgreementStorageProxy.getAgreementProofWindowOffsetPerc(agreementId);
    const delay = (epochLength * proofWindowOffsetPerc) / 100;

    for (let i = 0; i < operationalWallets.length; i++) {
      const identity = await createProfile(operationalWallets[i], accounts[1]);
      identities.push(identity);
    }

    for (let epoch = 0; epoch < 5; epoch++) {
      const shouldCommit = [epoch !== 1 && epoch !== 3, true, true];
      const shouldProve = [epoch !== 1 && epoch !== 3, epoch !== 3 && epoch !== 4, true];

      for (let i = 0; i < operationalWallets.length; i++) {
        if (shouldCommit[i]) {
          await submitCommit(operationalWallets[i], tokenId, keyword, epoch);
        }
      }

      await time.increase(delay);

      for (let i = 0; i < operationalWallets.length; i++) {
        if (shouldProve[i]) {
          const reward = await submitProofAndReturnReward(
            identities[i],
            operationalWallets[i],
            tokenId,
            keyword,
            epoch,
          );
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
});
