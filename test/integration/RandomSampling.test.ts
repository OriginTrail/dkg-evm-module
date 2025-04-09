import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre from 'hardhat';

import {
  RandomSampling,
  RandomSamplingStorage,
  IdentityStorage,
  StakingStorage,
  KnowledgeCollectionStorage,
  ProfileStorage,
  EpochStorage,
  Chronos,
  AskStorage,
  DelegatorsInfo,
  Profile,
  Hub,
  Token,
  KnowledgeCollection,
  ParanetKnowledgeMinersRegistry,
  ParanetKnowledgeCollectionsRegistry,
} from '../../typechain';
import { createProfilesAndKC } from '../helpers/kc-helpers';
import { createProfile } from '../helpers/profile-helpers';
import { createMockChallenge } from '../helpers/random-sampling';
import {
  getDefaultKCCreator,
  getDefaultReceivingNodes,
  getDefaultPublishingNode,
} from '../helpers/setup-helpers';

// Fixture containing all contracts and accounts needed to test RandomSampling
type RandomSamplingFixture = {
  accounts: SignerWithAddress[];
  RandomSampling: RandomSampling;
  RandomSamplingStorage: RandomSamplingStorage;
  IdentityStorage: IdentityStorage;
  StakingStorage: StakingStorage;
  KnowledgeCollectionStorage: KnowledgeCollectionStorage;
  ProfileStorage: ProfileStorage;
  EpochStorage: EpochStorage;
  Chronos: Chronos;
  AskStorage: AskStorage;
  DelegatorsInfo: DelegatorsInfo;
  Profile: Profile;
  Hub: Hub;
  KnowledgeCollection: KnowledgeCollection;
  Token: Token;
  ParanetKnowledgeMinersRegistry: ParanetKnowledgeMinersRegistry;
  ParanetKnowledgeCollectionsRegistry: ParanetKnowledgeCollectionsRegistry;
};

describe('@integration RandomSampling', () => {
  let accounts: SignerWithAddress[];
  let RandomSampling: RandomSampling;
  let RandomSamplingStorage: RandomSamplingStorage;
  let IdentityStorage: IdentityStorage;
  let StakingStorage: StakingStorage;
  let KnowledgeCollectionStorage: KnowledgeCollectionStorage;
  let ProfileStorage: ProfileStorage;
  let EpochStorage: EpochStorage;
  let Chronos: Chronos;
  let AskStorage: AskStorage;
  let DelegatorsInfo: DelegatorsInfo;
  let Profile: Profile;
  let Hub: Hub;
  let KnowledgeCollection: KnowledgeCollection;
  let Token: Token;
  let ParanetKnowledgeMinersRegistry: ParanetKnowledgeMinersRegistry;
  let ParanetKnowledgeCollectionsRegistry: ParanetKnowledgeCollectionsRegistry;

  // Sample values for tests
  const avgBlockTimeInSeconds = 1; // Average block time

  // Deploy all contracts, set the HubOwner and necessary accounts. Returns the RandomSamplingFixture
  async function deployRandomSamplingFixture(): Promise<RandomSamplingFixture> {
    await hre.deployments.fixture([
      'KnowledgeCollection',
      'Token',
      'IdentityStorage',
      'StakingStorage',
      'ProfileStorage',
      'EpochStorage',
      'Chronos',
      'AskStorage',
      'DelegatorsInfo',
      'Profile',
      'RandomSamplingStorage',
      'RandomSampling',
      'ParanetKnowledgeMinersRegistry',
      'ParanetKnowledgeCollectionsRegistry',
    ]);

    accounts = await hre.ethers.getSigners();
    Hub = await hre.ethers.getContract<Hub>('Hub');

    // Set hub owner
    await Hub.setContractAddress('HubOwner', accounts[0].address);

    // Get contract instances
    KnowledgeCollection = await hre.ethers.getContract<KnowledgeCollection>(
      'KnowledgeCollection',
    );
    Token = await hre.ethers.getContract<Token>('Token');
    ParanetKnowledgeMinersRegistry =
      await hre.ethers.getContract<ParanetKnowledgeMinersRegistry>(
        'ParanetKnowledgeMinersRegistry',
      );
    ParanetKnowledgeCollectionsRegistry =
      await hre.ethers.getContract<ParanetKnowledgeCollectionsRegistry>(
        'ParanetKnowledgeCollectionsRegistry',
      );
    IdentityStorage =
      await hre.ethers.getContract<IdentityStorage>('IdentityStorage');
    StakingStorage =
      await hre.ethers.getContract<StakingStorage>('StakingStorage');
    KnowledgeCollectionStorage =
      await hre.ethers.getContract<KnowledgeCollectionStorage>(
        'KnowledgeCollectionStorage',
      );
    ProfileStorage =
      await hre.ethers.getContract<ProfileStorage>('ProfileStorage');
    EpochStorage = await hre.ethers.getContract<EpochStorage>('EpochStorageV8');
    Chronos = await hre.ethers.getContract<Chronos>('Chronos');
    AskStorage = await hre.ethers.getContract<AskStorage>('AskStorage');
    DelegatorsInfo =
      await hre.ethers.getContract<DelegatorsInfo>('DelegatorsInfo');
    Profile = await hre.ethers.getContract<Profile>('Profile');

    // Get RandomSampling contract after all others are registered
    RandomSampling =
      await hre.ethers.getContract<RandomSampling>('RandomSampling');
    RandomSamplingStorage = await hre.ethers.getContract<RandomSamplingStorage>(
      'RandomSamplingStorage',
    );

    // Now initialize RandomSampling manually if needed
    // This might not be necessary if initialization happens automatically in the deployment

    return {
      accounts,
      RandomSampling,
      RandomSamplingStorage,
      IdentityStorage,
      StakingStorage,
      KnowledgeCollectionStorage,
      ProfileStorage,
      EpochStorage,
      Chronos,
      AskStorage,
      DelegatorsInfo,
      Profile,
      Hub,
      KnowledgeCollection,
      Token,
      ParanetKnowledgeMinersRegistry,
      ParanetKnowledgeCollectionsRegistry,
    };
  }

  // Before each test, deploy all contracts and necessary accounts. These variables can be used in the tests
  beforeEach(async () => {
    ({
      accounts,
      IdentityStorage,
      StakingStorage,
      KnowledgeCollectionStorage,
      ProfileStorage,
      EpochStorage,
      Chronos,
      AskStorage,
      DelegatorsInfo,
      Profile,
      Hub,
      RandomSampling,
      RandomSamplingStorage,
      ParanetKnowledgeMinersRegistry,
      ParanetKnowledgeCollectionsRegistry,
    } = await loadFixture(deployRandomSamplingFixture));
  });

  describe('Contract Initialization', () => {
    it('Should return the correct name and version of the RandomSampling contract', async () => {
      const name = await RandomSampling.name();
      const version = await RandomSampling.version();
      expect(name).to.equal('RandomSampling');
      expect(version).to.equal('1.0.0');
    });

    it('Should have the correct avgBlockTimeInSeconds after initialization', async () => {
      const avgBlockTime = await RandomSampling.avgBlockTimeInSeconds();
      expect(avgBlockTime).to.equal(avgBlockTimeInSeconds);
    });

    it('Should have the correct W1 after initialization', async () => {
      const W1 = await RandomSampling.W1();
      expect(W1).to.equal(0);
    });

    it('Should have the correct W2 after initialization', async () => {
      const W2 = await RandomSampling.W2();
      expect(W2).to.equal(2);
    });

    it('Should successfully initialize with all dependent contracts', async () => {
      // Verify that all contract references are set correctly
      expect(await RandomSampling.identityStorage()).to.equal(
        await IdentityStorage.getAddress(),
      );
      expect(await RandomSampling.randomSamplingStorage()).to.equal(
        await RandomSamplingStorage.getAddress(),
      );
      expect(await RandomSampling.knowledgeCollectionStorage()).to.equal(
        await KnowledgeCollectionStorage.getAddress(),
      );
      expect(await RandomSampling.stakingStorage()).to.equal(
        await StakingStorage.getAddress(),
      );
      expect(await RandomSampling.profileStorage()).to.equal(
        await ProfileStorage.getAddress(),
      );
      expect(await RandomSampling.epochStorage()).to.equal(
        await EpochStorage.getAddress(),
      );
      expect(await RandomSampling.chronos()).to.equal(
        await Chronos.getAddress(),
      );
      expect(await RandomSampling.askStorage()).to.equal(
        await AskStorage.getAddress(),
      );
      expect(await RandomSampling.delegatorsInfo()).to.equal(
        await DelegatorsInfo.getAddress(),
      );
    });
  });

  describe('Challenge Creation and Proof Submission', () => {
    it('Should create a challenge for a node', async () => {
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);

      // Create profiles and KC first
      const { publishingNodeIdentityId } = await createProfilesAndKC(
        kcCreator,
        publishingNode,
        receivingNodes,
        {
          Profile,
          KnowledgeCollection,
          Token,
        },
      );

      // Update and get the new active proof period
      const tx =
        await RandomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
      await tx.wait();

      const proofPeriodStatus =
        await RandomSamplingStorage.getActiveProofPeriodStatus();
      const proofPeriodStartBlock =
        proofPeriodStatus.activeProofPeriodStartBlock;
      // Create challenge
      const challengeTx = await RandomSampling.connect(
        publishingNode.operational,
      ).createChallenge();
      await challengeTx.wait();

      // Get the challenge from storage to verify it
      const challenge = await RandomSamplingStorage.getNodeChallenge(
        publishingNodeIdentityId,
      );

      const proofPeriodDuration =
        await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks();

      // Verify challenge properties
      expect(challenge.knowledgeCollectionId).to.be.a('bigint');
      expect(challenge.chunkId).to.be.a('bigint');
      expect(challenge.epoch).to.be.a('bigint');
      expect(challenge.activeProofPeriodStartBlock).to.be.a('bigint');
      expect(challenge.proofingPeriodDurationInBlocks).to.be.a('bigint');
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(challenge.solved).to.be.false;

      expect(challenge.knowledgeCollectionId).to.be.equal(1n);
      expect(challenge.epoch).to.be.equal(1n);
      expect(challenge.activeProofPeriodStartBlock).to.be.equal(
        proofPeriodStartBlock,
      );
      expect(challenge.proofingPeriodDurationInBlocks).to.be.equal(
        proofPeriodDuration,
      );
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(challenge.solved).to.be.false;
    });

    it('Should return an empty challenge if already solved for current period', async () => {
      // Create profile and identity first
      const publishingNode = getDefaultPublishingNode(accounts);
      const { identityId } = await createProfile(Profile, publishingNode);

      // Create a mock challenge that's marked as solved
      const mockChallenge = await createMockChallenge(
        RandomSamplingStorage,
        Chronos,
      );

      // Store the mock challenge in the storage contract
      await RandomSamplingStorage.setNodeChallenge(identityId, mockChallenge);

      // Try to create a new challenge for the same period
      const challengeTx = await RandomSampling.connect(
        publishingNode.operational,
      ).createChallenge();
      await challengeTx.wait();

      // Get the challenge from the transaction return value
      const challenge =
        await RandomSamplingStorage.getNodeChallenge(identityId);

      // Since the challenge was solved, the challenge should still be marked as solved
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(challenge.solved).to.be.true;
    });
  });

  describe('Score Calculation', () => {
    // TODO: Should calculate node scores correctly upon valid proof submission
    // TODO: Should calculate delegator scores correctly
  });

  describe('Admin Functions', () => {
    it('Should allow only hub owner to update average block time', async () => {
      const newAvgBlockTime = 15;

      // Non-hub owner should fail
      await expect(
        RandomSampling.connect(accounts[1]).setAvgBlockTimeInSeconds(
          newAvgBlockTime,
        ),
      ).to.be.reverted;

      // Hub owner should succeed
      await RandomSampling.connect(accounts[0]).setAvgBlockTimeInSeconds(
        newAvgBlockTime,
      );
      expect(await RandomSampling.avgBlockTimeInSeconds()).to.equal(
        newAvgBlockTime,
      );
    });
  });
});
