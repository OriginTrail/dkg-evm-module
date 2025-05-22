import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
// @ts-expect-error: No type definitions available for assertion-tools
import { kcTools } from 'assertion-tools';
import { expect } from 'chai';
import hre, { ethers } from 'hardhat';

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
  Staking,
  ShardingTableStorage,
  ShardingTable,
  ParametersStorage,
  Ask,
} from '../../typechain';
import { createKnowledgeCollection } from '../helpers/kc-helpers';
import { createProfile, createProfiles } from '../helpers/profile-helpers';
import {
  getDefaultKCCreator,
  getDefaultReceivingNodes,
  getDefaultPublishingNode,
  setupNodeWithStakeAndAsk,
  setNodeStake,
} from '../helpers/setup-helpers';

// Sample values for tests
const avgBlockTimeInSeconds = 1; // Average block time
const SCALING_FACTOR = 10n ** 18n;
const quads = [
  '<urn:us-cities:info:new-york> <http://schema.org/area> "468.9 sq mi" .',
  '<urn:us-cities:info:new-york> <http://schema.org/name> "New York" .',
  '<urn:us-cities:info:new-york> <http://schema.org/population> "8,336,817" .',
  '<urn:us-cities:info:new-york> <http://schema.org/state> "New York" .',
  '<urn:us-cities:info:new-york> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://schema.org/City> .',
  '<uuid:a1a241ad-9f62-4dcc-94b6-f59b299dee0a> <https://ontology.origintrail.io/dkg/1.0#privateMerkleRoot> "0xaac2a420672a1eb77506c544ff01beed2be58c0ee3576fe037c846f97481cefd" .',
  '<https://ontology.origintrail.io/dkg/1.0#metadata-hash:0x5cb6421dd41c7a62a84c223779303919e7293753d8a1f6f49da2e598013fe652> <https://ontology.origintrail.io/dkg/1.0#representsPrivateResource> <uuid:396b91f8-977b-4f5d-8658-bc4bc195ba3c> .',
  '<https://ontology.origintrail.io/dkg/1.0#metadata-hash:0x6a2292b30c844d2f8f2910bf11770496a3a79d5a6726d1b2fd3ddd18e09b5850> <https://ontology.origintrail.io/dkg/1.0#representsPrivateResource> <uuid:7eab0ccb-dd6c-4f81-a342-3c22e6276ec5> .',
  '<https://ontology.origintrail.io/dkg/1.0#metadata-hash:0xc1f682b783b1b93c9d5386eb1730c9647cf4b55925ec24f5e949e7457ba7bfac> <https://ontology.origintrail.io/dkg/1.0#representsPrivateResource> <uuid:8b843b0c-33d8-4546-9a6d-207fd22c793c> .',
];
// Generate the Merkle tree and get the root
const merkleRoot = kcTools.calculateMerkleRoot(quads, 32);

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
  Staking: Staking;
  ShardingTableStorage: ShardingTableStorage;
  ShardingTable: ShardingTable;
  ParametersStorage: ParametersStorage;
  Ask: Ask;
};

async function calculateExpectedNodeScore(
  identityId: bigint,
  nodeStake: bigint,
  deps: {
    ParametersStorage: ParametersStorage;
    ProfileStorage: ProfileStorage;
    AskStorage: AskStorage;
    EpochStorage: EpochStorage;
  },
): Promise<bigint> {
  const { ParametersStorage, ProfileStorage, AskStorage, EpochStorage } = deps;
  // Cap stake at maximum
  const maximumStake = await ParametersStorage.maximumStake();
  const cappedStake = nodeStake > maximumStake ? maximumStake : nodeStake;

  // 1. Stake Factor
  const stakeDivisor = 2000000n; // Magic number from contract
  const stakeRatio = cappedStake / stakeDivisor;
  const nodeStakeFactor = (2n * stakeRatio ** 2n) / SCALING_FACTOR;

  // 2. Ask Factor
  const nodeAsk = await ProfileStorage.getAsk(identityId);
  const nodeAskScaled = nodeAsk * SCALING_FACTOR;
  const [askLowerBound, askUpperBound] = await AskStorage.getAskBounds();
  let nodeAskFactor = 0n;

  if (nodeAskScaled <= askUpperBound && nodeAskScaled >= askLowerBound) {
    const askBoundsDiff = askUpperBound - askLowerBound;
    if (askBoundsDiff > 0n) {
      // Prevent division by zero
      const askDiffRatio =
        ((askUpperBound - nodeAskScaled) * SCALING_FACTOR) / askBoundsDiff;
      // Ensure intermediate multiplication doesn't overflow - use SCALING_FACTOR**2n directly
      nodeAskFactor =
        (stakeRatio * askDiffRatio ** 2n) / (SCALING_FACTOR * SCALING_FACTOR);
    } else {
      // If bounds are equal and ask matches, ratio is effectively 0 or 1 depending on perspective,
      // but safer to assign 0 as boundsDiff is 0.
      nodeAskFactor = 0n;
    }
  }

  // 3. Publishing Factor
  // Assuming this test runs in an epoch where production has happened
  const nodePubFactor =
    await EpochStorage.getNodeCurrentEpochProducedKnowledgeValue(identityId);
  const maxNodePubFactor =
    await EpochStorage.getCurrentEpochNodeMaxProducedKnowledgeValue();
  let nodePublishingFactor = 0n;
  if (maxNodePubFactor > 0n) {
    // Prevent division by zero
    const pubRatio = (nodePubFactor * SCALING_FACTOR) / maxNodePubFactor;
    nodePublishingFactor = (nodeStakeFactor * pubRatio) / SCALING_FACTOR;
  }

  return nodeStakeFactor + nodePublishingFactor + nodeAskFactor;
}

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
  let Ask: Ask;
  let DelegatorsInfo: DelegatorsInfo;
  let Profile: Profile;
  let Hub: Hub;
  let KnowledgeCollection: KnowledgeCollection;
  let Token: Token;
  let Staking: Staking;
  let ShardingTableStorage: ShardingTableStorage;
  let ShardingTable: ShardingTable;
  let ParametersStorage: ParametersStorage;
  let ParanetKnowledgeMinersRegistry: ParanetKnowledgeMinersRegistry;
  let ParanetKnowledgeCollectionsRegistry: ParanetKnowledgeCollectionsRegistry;

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
      'Staking',
      'Ask',
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
    Staking = await hre.ethers.getContract<Staking>('Staking');
    ShardingTableStorage = await hre.ethers.getContract<ShardingTableStorage>(
      'ShardingTableStorage',
    );
    ShardingTable =
      await hre.ethers.getContract<ShardingTable>('ShardingTable');
    ParametersStorage =
      await hre.ethers.getContract<ParametersStorage>('ParametersStorage');
    Ask = await hre.ethers.getContract<Ask>('Ask');

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
      Staking,
      ShardingTableStorage,
      ShardingTable,
      ParametersStorage,
      Ask,
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
      Staking,
      ShardingTableStorage,
      ShardingTable,
      ParametersStorage,
      Ask,
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
      const W1 = await RandomSampling.w1();
      expect(W1).to.equal(0);
    });

    it('Should have the correct W2 after initialization', async () => {
      const W2 = await RandomSampling.w2();
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

  describe('Proofing Period Duration Management', () => {
    it('Should add proofing period duration if none is pending', async () => {
      // Setup
      const currentEpoch = await Chronos.getCurrentEpoch();
      const initialDuration =
        await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks();
      const newDuration = initialDuration + 10n;
      const expectedEffectiveEpoch = currentEpoch + 1n;
      const hubOwner = accounts[0];

      // Ensure no pending change initially
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(
        await RandomSamplingStorage.isPendingProofingPeriodDuration(),
        'Should be no pending duration initially',
      ).to.be.false;

      // Action
      const setDurationTx =
        await RandomSampling.connect(
          hubOwner,
        ).setProofingPeriodDurationInBlocks(newDuration);

      // Verification
      // 1. Event Emission
      await expect(setDurationTx)
        .to.emit(RandomSamplingStorage, 'ProofingPeriodDurationAdded')
        .withArgs(newDuration, expectedEffectiveEpoch);

      // 2. Pending state updated
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(
        await RandomSamplingStorage.isPendingProofingPeriodDuration(),
        'Should be a pending duration after setting',
      ).to.be.true;

      // 3. Active duration remains unchanged in the current epoch
      expect(
        await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks(),
        'Active duration should remain unchanged in current epoch',
      ).to.equal(initialDuration);
    });

    it('Should replace pending proofing period duration if one exists', async () => {
      // Setup
      const currentEpoch = await Chronos.getCurrentEpoch();
      const avgBlockTimeInSeconds =
        await RandomSampling.avgBlockTimeInSeconds();
      const initialDuration =
        await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks();
      const firstNewDuration = initialDuration + 10n;
      const secondNewDuration = firstNewDuration + 10n;
      const expectedEffectiveEpoch = currentEpoch + 1n;
      const hubOwner = accounts[0];

      // Add the first pending change
      await RandomSampling.connect(hubOwner).setProofingPeriodDurationInBlocks(
        firstNewDuration,
      );
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(
        await RandomSamplingStorage.isPendingProofingPeriodDuration(),
        'Should have pending duration after first set',
      ).to.be.true;

      // Action: Replace the pending change
      const replaceDurationTx =
        await RandomSampling.connect(
          hubOwner,
        ).setProofingPeriodDurationInBlocks(secondNewDuration);

      // Verification
      // 1. Event Emission
      await expect(replaceDurationTx)
        .to.emit(RandomSamplingStorage, 'PendingProofingPeriodDurationReplaced')
        .withArgs(firstNewDuration, secondNewDuration, expectedEffectiveEpoch);

      // 2. Pending state remains true
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(
        await RandomSamplingStorage.isPendingProofingPeriodDuration(),
        'Should still have pending duration after replace',
      ).to.be.true;

      // 3. Active duration remains unchanged in the current epoch
      expect(
        await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks(),
        'Active duration should remain unchanged',
      ).to.equal(initialDuration);

      // 4. Check the actual pending value
      // Advance to the effective epoch
      const timeUntilNextEpoch = await Chronos.timeUntilNextEpoch();
      const blocksUntilNextEpoch =
        Number(timeUntilNextEpoch) / Number(avgBlockTimeInSeconds) + 10;
      for (let i = 0; i < blocksUntilNextEpoch; i++) {
        await hre.network.provider.send('evm_mine');
      }

      expect(
        await Chronos.getCurrentEpoch(),
        'Should be in the next epoch',
      ).to.equal(expectedEffectiveEpoch);
      expect(
        await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks(),
        'Active duration should be updated in effective epoch',
      ).to.equal(secondNewDuration);
    });

    it('Should correctly apply the new duration only in the effective epoch', async () => {
      // Setup
      const currentEpoch = await Chronos.getCurrentEpoch();
      const effectiveEpoch = currentEpoch + 1n;
      const initialDuration =
        await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks();
      const newDuration = initialDuration + 20n; // Different new duration
      const hubOwner = accounts[0];
      const avgBlockTime = await RandomSampling.avgBlockTimeInSeconds();

      // Schedule change for next epoch
      await RandomSampling.connect(hubOwner).setProofingPeriodDurationInBlocks(
        newDuration,
      );
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(
        await RandomSamplingStorage.isPendingProofingPeriodDuration(),
        'Duration change should be pending',
      ).to.be.true;

      // Ensure activeProofPeriodStartBlock is initialized if needed
      let initialStartBlockE = (
        await RandomSamplingStorage.getActiveProofPeriodStatus()
      ).activeProofPeriodStartBlock;
      if (initialStartBlockE === 0n) {
        await RandomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
        initialStartBlockE = (
          await RandomSamplingStorage.getActiveProofPeriodStatus()
        ).activeProofPeriodStartBlock;
      }
      expect(initialStartBlockE).to.be.greaterThan(
        0n,
        'Initial start block should be > 0',
      );

      // --- Verification in Current Epoch (Epoch E) ---
      expect(
        await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks(),
        'Active duration should be initial in Epoch E',
      ).to.equal(initialDuration);

      // Advance blocks within Epoch E by the initial duration
      for (let i = 0; i < Number(initialDuration); i++) {
        await hre.network.provider.send('evm_mine');
      }

      // Update period and check if it used the initial duration
      await RandomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
      const updatedStartBlockE = (
        await RandomSamplingStorage.getActiveProofPeriodStatus()
      ).activeProofPeriodStartBlock;
      expect(updatedStartBlockE).to.equal(
        initialStartBlockE + initialDuration,
        'Start block should advance by initial duration in Epoch E',
      );

      // --- Advance to Next Epoch (Epoch E+1) ---
      const timeUntilNextEpoch = await Chronos.timeUntilNextEpoch();
      const blocksUntilNextEpoch =
        timeUntilNextEpoch > 0n
          ? Number(timeUntilNextEpoch / avgBlockTime) + 1 // Ensure we pass the epoch boundary
          : 1; // If already at boundary, just mine one block
      for (let i = 0; i < blocksUntilNextEpoch; i++) {
        await hre.network.provider.send('evm_mine');
      }

      expect(
        await Chronos.getCurrentEpoch(),
        'Should now be in the effective epoch',
      ).to.equal(effectiveEpoch);

      // --- Verification in Effective Epoch (Epoch E+1) ---
      expect(
        await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks(),
        'Active duration should be new in Epoch E+1',
      ).to.equal(newDuration);

      // Get the start block relevant for this new epoch
      // It might have carried over or been updated by the block advance
      await RandomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
      const startBlockE1 = (
        await RandomSamplingStorage.getActiveProofPeriodStatus()
      ).activeProofPeriodStartBlock;

      // Advance blocks within Epoch E+1 by the *new* duration
      for (let i = 0; i < Number(newDuration); i++) {
        await hre.network.provider.send('evm_mine');
      }

      // Update period and check if it used the new duration
      await RandomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
      const updatedStartBlockE1 = (
        await RandomSamplingStorage.getActiveProofPeriodStatus()
      ).activeProofPeriodStartBlock;
      expect(updatedStartBlockE1).to.equal(
        startBlockE1 + newDuration,
        'Start block should advance by new duration in Epoch E+1',
      );
    });
  });

  describe('Challenge Creation', () => {
    it('Should revert if an unsolved challenge already exists for this node in the current proof period', async () => {
      // creator of the KC
      const kcCreator = getDefaultKCCreator(accounts);
      // create a publishing node with stake and ask
      const nodeAsk = 200000000000000000n; // Same as 0.2 ETH
      const minStake = await ParametersStorage.minimumStake();
      const deps = {
        accounts,
        Profile,
        Token,
        Staking,
        Ask,
        KnowledgeCollection,
      };
      const { node: publishingNode, identityId: publishingNodeIdentityId } =
        await setupNodeWithStakeAndAsk(1, minStake, 100n, deps);
      // create receiving nodes
      const receivingNodes = [];
      const receivingNodesIdentityIds = [];
      for (let i = 0; i < 5; i++) {
        const { node, identityId } = await setupNodeWithStakeAndAsk(
          i + 10,
          minStake,
          nodeAsk,
          deps,
        );
        receivingNodes.push(node);
        receivingNodesIdentityIds.push(identityId);
      }

      await createKnowledgeCollection(
        kcCreator,
        publishingNode,
        publishingNodeIdentityId,
        receivingNodes,
        receivingNodesIdentityIds,
        deps,
        merkleRoot,
      );

      // Create first challenge
      const tx1 = await RandomSampling.connect(
        publishingNode.operational,
      ).createChallenge();
      await tx1.wait();
      const challenge1 = await RandomSamplingStorage.getNodeChallenge(
        publishingNodeIdentityId,
      );

      // Mine some blocks but stay within the period
      const duration =
        await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks();
      if (Number(duration) > 2) {
        await hre.network.provider.send('evm_mine');
      }

      // Attempt to create second challenge - should revert
      const tx2 = RandomSampling.connect(
        publishingNode.operational,
      ).createChallenge();
      await expect(tx2).to.be.revertedWith(
        'An unsolved challenge already exists for this node in the current proof period',
      );

      // Verify stored challenge hasn't changed
      const challenge2 = await RandomSamplingStorage.getNodeChallenge(
        publishingNodeIdentityId,
      );
      expect(challenge2.knowledgeCollectionId).to.equal(
        challenge1.knowledgeCollectionId,
      );
      expect(challenge2.chunkId).to.equal(challenge1.chunkId);
      expect(challenge2.epoch).to.equal(challenge1.epoch);
      expect(challenge2.activeProofPeriodStartBlock).to.equal(
        challenge1.activeProofPeriodStartBlock,
      );
      expect(challenge2.proofingPeriodDurationInBlocks).to.equal(
        challenge1.proofingPeriodDurationInBlocks,
      );
      expect(challenge2.solved).to.equal(challenge1.solved); // Both false
    });

    it('Should revert if the challenge for this proof period has already been solved', async () => {
      // Create profile and identity first
      const kcCreator = getDefaultKCCreator(accounts);
      const nodeAsk = 200000000000000000n; // Same as 0.2 ETH
      const minStake = await ParametersStorage.minimumStake();
      const deps = {
        accounts,
        Profile,
        Token,
        Staking,
        Ask,
        KnowledgeCollection,
      };
      const { node: publishingNode, identityId: publishingNodeIdentityId } =
        await setupNodeWithStakeAndAsk(1, minStake, nodeAsk, deps);

      const receivingNodes = [];
      const receivingNodesIdentityIds = [];
      for (let i = 0; i < 5; i++) {
        const { node, identityId } = await setupNodeWithStakeAndAsk(
          i + 10,
          minStake,
          nodeAsk,
          deps,
        );
        receivingNodes.push(node);
        receivingNodesIdentityIds.push(identityId);
      }

      await createKnowledgeCollection(
        kcCreator,
        publishingNode,
        publishingNodeIdentityId,
        receivingNodes,
        receivingNodesIdentityIds,
        deps,
        merkleRoot,
      );

      // Create first challenge
      const tx1 = await RandomSampling.connect(
        publishingNode.operational,
      ).createChallenge();
      await tx1.wait();
      const challenge = await RandomSamplingStorage.getNodeChallenge(
        publishingNodeIdentityId,
      );

      // Mark the challenge as solved
      const solvedChallenge = {
        knowledgeCollectionId: challenge.knowledgeCollectionId,
        chunkId: challenge.chunkId,
        knowledgeCollectionStorageContract:
          challenge.knowledgeCollectionStorageContract,
        epoch: challenge.epoch,
        activeProofPeriodStartBlock: challenge.activeProofPeriodStartBlock,
        proofingPeriodDurationInBlocks:
          challenge.proofingPeriodDurationInBlocks,
        solved: true,
      };

      // Store the mock challenge in the storage contract
      await RandomSamplingStorage.setNodeChallenge(
        publishingNodeIdentityId,
        solvedChallenge,
      );

      // Try to create a new challenge for the same period - should revert
      const challengeTx = RandomSampling.connect(
        publishingNode.operational,
      ).createChallenge();
      await expect(challengeTx).to.be.revertedWith(
        'The challenge for this proof period has already been solved',
      );
    });

    it('Should revert if no Knowledge Collections exist in the system', async () => {
      // Setup a node profile
      const publishingNode = getDefaultPublishingNode(accounts);

      const { identityId: publishingNodeIdentityId } = await createProfile(
        Profile,
        publishingNode,
      );

      const minStake = await ParametersStorage.minimumStake();
      await setNodeStake(
        publishingNode,
        BigInt(publishingNodeIdentityId),
        BigInt(minStake),
        {
          Token,
          Staking,
          Ask,
        },
      );
      await Profile.connect(publishingNode.operational).updateAsk(
        BigInt(publishingNodeIdentityId),
        100n,
      );
      await Ask.connect(accounts[0]).recalculateActiveSet();

      // Ensure no KCs are created or they are expired (by default none are created here)

      // Attempt to create challenge
      const createTx = RandomSampling.connect(
        publishingNode.operational,
      ).createChallenge();

      // Verification
      await expect(createTx).to.be.revertedWith(
        'No knowledge collections exist',
      );
    });

    it('Should set the node challenge successfully and emit ChallengeCreated event', async () => {
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);

      // Create profiles and KC first
      const contracts = {
        Profile,
        KnowledgeCollection,
        Token,
      };

      const { identityId: publishingNodeIdentityId } = await createProfile(
        contracts.Profile,
        publishingNode,
      );
      const receivingNodesIdentityIds = (
        await createProfiles(contracts.Profile, receivingNodes)
      ).map((p) => p.identityId);

      await createKnowledgeCollection(
        kcCreator,
        publishingNode,
        publishingNodeIdentityId,
        receivingNodes,
        receivingNodesIdentityIds,
        contracts,
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
      const receipt = await challengeTx.wait();

      // Get the challenge from storage to verify it
      const challenge = await RandomSamplingStorage.getNodeChallenge(
        publishingNodeIdentityId,
      );

      await expect(receipt)
        .to.emit(RandomSampling, 'ChallengeCreated')
        .withArgs(
          publishingNodeIdentityId,
          challenge.epoch,
          challenge.knowledgeCollectionId,
          challenge.chunkId,
          proofPeriodStartBlock,
          challenge.proofingPeriodDurationInBlocks,
        );

      const proofPeriodDuration =
        await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks();

      // Verify challenge properties
      expect(challenge.knowledgeCollectionId)
        .to.be.a('bigint')
        .and.to.be.equal(1n);
      expect(challenge.chunkId).to.be.a('bigint').and.to.be.greaterThan(0n);
      expect(challenge.epoch).to.be.a('bigint').and.to.be.equal(1n);
      expect(challenge.activeProofPeriodStartBlock)
        .to.be.a('bigint')
        .and.to.be.equal(proofPeriodStartBlock);
      expect(challenge.proofingPeriodDurationInBlocks)
        .to.be.a('bigint')
        .and.to.be.equal(proofPeriodDuration);
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(challenge.solved).to.be.false;
    });

    it('Should revert if it fails to find a Knowledge Collection that is active in the current epoch', async () => {
      // Setup: create node profile/stake/ask
      const nodeAsk = 200000000000000000n;
      const minStake = await ParametersStorage.minimumStake();
      const deps = {
        accounts,
        Profile,
        Token,
        Staking,
        Ask,
        KnowledgeCollection,
      };
      const { node: publishingNode, identityId: publishingNodeIdentityId } =
        await setupNodeWithStakeAndAsk(1, minStake, nodeAsk, deps);

      // Create a KC but set its endEpoch to be in the past (e.g., epoch 0)
      const kcCreator = getDefaultKCCreator(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);
      const receivingNodesIdentityIds = (
        await createProfiles(Profile, receivingNodes)
      ).map((p) => p.identityId);
      const currentEpoch = await Chronos.getCurrentEpoch();
      expect(currentEpoch).to.be.greaterThan(
        0n,
        'Test requires current epoch > 0',
      ); // Ensure test premise is valid

      // Use createKnowledgeCollection helper, setting endEpoch manually if possible,
      // or directly interact with KnowledgeCollection contract

      const epochs = 1;

      await createKnowledgeCollection(
        kcCreator,
        publishingNode,
        publishingNodeIdentityId,
        receivingNodes,
        receivingNodesIdentityIds,
        deps,
      );

      // Advance to epochs + 10
      for (let i = 0; i < epochs + 10; i++) {
        const timeUntilNextEpoch = await Chronos.timeUntilNextEpoch();
        const blocksUntilNextEpoch =
          Number(timeUntilNextEpoch) / Number(avgBlockTimeInSeconds) + 5;
        for (let i = 0; i < blocksUntilNextEpoch; i++) {
          await hre.network.provider.send('evm_mine');
        }
      }

      // Action: Call createChallenge
      const createTx = RandomSampling.connect(
        publishingNode.operational,
      ).createChallenge();

      // Verification: Expect revert with the specific message
      await expect(createTx).to.be.revertedWith(
        'Failed to find a knowledge collection that is active in the current epoch',
      );
    });
  });

  describe('Proof Submission', () => {
    it('Should revert if challenge is no longer active', async () => {
      // Setup
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);
      const contracts = {
        Profile,
        KnowledgeCollection,
        Token,
      };

      const { identityId: publishingNodeIdentityId } = await createProfile(
        contracts.Profile,
        publishingNode,
      );
      const receivingNodesIdentityIds = (
        await createProfiles(contracts.Profile, receivingNodes)
      ).map((p) => p.identityId);

      await createKnowledgeCollection(
        kcCreator,
        publishingNode,
        publishingNodeIdentityId,
        receivingNodes,
        receivingNodesIdentityIds,
        contracts,
      );
      const minStake = await ParametersStorage.minimumStake();
      await setNodeStake(
        publishingNode,
        BigInt(publishingNodeIdentityId),
        BigInt(minStake),
        { Token, Staking, Ask },
      );
      await Profile.connect(publishingNode.operational).updateAsk(
        BigInt(publishingNodeIdentityId),
        100n,
      );
      await Ask.connect(accounts[0]).recalculateActiveSet();

      // Create challenge
      await RandomSampling.connect(
        publishingNode.operational,
      ).createChallenge();
      const challenge = await RandomSamplingStorage.getNodeChallenge(
        publishingNodeIdentityId,
      );

      // Advance time past the end of the proof period
      const duration = challenge.proofingPeriodDurationInBlocks;
      // Move past the end block
      for (let i = 0; i < Number(duration) + 1; i++) {
        await hre.network.provider.send('evm_mine');
      }

      // Try to submit proof
      const chunks = kcTools.splitIntoChunks(quads, 32);
      const challengeChunk = chunks[challenge.chunkId];
      const { proof } = kcTools.calculateMerkleProof(
        quads,
        32,
        Number(challenge.chunkId),
      );

      const submitProofTx = RandomSampling.connect(
        publishingNode.operational,
      ).submitProof(challengeChunk, proof);

      // We check the return value if the function signature allows, or check state hasn't changed.
      // In this case, checking the stored challenge state:
      await expect(submitProofTx).to.be.revertedWith(
        'This challenge is no longer active',
      );
    });

    it("Should revert with MerkleRootMismatchError if merkle roots don't match", async () => {
      // Setup
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);
      const contracts = {
        Profile,
        KnowledgeCollection,
        Token,
      };

      const { identityId: publishingNodeIdentityId } = await createProfile(
        contracts.Profile,
        publishingNode,
      );
      const receivingNodesIdentityIds = (
        await createProfiles(contracts.Profile, receivingNodes)
      ).map((p) => p.identityId);

      await createKnowledgeCollection(
        kcCreator,
        publishingNode,
        publishingNodeIdentityId,
        receivingNodes,
        receivingNodesIdentityIds,
        contracts,
      );
      const minStake = await ParametersStorage.minimumStake();
      await setNodeStake(
        publishingNode,
        BigInt(publishingNodeIdentityId),
        BigInt(minStake),
        { Token, Staking, Ask },
      );
      await Profile.connect(publishingNode.operational).updateAsk(
        publishingNodeIdentityId,
        100n,
      );
      await Ask.connect(accounts[0]).recalculateActiveSet();

      // Create challenge
      const challengeTx = await RandomSampling.connect(
        publishingNode.operational,
      ).createChallenge();
      await challengeTx.wait();
      const challenge = await RandomSamplingStorage.getNodeChallenge(
        publishingNodeIdentityId,
      );

      // Generate invalid proof data
      const chunks = kcTools.splitIntoChunks(quads, 32);
      const correctChunk = chunks[challenge.chunkId];
      const wrongChunk =
        challenge.chunkId + 1n < chunks.length
          ? chunks[challenge.chunkId + 1n]
          : challenge.chunkId > 0
            ? chunks[challenge.chunkId - 1n]
            : 'invalid chunk data';
      const { proof: correctProof } = kcTools.calculateMerkleProof(
        quads,
        32,
        challenge.chunkId,
      );
      const wrongProof: string[] = [];

      // Try submitting correct proof with wrong chunk
      const submitWrongChunkTx = RandomSampling.connect(
        publishingNode.operational,
      ).submitProof(wrongChunk, correctProof);
      await expect(submitWrongChunkTx).to.be.revertedWithCustomError(
        RandomSampling,
        'MerkleRootMismatchError',
      );
      let finalChallenge = await RandomSamplingStorage.getNodeChallenge(
        publishingNodeIdentityId,
      );
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(finalChallenge.solved).to.be.false; // Ensure state unchanged

      // Try submitting correct chunk with wrong proof
      const submitWrongProofTx = RandomSampling.connect(
        publishingNode.operational,
      ).submitProof(correctChunk, wrongProof);
      await expect(submitWrongProofTx).to.be.revertedWithCustomError(
        RandomSampling,
        'MerkleRootMismatchError',
      );
      finalChallenge = await RandomSamplingStorage.getNodeChallenge(
        publishingNodeIdentityId,
      );
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(finalChallenge.solved).to.be.false; // Ensure state unchanged
    });

    it('Should submit a valid proof and successfully update challenge state (solved=true)', async () => {
      const kcCreator = getDefaultKCCreator(accounts);
      const minStake = await ParametersStorage.minimumStake();
      const nodeAsk = 200000000000000000n; // Same as 0.2 ETH
      const deps = {
        accounts,
        Profile,
        Token,
        Staking,
        Ask,
        KnowledgeCollection,
      };

      const { node: publishingNode, identityId: publishingNodeIdentityId } =
        await setupNodeWithStakeAndAsk(1, minStake, nodeAsk, deps);

      const receivingNodes = [];
      const receivingNodesIdentityIds = [];
      for (let i = 0; i < 5; i++) {
        const { node, identityId } = await setupNodeWithStakeAndAsk(
          i + 10,
          minStake,
          nodeAsk,
          deps,
        );
        receivingNodes.push(node);
        receivingNodesIdentityIds.push(identityId);
      }

      await createKnowledgeCollection(
        kcCreator,
        publishingNode,
        publishingNodeIdentityId,
        receivingNodes,
        receivingNodesIdentityIds,
        deps,
        merkleRoot,
      );

      // Update and get the new active proof period
      await RandomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();

      // Create challenge
      const challengeTx = await RandomSampling.connect(
        publishingNode.operational,
      ).createChallenge();
      await challengeTx.wait();

      // Get the challenge from storage to verify it
      let challenge = await RandomSamplingStorage.getNodeChallenge(
        publishingNodeIdentityId,
      );

      // Get chunk from quads
      const chunks = kcTools.splitIntoChunks(quads, 32);
      const challengeChunk = chunks[challenge.chunkId];

      // Generate a proof for our challenge chunk
      const { proof } = kcTools.calculateMerkleProof(
        quads,
        32,
        Number(challenge.chunkId),
      );

      // Submit proof
      await RandomSampling.connect(publishingNode.operational).submitProof(
        challengeChunk,
        proof,
      );

      // Get the challenge from storage to verify it
      challenge = await RandomSamplingStorage.getNodeChallenge(
        publishingNodeIdentityId,
      );

      // Since the challenge was solved, the challenge should be marked as solved
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(challenge.solved).to.be.true;
    });

    it('Should submit a valid proof and successfully increment epochNodeValidProofsCount', async () => {
      const kcCreator = getDefaultKCCreator(accounts);
      const minStake = await ParametersStorage.minimumStake();
      const nodeAsk = 200000000000000000n; // Same as 0.2 ETH
      const deps = {
        accounts,
        Profile,
        Token,
        Staking,
        Ask,
        KnowledgeCollection,
      };

      const { node: publishingNode, identityId: publishingNodeIdentityId } =
        await setupNodeWithStakeAndAsk(1, minStake, nodeAsk, deps);

      const receivingNodes = [];
      const receivingNodesIdentityIds = [];
      for (let i = 0; i < 5; i++) {
        const { node, identityId } = await setupNodeWithStakeAndAsk(
          i + 10,
          minStake,
          nodeAsk,
          deps,
        );
        receivingNodes.push(node);
        receivingNodesIdentityIds.push(identityId);
      }

      await createKnowledgeCollection(
        kcCreator,
        publishingNode,
        publishingNodeIdentityId,
        receivingNodes,
        receivingNodesIdentityIds,
        deps,
        merkleRoot,
      );

      // Update and get the new active proof period
      await RandomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();

      // Create challenge
      await RandomSampling.connect(
        publishingNode.operational,
      ).createChallenge();

      // Get the challenge from storage to verify it
      let challenge = await RandomSamplingStorage.getNodeChallenge(
        publishingNodeIdentityId,
      );

      // Get chunk from quads
      const chunks = kcTools.splitIntoChunks(quads, 32);
      const challengeChunk = chunks[challenge.chunkId];

      // Generate a proof for our challenge chunk
      const { proof } = kcTools.calculateMerkleProof(
        quads,
        32,
        Number(challenge.chunkId),
      );

      // Submit proof
      await RandomSampling.connect(publishingNode.operational).submitProof(
        challengeChunk,
        proof,
      );

      // Get the challenge from storage to verify it
      challenge = await RandomSamplingStorage.getNodeChallenge(
        publishingNodeIdentityId,
      );

      // Verify that epochNodeValidProofsCount was incremented
      const epochNodeValidProofsCount =
        await RandomSamplingStorage.getEpochNodeValidProofsCount(
          challenge.epoch,
          publishingNodeIdentityId,
        );
      expect(epochNodeValidProofsCount).to.equal(1n);
    });

    it('Should submit a valid proof and successfully emit ValidProofSubmitted event with correct parameters', async () => {
      const kcCreator = getDefaultKCCreator(accounts);
      const minStake = await ParametersStorage.minimumStake();
      const nodeAsk = 200000000000000000n; // Same as 0.2 ETH
      const deps = {
        accounts,
        Profile,
        Token,
        Staking,
        Ask,
        KnowledgeCollection,
      };

      const { node: publishingNode, identityId: publishingNodeIdentityId } =
        await setupNodeWithStakeAndAsk(1, minStake, nodeAsk, deps);

      const receivingNodes = [];
      const receivingNodesIdentityIds = [];
      for (let i = 0; i < 5; i++) {
        const { node, identityId } = await setupNodeWithStakeAndAsk(
          i + 10,
          minStake,
          nodeAsk,
          deps,
        );
        receivingNodes.push(node);
        receivingNodesIdentityIds.push(identityId);
      }

      await createKnowledgeCollection(
        kcCreator,
        publishingNode,
        publishingNodeIdentityId,
        receivingNodes,
        receivingNodesIdentityIds,
        deps,
        merkleRoot,
      );

      // Update and get the new active proof period
      await RandomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();

      // Create challenge
      await RandomSampling.connect(
        publishingNode.operational,
      ).createChallenge();

      // Get the challenge from storage to verify it
      let challenge = await RandomSamplingStorage.getNodeChallenge(
        publishingNodeIdentityId,
      );

      // Get chunk from quads
      const chunks = kcTools.splitIntoChunks(quads, 32);
      const challengeChunk = chunks[challenge.chunkId];

      // Generate a proof for our challenge chunk
      const { proof } = kcTools.calculateMerkleProof(
        quads,
        32,
        Number(challenge.chunkId),
      );

      // Submit proof
      const receipt = await RandomSampling.connect(
        publishingNode.operational,
      ).submitProof(challengeChunk, proof);

      // Get the challenge from storage to verify it
      challenge = await RandomSamplingStorage.getNodeChallenge(
        publishingNodeIdentityId,
      );

      // Verify that epochNodeValidProofsCount was incremented
      await expect(receipt)
        .to.emit(RandomSampling, 'ValidProofSubmitted')
        .withArgs(
          publishingNodeIdentityId,
          challenge.epoch,
          (score: bigint) => score > 0,
        );
    });

    it('Should submit a valid proof and successfully and add score to nodeEpochProofPeriodScore and allNodesEpochProofPeriodScore', async () => {
      const kcCreator = getDefaultKCCreator(accounts);
      const minStake = await ParametersStorage.minimumStake();
      const nodeAsk = 200000000000000000n; // Same as 0.2 ETH
      const deps = {
        accounts,
        Profile,
        Token,
        Staking,
        Ask,
        KnowledgeCollection,
      };

      const { node: publishingNode, identityId: publishingNodeIdentityId } =
        await setupNodeWithStakeAndAsk(1, minStake, nodeAsk, deps);

      const receivingNodes = [];
      const receivingNodesIdentityIds = [];
      for (let i = 0; i < 5; i++) {
        const { node, identityId } = await setupNodeWithStakeAndAsk(
          i + 10,
          minStake,
          nodeAsk,
          deps,
        );
        receivingNodes.push(node);
        receivingNodesIdentityIds.push(identityId);
      }

      await createKnowledgeCollection(
        kcCreator,
        publishingNode,
        publishingNodeIdentityId,
        receivingNodes,
        receivingNodesIdentityIds,
        deps,
        merkleRoot,
      );

      // Update and get the new active proof period
      await RandomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();

      // Create challenge
      await RandomSampling.connect(
        publishingNode.operational,
      ).createChallenge();

      // Get the challenge from storage to verify it
      let challenge = await RandomSamplingStorage.getNodeChallenge(
        publishingNodeIdentityId,
      );

      // Get chunk from quads
      const chunks = kcTools.splitIntoChunks(quads, 32);
      const challengeChunk = chunks[challenge.chunkId];

      // Generate a proof for our challenge chunk
      const { proof } = kcTools.calculateMerkleProof(
        quads,
        32,
        Number(challenge.chunkId),
      );

      // Submit proof
      await RandomSampling.connect(publishingNode.operational).submitProof(
        challengeChunk,
        proof,
      );

      // Get the challenge from storage to verify it
      challenge = await RandomSamplingStorage.getNodeChallenge(
        publishingNodeIdentityId,
      );

      const expectedScore = await calculateExpectedNodeScore(
        BigInt(publishingNodeIdentityId),
        BigInt(minStake),
        {
          ParametersStorage,
          ProfileStorage,
          AskStorage,
          EpochStorage,
        },
      );

      expect(
        await RandomSamplingStorage.getNodeEpochProofPeriodScore(
          publishingNodeIdentityId,
          challenge.epoch,
          challenge.activeProofPeriodStartBlock,
        ),
      ).to.equal(expectedScore);

      expect(
        await RandomSamplingStorage.getEpochAllNodesProofPeriodScore(
          challenge.epoch,

          challenge.activeProofPeriodStartBlock,
        ),
      ).to.equal(expectedScore);
    });

    it('Should succeed if submitting proof exactly on the last block of the period', async () => {
      // Setup
      const kcCreator = getDefaultKCCreator(accounts);
      const minStake = await ParametersStorage.minimumStake();
      const nodeAsk = 200000000000000000n; // 0.2 ETH
      const deps = {
        accounts,
        Profile,
        Token,
        Staking,
        Ask,
        KnowledgeCollection,
      };

      const { node: publishingNode, identityId: publishingNodeIdentityId } =
        await setupNodeWithStakeAndAsk(1, minStake, nodeAsk, deps);

      const receivingNodes = [];
      const receivingNodesIdentityIds = [];
      for (let i = 0; i < 5; i++) {
        const { node, identityId } = await setupNodeWithStakeAndAsk(
          i + 10,
          minStake,
          nodeAsk,
          deps,
        );
        receivingNodes.push(node);
        receivingNodesIdentityIds.push(identityId);
      }

      await createKnowledgeCollection(
        kcCreator,
        publishingNode,
        publishingNodeIdentityId,
        receivingNodes,
        receivingNodesIdentityIds,
        deps,
        merkleRoot,
      );

      // Create challenge
      await RandomSampling.connect(
        publishingNode.operational,
      ).createChallenge();
      const challenge = await RandomSamplingStorage.getNodeChallenge(
        publishingNodeIdentityId,
      );
      const startBlock = challenge.activeProofPeriodStartBlock;
      const duration = challenge.proofingPeriodDurationInBlocks;
      const targetBlock = startBlock + duration - 2n;
      const currentBlock = BigInt(await hre.ethers.provider.getBlockNumber());

      // Advance blocks to exactly S + D - 1
      if (targetBlock > currentBlock) {
        const blocksToMine = Number(targetBlock - currentBlock);
        for (let i = 0; i < blocksToMine; i++) {
          await hre.network.provider.send('evm_mine');
        }
      }

      expect(BigInt(await hre.ethers.provider.getBlockNumber())).to.equal(
        targetBlock,
      );

      // Action: Prepare and submit proof
      const chunks = kcTools.splitIntoChunks(quads, 32);
      const challengeChunk = chunks[challenge.chunkId];
      const { proof } = kcTools.calculateMerkleProof(
        quads,
        32,
        Number(challenge.chunkId),
      );

      const submitTx = RandomSampling.connect(
        publishingNode.operational,
      ).submitProof(challengeChunk, proof);

      // Verification
      await expect(submitTx).to.not.be.reverted;

      const updatedChallenge = await RandomSamplingStorage.getNodeChallenge(
        publishingNodeIdentityId,
      );
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(updatedChallenge.solved).to.be.true;

      const expectedScore = await calculateExpectedNodeScore(
        BigInt(publishingNodeIdentityId),
        BigInt(minStake),
        {
          ParametersStorage,
          ProfileStorage,
          AskStorage,
          EpochStorage,
        },
      );
      expect(
        await RandomSamplingStorage.getNodeEpochProofPeriodScore(
          publishingNodeIdentityId,
          challenge.epoch,
          startBlock,
        ),
      ).to.equal(expectedScore);

      await expect(submitTx)
        .to.emit(RandomSampling, 'ValidProofSubmitted')
        .withArgs(
          publishingNodeIdentityId,
          challenge.epoch,
          (score: bigint) => score.toString() === expectedScore.toString(),
        );
    });

    it('Should revert if submitting proof exactly on the first block of the next period', async () => {
      // Setup
      const kcCreator = getDefaultKCCreator(accounts);
      const minStake = await ParametersStorage.minimumStake();
      const nodeAsk = 200000000000000000n; // 0.2 ETH
      const deps = {
        accounts,
        Profile,
        Token,
        Staking,
        Ask,
        KnowledgeCollection,
      };

      const { node: publishingNode, identityId: publishingNodeIdentityId } =
        await setupNodeWithStakeAndAsk(1, minStake, nodeAsk, deps);

      const receivingNodes = [];
      const receivingNodesIdentityIds = [];
      for (let i = 0; i < 5; i++) {
        const { node, identityId } = await setupNodeWithStakeAndAsk(
          i + 10,
          minStake,
          nodeAsk,
          deps,
        );
        receivingNodes.push(node);
        receivingNodesIdentityIds.push(identityId);
      }

      await createKnowledgeCollection(
        kcCreator,
        publishingNode,
        publishingNodeIdentityId,
        receivingNodes,
        receivingNodesIdentityIds,
        deps,
        merkleRoot,
      );

      // Create challenge
      await RandomSampling.connect(
        publishingNode.operational,
      ).createChallenge();
      const challenge = await RandomSamplingStorage.getNodeChallenge(
        publishingNodeIdentityId,
      );
      const startBlock = challenge.activeProofPeriodStartBlock;
      const duration = challenge.proofingPeriodDurationInBlocks;
      const targetBlock = startBlock + duration - 1n;
      const currentBlock = BigInt(await hre.ethers.provider.getBlockNumber());

      // Advance blocks to exactly S + D
      if (targetBlock > currentBlock) {
        const blocksToMine = Number(targetBlock - currentBlock);
        for (let i = 0; i < blocksToMine; i++) {
          await hre.network.provider.send('evm_mine');
        }
      }
      expect(BigInt(await hre.ethers.provider.getBlockNumber())).to.equal(
        targetBlock,
      );

      // Action: Prepare and submit proof for the previous period
      const chunks = kcTools.splitIntoChunks(quads, 32);
      const challengeChunk = chunks[challenge.chunkId];
      const { proof } = kcTools.calculateMerkleProof(
        quads,
        32,
        Number(challenge.chunkId),
      );

      const submitTx = RandomSampling.connect(
        publishingNode.operational,
      ).submitProof(challengeChunk, proof);

      // Verification
      await expect(submitTx).to.be.revertedWith(
        'This challenge is no longer active',
      );
    });

    it('Should revert if proof for the same challenge is submitted twice', async () => {
      const kcCreator = getDefaultKCCreator(accounts);
      const minStake = await ParametersStorage.minimumStake();
      const nodeAsk = 200000000000000000n; // Same as 0.2 ETH
      const deps = {
        accounts,
        Profile,
        Token,
        Staking,
        Ask,
        KnowledgeCollection,
      };

      const { node: publishingNode, identityId: publishingNodeIdentityId } =
        await setupNodeWithStakeAndAsk(1, minStake, nodeAsk, deps);

      const receivingNodes = [];
      const receivingNodesIdentityIds = [];
      for (let i = 0; i < 5; i++) {
        const { node, identityId } = await setupNodeWithStakeAndAsk(
          i + 10,
          minStake,
          nodeAsk,
          deps,
        );
        receivingNodes.push(node);
        receivingNodesIdentityIds.push(identityId);
      }

      await createKnowledgeCollection(
        kcCreator,
        publishingNode,
        publishingNodeIdentityId,
        receivingNodes,
        receivingNodesIdentityIds,
        deps,
        merkleRoot,
      );

      // Update and get the new active proof period
      await RandomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();

      // Create challenge
      await RandomSampling.connect(
        publishingNode.operational,
      ).createChallenge();

      // Get the challenge from storage to verify it
      const challenge = await RandomSamplingStorage.getNodeChallenge(
        publishingNodeIdentityId,
      );

      // Get chunk from quads
      const chunks = kcTools.splitIntoChunks(quads, 32);
      const challengeChunk = chunks[challenge.chunkId];

      // Generate a proof for our challenge chunk
      const { proof } = kcTools.calculateMerkleProof(
        quads,
        32,
        Number(challenge.chunkId),
      );

      // Submit proof
      await RandomSampling.connect(publishingNode.operational).submitProof(
        challengeChunk,
        proof,
      );

      // Submit proof again
      const submitTx = RandomSampling.connect(
        publishingNode.operational,
      ).submitProof(challengeChunk, proof);

      // Expect revert
      await expect(submitTx).to.be.revertedWith(
        'This challenge has already been solved',
      );
    });
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

  describe('Scoring System', () => {

    /*
    * ────────────────────────────────────────────────────────────────────────────
    *  NODE STAKE == 0
    * ────────────────────────────────────────────────────────────────────────────
    */
   it('Should calculate score correctly when node stake is zero', async () => {
     // 1. Three "normal" nodes with minimum stake
     const minStake = await ParametersStorage.minimumStake();
     const nodeAsk  = 250n;
     const deps     = { accounts, Profile, Token, Staking, Ask, KnowledgeCollection };
   
     const normalNodes: { operational: SignerWithAddress; admin: SignerWithAddress }[] = [];
     const normalIds: bigint[] = [];
   
     for (let i = 0; i < 3; i++) {
       const { node, identityId } = await setupNodeWithStakeAndAsk(i * 2, minStake, nodeAsk, deps);
       normalNodes.push(node);
       normalIds.push(BigInt(identityId));
     }
   
     // 2. A node whose stake we set to zero
     const { node: zeroNode, identityId: zeroId } =
           await setupNodeWithStakeAndAsk(8, minStake, nodeAsk, deps);
     await Staking.connect(zeroNode.operational).requestWithdrawal(BigInt(zeroId), minStake);
     expect(await StakingStorage.getNodeStake(BigInt(zeroId))).to.equal(0n);
   
     // 3. KC, proof-period, challenges & proofs
     const kcCreator   = getDefaultKCCreator(accounts);
     const recNodes    = getDefaultReceivingNodes(accounts).map((node, i) => ({
       operational: accounts[16 + i * 4],
       admin: accounts[17 + i * 4]
     }));
     const recProfiles = await createProfiles(Profile, recNodes);
     const recIds      = recProfiles.map(p => Number(p.identityId));
   
     await createKnowledgeCollection(
       kcCreator, normalNodes[0], Number(normalIds[0]), recNodes, recIds, deps, merkleRoot);
   
     await RandomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
     const chunks = kcTools.splitIntoChunks(quads, 32);
   
     const solve = async (node: any, id: bigint) => {
       await RandomSampling.connect(node.operational).createChallenge();
       const ch = await RandomSamplingStorage.getNodeChallenge(id);
       const { proof } = kcTools.calculateMerkleProof(quads, 32, Number(ch.chunkId));
       await RandomSampling.connect(node.operational).submitProof(chunks[ch.chunkId], proof);
       return ch;
     };
   
     for (let i = 0; i < normalNodes.length; i++) await solve(normalNodes[i], normalIds[i]);
     const zCh = await solve(zeroNode, BigInt(zeroId));
   
     // 4. Assertions
     const zeroScore = await RandomSamplingStorage.getNodeEpochProofPeriodScore(
       BigInt(zeroId), zCh.epoch, zCh.activeProofPeriodStartBlock);
     expect(zeroScore).to.equal(0n);
   
     const totalScore = await RandomSamplingStorage.getEpochAllNodesProofPeriodScore(
       zCh.epoch, zCh.activeProofPeriodStartBlock);
     expect(totalScore).to.be.greaterThan(0n);
   
     for (let i = 0; i < normalIds.length; i++) {
       const s = await RandomSamplingStorage.getNodeEpochProofPeriodScore(
         normalIds[i], zCh.epoch, zCh.activeProofPeriodStartBlock);
       expect(s).to.be.greaterThan(0n);
     }
   });
   
   
   
   /*
    * ────────────────────────────────────────────────────────────────────────────
    *  NODE STAKE == maximumStake  (and capping when stake > maximum)
    * ────────────────────────────────────────────────────────────────────────────
    */
   it('Should calculate score correctly when node stake equals / exceeds maximum', async () => {
     const minStake = await ParametersStorage.minimumStake();
     const maxStake = await ParametersStorage.maximumStake();
     const nodeAsk  = 250n;
     const deps     = { accounts, Profile, Token, Staking, Ask, KnowledgeCollection };
   
     /* 1.  три "нормална" нода ------------------------------------------------ */
     const normalNodes: { operational: SignerWithAddress; admin: SignerWithAddress }[] = [];
     const normalIds : bigint[] = [];
     for (let i = 0; i < 3; i++) {
       const { node, identityId } = await setupNodeWithStakeAndAsk(i * 8, minStake, nodeAsk, deps);
       normalNodes.push(node);
       normalIds .push(BigInt(identityId));
     }
   
     /* 2.  један нод са stake == maximumStake -------------------------------- */
     const { node: maxNode, identityId: maxId } =
           await setupNodeWithStakeAndAsk(24, maxStake, nodeAsk, deps);
     const maxIdBigInt = BigInt(maxId);
   
     /* 3.  KC и иницијални proof-period -------------------------------------- */
     const kcCreator  = getDefaultKCCreator(accounts);
     const recNodes   = getDefaultReceivingNodes(accounts).map((node, i) => ({
       operational: accounts[32 + i * 4],
       admin:       accounts[33 + i * 4],
     }));
     const recProfiles = await createProfiles(Profile, recNodes);
     const recIds      = recProfiles.map(p => Number(p.identityId));
   
     await createKnowledgeCollection(
       kcCreator,
       normalNodes[0],
       Number(normalIds[0]),
       recNodes,
       recIds,
       deps,
       merkleRoot,
     );
   
     /*  ✱  ЈЕДНОКРАТНО ресетуј proof-period (умјесто пред сваки solve)         */
     await RandomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
   
     const chunks = kcTools.splitIntoChunks(quads, 32);
   
     const solve = async (node: any, id: bigint) => {
       await RandomSampling.connect(node.operational).createChallenge();
       const ch       = await RandomSamplingStorage.getNodeChallenge(id);
       const { proof } = kcTools.calculateMerkleProof(quads, 32, Number(ch.chunkId));
       await RandomSampling
             .connect(node.operational)
             .submitProof(chunks[ch.chunkId], proof);
       return ch;
     };
   
     /* 4.  рјешење свих изазова --------------------------------------------- */
     await solve(maxNode, maxIdBigInt);                           // max-stake први
     for (let i = 0; i < normalNodes.length; i++) {
       await solve(normalNodes[i], normalIds[i]);
     }
   
     /* 5.  провјере ---------------------------------------------------------- */
     const refCh    = await RandomSamplingStorage.getNodeChallenge(maxIdBigInt);
     const scoreMax = await RandomSamplingStorage.getNodeEpochProofPeriodScore(
                        maxIdBigInt, refCh.epoch, refCh.activeProofPeriodStartBlock);
   
     for (let i = 0; i < normalIds.length; i++) {
       const s = await RandomSamplingStorage.getNodeEpochProofPeriodScore(
                   normalIds[i], refCh.epoch, refCh.activeProofPeriodStartBlock);
       expect(scoreMax).to.be.greaterThan(s);
     }
   
     const expectedMax = await calculateExpectedNodeScore(
                           maxIdBigInt,
                           maxStake,
                           { ParametersStorage, ProfileStorage, AskStorage, EpochStorage });
   
     expect(scoreMax).to.equal(expectedMax);
   });
   
   
   async function calculateExpectedNodeScore(
     identityId: bigint,
     nodeStake: bigint,
     deps: {
       ParametersStorage: ParametersStorage;
       ProfileStorage: ProfileStorage;
       AskStorage: AskStorage;
       EpochStorage: EpochStorage;
     },
   ): Promise<bigint> {
     const { ParametersStorage, ProfileStorage, AskStorage, EpochStorage } = deps;
   
     /* 1. Stake factor ------------------------------------------------------ */
     const maximumStake    = await ParametersStorage.maximumStake();
     const cappedStake     = nodeStake > maximumStake ? maximumStake : nodeStake;
   
     const stakeDivisor    = 2_000_000n;                      // konst. iz kontrakta
     const stakeRatio      = cappedStake / stakeDivisor;      // (ulaz / 2m)
     const nodeStakeFactor = (2n * (stakeRatio ** 2n)) / SCALING_FACTOR;
   
     /* 2. Ask factor (izračunato od lowerBound → upperBound) ---------------- */
     const nodeAskScaled   = BigInt(await ProfileStorage.getAsk(identityId)) * SCALING_FACTOR;
     const [ askLowerBound, askUpperBound ] = await AskStorage.getAskBounds();
   
     let nodeAskFactor = 0n;
     if (nodeAskScaled >= askLowerBound && nodeAskScaled <= askUpperBound) {
       const diffBounds = askUpperBound - askLowerBound;      // != 0 (provereno ranije)
       const askRatio   = ((nodeAskScaled - askLowerBound) * SCALING_FACTOR) / diffBounds;
       // stakeRatio  *  (askRatio)^2   /  SCALE^2
       nodeAskFactor    = (stakeRatio * (askRatio ** 2n)) / (SCALING_FACTOR * SCALING_FACTOR);
     }
   
     /* 3. Publishing factor ------------------------------------------------- */
     const nodePub        = await EpochStorage.getNodeCurrentEpochProducedKnowledgeValue(identityId);
     const maxNodePub     = await EpochStorage.getCurrentEpochNodeMaxProducedKnowledgeValue();
   
     let nodePublishingFactor = 0n;
     if (maxNodePub > 0n) {
       const pubRatio      = (nodePub * SCALING_FACTOR) / maxNodePub;
       nodePublishingFactor = (nodeStakeFactor * pubRatio) / SCALING_FACTOR;
     }
   
     /* 4. SUM --------------------------------------------------------------- */
     return nodeStakeFactor + nodePublishingFactor + nodeAskFactor;
   }
   
   
   it('Should calculate score correctly when ask is exactly on bounds', async () => {
     /* Get bounds from on-chain storage */
     // Initialize ask bounds first
     const askLowerBound = 100n * SCALING_FACTOR;  // 100 TRAC
     const askUpperBound = 1000n * SCALING_FACTOR; // 1000 TRAC
     
     console.log('Setting ask bounds:', {
       lower: askLowerBound.toString(),
       upper: askUpperBound.toString()
     });
   
     // Set up some nodes first to ensure we have active stake
     const minStake = await ParametersStorage.minimumStake();
     const nodeAsk = 250n;
     const deps = { accounts, Profile, Token, Staking, Ask, KnowledgeCollection };
   
     // Create a few nodes to ensure we have active stake
     for (let i = 0; i < 3; i++) {
       await setupNodeWithStakeAndAsk(i * 4, minStake, nodeAsk, deps);
     }
   
     // Now set the ask bounds
     await ParametersStorage.connect(accounts[0]).setAskLowerBoundFactor(askLowerBound);
     await ParametersStorage.connect(accounts[0]).setAskUpperBoundFactor(askUpperBound);
     
     // Verify bounds were set correctly
     const [actualLower, actualUpper] = await AskStorage.getAskBounds();
     console.log('Actual ask bounds:', {
       lower: actualLower.toString(),
       upper: actualUpper.toString()
     });
   
     await Ask.connect(accounts[0]).recalculateActiveSet();
   
     const askLower = askLowerBound / SCALING_FACTOR;   // convert back to wei
     const askUpper = askUpperBound / SCALING_FACTOR;
   
     /* 1. Node at lowerBound */
     const { node: lowerNode, identityId: lowerId } =
           await setupNodeWithStakeAndAsk(60, minStake, askLower, deps);
   
     /* 2. Node at upperBound */
     const { node: upperNode, identityId: upperId } =
           await setupNodeWithStakeAndAsk(68, minStake, askUpper, deps);
   
     /* 3. Simple KC (for proof to work) */
     const kcCreator = getDefaultKCCreator(accounts);
     const recNodes = getDefaultReceivingNodes(accounts).map((node, i) => ({
       operational: accounts[16 + i * 4],
       admin: accounts[17 + i * 4]
     }));
     const recProfiles = await createProfiles(Profile, recNodes);
     const recIds = recProfiles.map(p => Number(p.identityId));
   
     await createKnowledgeCollection(
       kcCreator, lowerNode, Number(lowerId), recNodes, recIds, deps, merkleRoot);
   
     /* 4. Start proof period and solve challenges for both nodes */
     await RandomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
   
     const chunks = kcTools.splitIntoChunks(quads, 32);
     const solve = async (node: any, id: bigint) => {
       await RandomSampling.connect(node.operational).createChallenge();
       const ch = await RandomSamplingStorage.getNodeChallenge(id);
       const { proof } = kcTools.calculateMerkleProof(quads, 32, Number(ch.chunkId));
       await RandomSampling.connect(node.operational).submitProof(chunks[ch.chunkId], proof);
       return ch;
     };
   
     const chLower = await solve(lowerNode, BigInt(lowerId));
     const chUpper = await solve(upperNode, BigInt(upperId));
   
     /* 5. Results from storage */
     const scoreLower = await RandomSamplingStorage.getNodeEpochProofPeriodScore(
                          BigInt(lowerId), chLower.epoch, chLower.activeProofPeriodStartBlock);
     const scoreUpper = await RandomSamplingStorage.getNodeEpochProofPeriodScore(
                          BigInt(upperId), chUpper.epoch, chUpper.activeProofPeriodStartBlock);
   
     console.log('Scores:', {
       lower: scoreLower.toString(),
       upper: scoreUpper.toString()
     });
   
     /* 6. Expected values (calculated locally) */
     const expectedLower = await calculateExpectedNodeScore(
                             BigInt(lowerId), BigInt(minStake),
                             { ParametersStorage, ProfileStorage, AskStorage, EpochStorage });
   
     const expectedUpper = await calculateExpectedNodeScore(
                             BigInt(upperId), BigInt(minStake),
                             { ParametersStorage, ProfileStorage, AskStorage, EpochStorage });
   
     console.log('Expected scores:', {
       lower: expectedLower.toString(),
       upper: expectedUpper.toString()
     });
   
     /* 7. Assertions */
     expect(scoreLower).to.equal(expectedLower);
     expect(scoreUpper).to.equal(expectedUpper);
   
     // Node with ASK == lowerBound should have higher score than node with ASK == upperBound
     // (because lower ask is better)
     expect(scoreLower).to.be.greaterThan(scoreUpper);
   });
   
    /* -----------------------------------------------------------------
    *  NODE ASK  –  askLowerBound == askUpperBound
    * ----------------------------------------------------------------*/
   it('Should calculate score correctly when askLowerBound == askUpperBound', async () => {
     /* 0.  Set ASK bounds to the SAME value (e.g. 500 TRAC) */
     const oneValue = 500n * SCALING_FACTOR;          // 500 TRAC in wei-scale
     await ParametersStorage.connect(accounts[0]).setAskLowerBoundFactor(oneValue);
     await ParametersStorage.connect(accounts[0]).setAskUpperBoundFactor(oneValue);
   
     // Recalculate the active set after bounds change
     await Ask.connect(accounts[0]).recalculateActiveSet();
   
     /* 1.  Prepare a node with ASK exactly on the bound */
     const minStake   = await ParametersStorage.minimumStake();
     const deps       = { accounts, Profile, Token, Staking, Ask, KnowledgeCollection };
   
     const askAtBound = oneValue / SCALING_FACTOR;    // back to plain TRAC value
   
     const { node: boundNode, identityId: boundId } =
           await setupNodeWithStakeAndAsk(80, minStake, askAtBound, deps);
   
     /* 2.  Create a minimal KC so proof-flow works */
     const kcCreator = getDefaultKCCreator(accounts);
     const recNodes  = getDefaultReceivingNodes(accounts);
     const recIds    = (await createProfiles(Profile, recNodes)).map(p => Number(p.identityId));
   
     await createKnowledgeCollection(
       kcCreator,
       boundNode,
       Number(boundId),
       recNodes,
       recIds,
       deps,
       merkleRoot
     );
   
     /* 3.  Start the proof period and solve the challenge */
     await RandomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
   
     await RandomSampling.connect(boundNode.operational).createChallenge();
     const challenge = await RandomSamplingStorage.getNodeChallenge(BigInt(boundId));
   
     const chunks    = kcTools.splitIntoChunks(quads, 32);
     const { proof } = kcTools.calculateMerkleProof(quads, 32, Number(challenge.chunkId));
   
     await RandomSampling.connect(boundNode.operational).submitProof(
       chunks[challenge.chunkId],
       proof
     );
   
     /* 4.  Pull on-chain score from storage */
     const scoreOnChain = await RandomSamplingStorage.getNodeEpochProofPeriodScore(
       BigInt(boundId),
       challenge.epoch,
       challenge.activeProofPeriodStartBlock
     );
   
     /* 5.  Calculate expected score locally
            – ASK factor must be 0 because bounds are equal */
     const expected = await calculateExpectedNodeScore(
       BigInt(boundId),
       BigInt(minStake),
       { ParametersStorage, ProfileStorage, AskStorage, EpochStorage }
     );
   
     /* 6.  Assertions */
     expect(scoreOnChain).to.equal(expected);
   
     // Score should still be > 0 because stake- and/or publishing-factors contribute
     expect(scoreOnChain).to.be.greaterThan(0n);
   });
   
    /* -----------------------------------------------------------------
    *  PUBLISHING FACTOR  –  node has produced 0 KB in the epoch
    * ----------------------------------------------------------------*/
   it('Should calculate score correctly when node publishing factor is zero', async () => {
     /* 0.  One "active" node that will publish something,
            plus one "silent" node that publishes nothing.        */
     const minStake   = await ParametersStorage.minimumStake();
     const askValue   = 300n;                                         // 0.0003 TRAC
     const deps       = { accounts, Profile, Token, Staking, Ask, KnowledgeCollection };
   
     /* Active node (makes KC, gives non-zero global MAX publish factor) */
     const { node: activeNode, identityId: activeId } =
           await setupNodeWithStakeAndAsk(90, minStake, askValue, deps);
   
     /* Silent node – same stake/ASK, but will *not* create its own KC */
     const { node: silentNode, identityId: silentId } =
           await setupNodeWithStakeAndAsk(94, minStake, askValue, deps);
   
     /* 1.  Build one KC **published by the active node**               */
     const kcCreator = getDefaultKCCreator(accounts);
     const recNodes  = getDefaultReceivingNodes(accounts);
     const recIds    = (await createProfiles(Profile, recNodes)).map(p => Number(p.identityId));
   
     await createKnowledgeCollection(
       kcCreator,
       activeNode,
       Number(activeId),
       recNodes,
       recIds,
       deps,
       merkleRoot
     );
   
     /* 2.  Kick off a proof period                                     */
     await RandomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
   
     const chunks = kcTools.splitIntoChunks(quads, 32);
     const solve  = async (node: any, id: bigint) => {
       await RandomSampling.connect(node.operational).createChallenge();
       const ch     = await RandomSamplingStorage.getNodeChallenge(id);
       const { proof } = kcTools.calculateMerkleProof(quads, 32, Number(ch.chunkId));
       await RandomSampling.connect(node.operational).submitProof(chunks[ch.chunkId], proof);
       return ch;
     };
   
     /* Active node solves its challenge – ensures it keeps a >0 publish metric */
     await solve(activeNode, BigInt(activeId));
   
     /* Silent node also needs to solve a challenge (it may reference
        the active node's KC – that's fine, we have the quads).        */
     const slCh = await solve(silentNode, BigInt(silentId));
   
     /* 3.  On-chain scores                                             */
     const scoreSilent = await RandomSamplingStorage.getNodeEpochProofPeriodScore(
       BigInt(silentId), slCh.epoch, slCh.activeProofPeriodStartBlock
     );
     const scoreActive = await RandomSamplingStorage.getNodeEpochProofPeriodScore(
       BigInt(activeId), slCh.epoch, slCh.activeProofPeriodStartBlock   // same PP start block
     );
   
     /* 4.  Expected silent-node score (publishing factor should be 0)  */
     const expectedSilent = await calculateExpectedNodeScore(
       BigInt(silentId),
       BigInt(minStake),
       { ParametersStorage, ProfileStorage, AskStorage, EpochStorage }
     );
   
     /* 5.  Assertions                                                  */
     expect(scoreSilent).to.equal(expectedSilent);
   
     // With identical stake & ask, active node MUST outperform silent node,
     // because silent node's publishing factor is zero.
     expect(scoreActive).to.be.greaterThan(scoreSilent);
   });
   
   /*
    * ───────────────────────────────────────────────────────────────────────────
    *  Should revert if maxNodePublishingFactor is zero
    *  – scenario: nobody has published anything in the **current** epoch
    *    so  EpochStorage.getCurrentEpochNodeMaxProducedKnowledgeValue() == 0
    *    and  _calculateNodeScore() must revert from submitProof().
    * ───────────────────────────────────────────────────────────────────────────
    */
   it('Should revert if maxNodePublishingFactor is zero', async () => {
     /** 1.  Node with normal stake / ask */
     const minStake = await ParametersStorage.minimumStake();
     const nodeAsk  = 250n;
     const deps     = { accounts, Profile, Token, Staking, Ask, KnowledgeCollection };
   
     const { node: publishingNode, identityId: publishingId } =
           await setupNodeWithStakeAndAsk(40, minStake, nodeAsk, deps);
   
     /** 2.  Minimal KC so that challenges can be issued.
      *      The KC is created in the **current** epoch (E0).            */
     const kcCreator = getDefaultKCCreator(accounts);
     const recNodes  = getDefaultReceivingNodes(accounts).map((_, i) => ({
       operational: accounts[80 + i * 4],
       admin:       accounts[81 + i * 4],
     }));
     const recProfiles = await createProfiles(Profile, recNodes);
     const recIds = recProfiles.map(p => Number(p.identityId));
   
     await createKnowledgeCollection(
       kcCreator,
       publishingNode,
       publishingId,
       recNodes,
       recIds,
       deps,
       merkleRoot,          // predefined in the test-suite
       'op-id',
       10,                  // feeNumerator
       1000,                // feeDenominator
       5                    // epochsDuration  (active for several epochs)
     );
   
     /** 3.  Jump **one** epoch ahead so that:
      *      – the KC is still active (epochsDuration = 5)
      *      – but nobody has published in the **new** epoch (E1).
      *      For E1 the max publishing factor will therefore be 0.         */
     const jumpToNextEpoch = async () => {
       const timeUntil = await Chronos.timeUntilNextEpoch();
       const blockTime = await RandomSampling.avgBlockTimeInSeconds();
       const blocks    = timeUntil > 0n
                       ? Number(timeUntil / BigInt(blockTime)) + 2
                       : 2;
       for (let i = 0; i < blocks; i++) {
         await hre.network.provider.send('evm_mine');
       }
     };
     await jumpToNextEpoch();   // Now we are in epoch E1
   
     /** 4.  Start new proof period and create challenge                  */
     await RandomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
   
     await RandomSampling.connect(publishingNode.operational).createChallenge();
     const ch = await RandomSamplingStorage.getNodeChallenge(publishingId);
   
     /** 5.  Prepare a *valid* proof – the score calculation itself will
      *      revert inside submitProof because maxNodePubFactor == 0.      */
     const chunks = kcTools.splitIntoChunks(quads, 32);
     const { proof } = kcTools.calculateMerkleProof(quads, 32, Number(ch.chunkId));
   
     const tx = RandomSampling
                  .connect(publishingNode.operational)
                  .submitProof(chunks[ch.chunkId], proof);
   
     await expect(tx).to.be.revertedWith('Max node publishing factor is 0');
   
     /** 6.  Sanity – no score written                                    */
     const score = await RandomSamplingStorage.getNodeEpochProofPeriodScore(
                     BigInt(publishingId),
                     ch.epoch,
                     ch.activeProofPeriodStartBlock);
     expect(score).to.equal(0n);
   });
   
   /*
    * ───────────────────────────────────────────────────────────────────────────
    *  Full-formula check: stake + ask + publishing
    * ───────────────────────────────────────────────────────────────────────────
    */
   /*
    * ───────────────────────────────────────────────────────────────────────────
    *  Node score combines stake-, ask- and publishing-factor
    * ───────────────────────────────────────────────────────────────────────────
    */
   it('Should calculate the correct node score based on node stake, ask and publishing factor', async () => {
     /* 0. Configure ASK-bound factors up-front (100 – 1000 TRAC) */
     const lowerFactor = 100n  * SCALING_FACTOR;
     const upperFactor = 1000n * SCALING_FACTOR;
     await ParametersStorage.connect(accounts[0]).setAskLowerBoundFactor(lowerFactor);
     await ParametersStorage.connect(accounts[0]).setAskUpperBoundFactor(upperFactor);
   
     /* 1. Three publisher nodes, identical ASK (550 TRAC), different stakes   */
     const minStake  = await ParametersStorage.minimumStake();
     const maxStake  = await ParametersStorage.maximumStake();
     const deps      = { accounts, Profile, Token, Staking, Ask, KnowledgeCollection };
   
     const { node: minNode , identityId: minId  } = await setupNodeWithStakeAndAsk(0 ,  minStake     , 550n, deps);
     const { node: dblNode , identityId: dblId  } = await setupNodeWithStakeAndAsk(8 ,  minStake*2n  , 550n, deps);
     const { node: maxNode , identityId: maxId  } = await setupNodeWithStakeAndAsk(16,  maxStake      , 550n, deps);
   
     /* 2. Receiver nodes (needed only for KC signature quorum)                */
     const recNodes: { operational: SignerWithAddress; admin: SignerWithAddress }[] = [];
     const recIds  : number[] = [];
   
     for (let i = 0; i < 5; i++) {
       const { node, identityId } = await setupNodeWithStakeAndAsk(24 + i*8, minStake, 600n, deps);
       recNodes.push(node);
       recIds  .push(identityId);      // IDs are known – no extra profile creation
     }
   
     /* 3. Now that all nodes have ASK-ove, build the active set                */
     await Ask.connect(accounts[0]).recalculateActiveSet();
   
     /* 4. Publish a KC (publisher = minNode)                                   */
     const kcCreator = getDefaultKCCreator(accounts);
     await createKnowledgeCollection(
       kcCreator,
       minNode,
       minId,
       recNodes,
       recIds,
       deps,
       merkleRoot
     );
   
     /* 5. Start proof period and solve challenges for all three publishers     */
     await RandomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
     const chunks = kcTools.splitIntoChunks(quads, 32);
   
     const solve = async (node: any, id: bigint) => {
       await RandomSampling.connect(node.operational).createChallenge();
       const ch = await RandomSamplingStorage.getNodeChallenge(id);
       const { proof } = kcTools.calculateMerkleProof(quads, 32, Number(ch.chunkId));
       await RandomSampling.connect(node.operational).submitProof(chunks[ch.chunkId], proof);
       return ch;
     };
   
     const chMin  = await solve(minNode , BigInt(minId ));
     const chDbl  = await solve(dblNode , BigInt(dblId ));
     const chMax  = await solve(maxNode , BigInt(maxId ));
   
     /* 6. On-chain scores                                                      */
     const scoreMin  = await RandomSamplingStorage.getNodeEpochProofPeriodScore(BigInt(minId ), chMin.epoch, chMin.activeProofPeriodStartBlock);
     const scoreDbl  = await RandomSamplingStorage.getNodeEpochProofPeriodScore(BigInt(dblId ), chDbl.epoch, chDbl.activeProofPeriodStartBlock);
     const scoreMax  = await RandomSamplingStorage.getNodeEpochProofPeriodScore(BigInt(maxId ), chMax.epoch, chMax.activeProofPeriodStartBlock);
   
     /* 7. Off-chain reference scores                                           */
     const expectedMin  = await calculateExpectedNodeScore(BigInt(minId ),  minStake     , { ParametersStorage, ProfileStorage, AskStorage, EpochStorage });
     const expectedDbl  = await calculateExpectedNodeScore(BigInt(dblId ),  minStake*2n  , { ParametersStorage, ProfileStorage, AskStorage, EpochStorage });
     const expectedMax  = await calculateExpectedNodeScore(BigInt(maxId ),  maxStake     , { ParametersStorage, ProfileStorage, AskStorage, EpochStorage });
   
     /* 8. Assertions                                                           */
     expect(scoreMin ).to.equal(expectedMin );
     expect(scoreDbl ).to.equal(expectedDbl );
     expect(scoreMax ).to.equal(expectedMax );
   
     // Higher stake → higher score (ASK & publishing factor are the same)
     expect(scoreDbl).to.be.greaterThan(scoreMin);
     expect(scoreMax).to.be.greaterThan(scoreDbl);
   });
   
   
   
   
     });

  describe('Reward Claiming', () => {

    let publishingNode: {
      operational: SignerWithAddress;
      admin: SignerWithAddress;
    };
    let publishingNodeIdentityId: number;
    let delegatorAccount: SignerWithAddress;
    let delegatorKey: string;
    let epochToClaim: bigint;
    let deps: {
      accounts: SignerWithAddress[];
      Profile: Profile;
      Token: Token;
      Staking: Staking;
      Ask: Ask;
      KnowledgeCollection: KnowledgeCollection;
      ParametersStorage: ParametersStorage;
      RandomSampling: RandomSampling;
      RandomSamplingStorage: RandomSamplingStorage;
      EpochStorage: EpochStorage;
      Chronos: Chronos;
      StakingStorage: StakingStorage;
      IdentityStorage: IdentityStorage;
      ShardingTableStorage: ShardingTableStorage;
    };

    // Helper function to advance to the next epoch
    const advanceToNextEpoch = async () => {
      const timeUntil = await Chronos.timeUntilNextEpoch();
      const avgBlockTime = await RandomSampling.avgBlockTimeInSeconds();
      const blocksToMine =
        timeUntil > 0n ? Number(timeUntil / BigInt(avgBlockTime)) + 2 : 2; // Add buffer
      for (let i = 0; i < blocksToMine; i++) {
        await hre.network.provider.send('evm_mine');
      }
    };

    // Setup common scenario for reward claiming tests
    beforeEach(async () => {
      delegatorAccount = accounts[1];
      delegatorKey = hre.ethers.keccak256(
        hre.ethers.solidityPacked(['address'], [delegatorAccount.address]),
      );

      // Dependencies for setup
      deps = {
        accounts,
        Profile,
        Token,
        Staking,
        Ask,
        KnowledgeCollection,
        ParametersStorage,
        RandomSampling,
        RandomSamplingStorage,
        EpochStorage,
        Chronos,
        StakingStorage,
        IdentityStorage,
        ShardingTableStorage,
      };

      const nodeAsk = 200000000000000000n; // 0.2 TRAC ask
      const nodeStake = (await ParametersStorage.minimumStake()) * 2n; // Stake more than min
      const delegatorStake = nodeStake / 10n; // Delegate a tenth of node's stake

      // 1. Setup Node
      ({ node: publishingNode, identityId: publishingNodeIdentityId } =
        await setupNodeWithStakeAndAsk(
          2, // Account index offset for setup helper
          nodeStake,
          nodeAsk,
          deps,
        ));

      // 2. Setup Receiving Nodes
      const receivingNodes = [];
      const receivingNodesIdentityIds = [];
      for (let i = 0; i < 5; i++) {
        const { node, identityId } = await setupNodeWithStakeAndAsk(
          i + 3,
          await ParametersStorage.minimumStake(),
          nodeAsk,
          deps,
        );
        receivingNodes.push(node);
        receivingNodesIdentityIds.push(identityId);
      }

      // 3. Setup Delegator
      await Token.mint(delegatorAccount.address, delegatorStake * 2n);
      await Token.connect(delegatorAccount).approve(
        await Staking.getAddress(),
        delegatorStake,
      );
      await Staking.connect(delegatorAccount).stake(
        publishingNodeIdentityId,
        delegatorStake,
      );

      // Verify delegation
      expect(
        await StakingStorage.getDelegatorTotalStake(
          publishingNodeIdentityId,
          delegatorKey,
        ),
      ).to.equal(delegatorStake);

      const stakingStorageAmount = await Token.balanceOf(
        await StakingStorage.getAddress(),
      );

      const tokenAmount = ethers.parseEther('100');

      // 3. Create Knowledge Collection (generates fees for rewards)
      const kcCreator = getDefaultKCCreator(accounts);
      await createKnowledgeCollection(
        kcCreator,
        publishingNode,
        publishingNodeIdentityId,
        receivingNodes,
        receivingNodesIdentityIds,
        deps,
        merkleRoot, // Use predefined merkleRoot
        'test-operation-id',
        10,
        1000,
        10, // epochsDuration
        tokenAmount,
      );

      const stakingStorageAmountAfter = await Token.balanceOf(
        await StakingStorage.getAddress(),
      );

      // Verify that the staking storage received the token amount
      expect(stakingStorageAmountAfter).to.equal(
        stakingStorageAmount + tokenAmount,
      );

      // 4. Node submits a proof in the current epoch
      epochToClaim = await Chronos.getCurrentEpoch();

      await RandomSampling.connect(
        publishingNode.operational,
      ).createChallenge();
      let challenge = await RandomSamplingStorage.getNodeChallenge(
        publishingNodeIdentityId,
      );
      let chunks = kcTools.splitIntoChunks(quads, 32);
      let challengeChunk = chunks[challenge.chunkId];
      const { proof } = kcTools.calculateMerkleProof(
        quads,
        32,
        Number(challenge.chunkId),
      );
      await RandomSampling.connect(publishingNode.operational).submitProof(
        challengeChunk,
        proof,
      );

      // Verify proof was counted
      expect(
        await RandomSamplingStorage.getEpochNodeValidProofsCount(
          epochToClaim,
          publishingNodeIdentityId,
        ),
      ).to.equal(1n);

      // Advance to the next proofing period
      const proofingPeriodDurationInBlocks =
        await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks();
      for (let i = 0; i < Number(proofingPeriodDurationInBlocks); i++) {
        await hre.network.provider.send('evm_mine');
      }
      await RandomSampling.connect(
        publishingNode.operational,
      ).createChallenge();
      challenge = await RandomSamplingStorage.getNodeChallenge(
        publishingNodeIdentityId,
      );
      chunks = kcTools.splitIntoChunks(quads, 32);
      challengeChunk = chunks[challenge.chunkId];
      const { proof: proof2 } = kcTools.calculateMerkleProof(
        quads,
        32,
        Number(challenge.chunkId),
      );
      await RandomSampling.connect(publishingNode.operational).submitProof(
        challengeChunk,
        proof2,
      );

      // 5. Advance time past the epoch and finalize it
      await advanceToNextEpoch(); // Advance to epoch + 1
      await advanceToNextEpoch(); // Advance to epoch + 2 to ensure epoch is finalizable

      await expect(
        RandomSampling.connect(delegatorAccount).claimRewards(
          publishingNodeIdentityId,
          epochToClaim,
        ),
      ).to.be.revertedWith('Epoch is not finalized yet');

      // Create another KC to initialize the lazy finalization
      await createKnowledgeCollection(
        kcCreator,
        publishingNode,
        publishingNodeIdentityId,
        receivingNodes,
        receivingNodesIdentityIds,
        deps,
      );

      // Check finalization (using pool 1 as per RandomSampling logic)
      expect(
        await EpochStorage.lastFinalizedEpoch(1),
        'Epoch should be finalized',
      ).to.be.gte(epochToClaim);
    });

    it('Should allow a delegator to successfully claim their rewards', async () => {
      // Arrange
      const expectedReward = await RandomSampling.connect(
        delegatorAccount,
      ).getDelegatorEpochRewardsAmount(publishingNodeIdentityId, epochToClaim);
      expect(expectedReward).to.be.greaterThan(
        0n,
        'Expected reward should be positive',
      );

      const delegatorInitialBalance = await Token.balanceOf(
        delegatorAccount.address,
      );
      const stakingStorageInitialBalance = await Token.balanceOf(
        await StakingStorage.getAddress(),
      );

      // Act
      const claimTx = await RandomSampling.connect(
        delegatorAccount,
      ).claimRewards(publishingNodeIdentityId, epochToClaim);
      await claimTx.wait();

      // Assert
      // 1. Event Emission
      await expect(claimTx)
        .to.emit(RandomSampling, 'RewardsClaimed')
        .withArgs(
          publishingNodeIdentityId,
          epochToClaim,
          delegatorAccount.address,
          expectedReward,
        );

      // 2. Balance Check
      const delegatorFinalBalance = await Token.balanceOf(
        delegatorAccount.address,
      );
      const stakingStorageFinalBalance = await Token.balanceOf(
        await StakingStorage.getAddress(),
      );
      expect(delegatorFinalBalance).to.equal(
        delegatorInitialBalance + expectedReward,
      );
      expect(stakingStorageFinalBalance).to.equal(
        stakingStorageInitialBalance - expectedReward,
      );

      // 3. Claim Status Update
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(
        await RandomSamplingStorage.getEpochNodeDelegatorRewardsClaimed(
          epochToClaim,
          publishingNodeIdentityId,
          delegatorKey,
        ),
      ).to.be.true;
    });

    it('Should revert if the epoch to claim is not yet over', async () => {
      // Arrange: Need a scenario where epoch is *not* over. Let's setup again without advancing time.
      await hre.deployments.fixture(['RandomSampling']); // Redeploy for clean state relative to time
      ({
        accounts,
        IdentityStorage,
        StakingStorage,
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
        Staking,
        ShardingTableStorage,
        ShardingTable,
        ParametersStorage,
        Ask,
        Token,
        KnowledgeCollection,
      } = await loadFixture(deployRandomSamplingFixture)); // Reload all contracts

      // Redo minimal setup for node and KC within the current epoch
      publishingNode = { operational: accounts[1], admin: accounts[1] };
      delegatorAccount = accounts[2];
      deps = {
        accounts,
        Profile,
        Token,
        Staking,
        Ask,
        KnowledgeCollection,
        ParametersStorage,
        RandomSampling,
        RandomSamplingStorage,
        EpochStorage,
        Chronos,
        StakingStorage,
        IdentityStorage,
        ShardingTableStorage,
      };
      const nodeStake = await ParametersStorage.minimumStake();
      const nodeAsk = 200000000000000000n; // 0.2 TRAC ask

      ({ identityId: publishingNodeIdentityId } =
        await setupNodeWithStakeAndAsk(1, nodeStake, nodeAsk, deps));

      const receivingNodes = [];
      const receivingNodesIdentityIds = [];
      for (let i = 0; i < 5; i++) {
        const { node, identityId } = await setupNodeWithStakeAndAsk(
          i + 3,
          await ParametersStorage.minimumStake(),
          nodeAsk,
          deps,
        );
        receivingNodes.push(node);
        receivingNodesIdentityIds.push(identityId);
      }

      const kcCreator = getDefaultKCCreator(accounts);
      await createKnowledgeCollection(
        kcCreator,
        publishingNode,
        publishingNodeIdentityId,
        receivingNodes,
        receivingNodesIdentityIds,
        deps,
        merkleRoot,
        'test-operation-id',
        10,
        1000,
        10,
      );
      const currentEpoch = await Chronos.getCurrentEpoch();

      // Act & Assert
      await expect(
        RandomSampling.connect(delegatorAccount).claimRewards(
          publishingNodeIdentityId,
          currentEpoch, // Try claiming for the *current*, not-yet-over epoch
        ),
      ).to.be.revertedWith('Epoch is not over yet');
    });

    it('Should revert if rewards have already been claimed', async () => {
      // Arrange: Claim rewards once successfully first
      const expectedReward = await RandomSampling.connect(
        delegatorAccount,
      ).getDelegatorEpochRewardsAmount(publishingNodeIdentityId, epochToClaim);
      expect(expectedReward).to.be.greaterThan(0n);
      await RandomSampling.connect(delegatorAccount).claimRewards(
        publishingNodeIdentityId,
        epochToClaim,
      );

      // Verify claimed status
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(
        await RandomSamplingStorage.getEpochNodeDelegatorRewardsClaimed(
          epochToClaim,
          publishingNodeIdentityId,
          delegatorKey,
        ),
      ).to.be.true;

      // Act & Assert: Try claiming again
      await expect(
        RandomSampling.connect(delegatorAccount).claimRewards(
          publishingNodeIdentityId,
          epochToClaim,
        ),
      ).to.be.revertedWith('Rewards already claimed');
    });

    it('Should revert if the delegator has no score for the given epoch (e.g., node submitted no proofs)', async () => {
      const nodeStake = await ParametersStorage.minimumStake();
      const nodeAsk = 200000000000000000n; // 0.2 TRAC ask
      const delegatorStake = nodeStake / 2n;
      ({ node: publishingNode, identityId: publishingNodeIdentityId } =
        await setupNodeWithStakeAndAsk(15, nodeStake, nodeAsk, deps));

      // Setup receiving nodes
      const receivingNodes = [];
      const receivingNodesIdentityIds = [];
      for (let i = 0; i < 5; i++) {
        const { node, identityId } = await setupNodeWithStakeAndAsk(
          i + 20,
          await ParametersStorage.minimumStake(),
          nodeAsk,
          deps,
        );
        receivingNodes.push(node);
        receivingNodesIdentityIds.push(identityId);
      }

      await Token.connect(accounts[0]).transfer(
        delegatorAccount.address,
        delegatorStake * 2n,
      );
      await Token.connect(delegatorAccount).approve(
        await Staking.getAddress(),
        delegatorStake,
      );
      await Staking.connect(delegatorAccount).stake(
        publishingNodeIdentityId,
        delegatorStake,
      );
      const kcCreator = getDefaultKCCreator(accounts);
      await createKnowledgeCollection(
        kcCreator,
        publishingNode,
        publishingNodeIdentityId,
        receivingNodes,
        receivingNodesIdentityIds,
        deps,
        merkleRoot,
        'test-operation-id',
        10,
        1000,
        10,
      );
      epochToClaim = await Chronos.getCurrentEpoch();

      // *** Crucially, DO NOT submit proof ***

      // Advance past epoch and finalize
      await advanceToNextEpoch();
      await advanceToNextEpoch();
      await createKnowledgeCollection(
        kcCreator,
        publishingNode,
        publishingNodeIdentityId,
        receivingNodes,
        receivingNodesIdentityIds,
        deps,
        merkleRoot,
        'test-operation-id',
        10,
        1000,
        10,
      );

      // Verify no proofs were counted
      expect(
        await RandomSamplingStorage.getEpochNodeValidProofsCount(
          epochToClaim,
          publishingNodeIdentityId,
        ),
      ).to.equal(0n);

      // Check expected reward is zero
      const expectedReward = await RandomSampling.connect(
        delegatorAccount,
      ).getDelegatorEpochRewardsAmount(publishingNodeIdentityId, epochToClaim);
      expect(expectedReward).to.equal(0n);

      // Act & Assert
      await expect(
        RandomSampling.connect(delegatorAccount).claimRewards(
          publishingNodeIdentityId,
          epochToClaim,
        ),
      ).to.be.revertedWith('Delegator has no score for the given epoch');
    });

    it('Should calculate zero rewards if the total reward pool for the epoch was zero', async () => {
      const nodeStake = await ParametersStorage.minimumStake();
      const nodeAsk = 200000000000000000n;
      const delegatorStake = nodeStake / 2n;
    
      ({ node: publishingNode, identityId: publishingNodeIdentityId } =
        await setupNodeWithStakeAndAsk(15, nodeStake, nodeAsk, deps));
    
      const receivingNodes = [];
      const receivingNodesIdentityIds = [];
      for (let i = 0; i < 5; i++) {
        const { node, identityId } = await setupNodeWithStakeAndAsk(
          i + 20,
          await ParametersStorage.minimumStake(),
          nodeAsk,
          deps,
        );
        receivingNodes.push(node);
        receivingNodesIdentityIds.push(identityId);
      }
    
      await Token.connect(accounts[0]).transfer(
        delegatorAccount.address,
        delegatorStake * 2n,
      );
      await Token.connect(delegatorAccount).approve(
        await Staking.getAddress(),
        delegatorStake,
      );
      await Staking.connect(delegatorAccount).stake(
        publishingNodeIdentityId,
        delegatorStake,
      );
    
      const kcCreator = getDefaultKCCreator(accounts);
    
      // ✅ Let it compute merkleRoot and use internal quads
      await createKnowledgeCollection(
        kcCreator,
        publishingNode,
        publishingNodeIdentityId,
        receivingNodes,
        receivingNodesIdentityIds,
        deps,
        undefined, // Don't pass quads or merkleRoot manually!
        'test-operation-id',
        10,
        1000,
        10,
        ethers.parseEther('100'),
      );
    
      epochToClaim = await Chronos.getCurrentEpoch();
    
      // ✅ DO NOT submit any proof
    
      await advanceToNextEpoch();
      await advanceToNextEpoch();
    
      await createKnowledgeCollection(
        kcCreator,
        publishingNode,
        publishingNodeIdentityId,
        receivingNodes,
        receivingNodesIdentityIds,
        deps,
        undefined, // Still let it handle internally
        'test-operation-id-2',
        10,
        1000,
        10,
        ethers.parseEther('100'),
      );
    
      const reward = await RandomSampling.connect(delegatorAccount)
        .getDelegatorEpochRewardsAmount(publishingNodeIdentityId, epochToClaim);
      expect(reward).to.equal(0n);
    
      await expect(
        RandomSampling.connect(delegatorAccount).claimRewards(
          publishingNodeIdentityId,
          epochToClaim,
        ),
      ).to.be.revertedWith('Delegator has no score for the given epoch');
    });


    it('Should calculate zero rewards if allExpectedEpochProofsCount is zero', async () => {
      const nodeStake = await ParametersStorage.minimumStake();
      const nodeAsk = 200000000000000000n;
      const delegatorStake = nodeStake / 2n;
    
      ({ node: publishingNode, identityId: publishingNodeIdentityId } =
        await setupNodeWithStakeAndAsk(15, nodeStake, nodeAsk, deps));
    
      const receivingNodes = [];
      const receivingNodesIdentityIds = [];
      for (let i = 0; i < 5; i++) {
        const { node, identityId } = await setupNodeWithStakeAndAsk(
          i + 20,
          await ParametersStorage.minimumStake(),
          nodeAsk,
          deps,
        );
        receivingNodes.push(node);
        receivingNodesIdentityIds.push(identityId);
      }
    
      await Token.connect(accounts[0]).transfer(
        delegatorAccount.address,
        delegatorStake * 2n,
      );
      await Token.connect(delegatorAccount).approve(
        await Staking.getAddress(),
        delegatorStake,
      );
      await Staking.connect(delegatorAccount).stake(
        publishingNodeIdentityId,
        delegatorStake,
      );
    
      const kcCreator = getDefaultKCCreator(accounts);
    
      // ✅ Let KC creator compute merkleRoot and quads internally
      await createKnowledgeCollection(
        kcCreator,
        publishingNode,
        publishingNodeIdentityId,
        receivingNodes,
        receivingNodesIdentityIds,
        deps,
        undefined,
        'test-operation-id',
        10,
        1000,
        10,
        ethers.parseEther('100'),
      );
    
      epochToClaim = await Chronos.getCurrentEpoch();
    
      // ✅ DO NOT submit any proof
    
      await advanceToNextEpoch();
      await advanceToNextEpoch();
    
      await createKnowledgeCollection(
        kcCreator,
        publishingNode,
        publishingNodeIdentityId,
        receivingNodes,
        receivingNodesIdentityIds,
        deps,
        undefined,
        'test-operation-id-2',
        10,
        1000,
        10,
        ethers.parseEther('100'),
      );
    
      const expectedReward = await RandomSampling.connect(
        delegatorAccount,
      ).getDelegatorEpochRewardsAmount(publishingNodeIdentityId, epochToClaim);
      expect(expectedReward).to.equal(0n);
    
      await expect(
        RandomSampling.connect(delegatorAccount).claimRewards(
          publishingNodeIdentityId,
          epochToClaim,
        ),
      ).to.be.revertedWith('Delegator has no score for the given epoch');
    });


    it.only('Should handle multiple nodes and delegators correctly', async () => {
      /* ───────────────────────────────────────
       * 0.  SET-UP: 2 publisher nodes + 2 + 2 delegators
       * ─────────────────────────────────────── */
      const minStake = await ParametersStorage.minimumStake();
      const askValue = 250n;
      const deps     = { accounts, Profile, Token, Staking, Ask, KnowledgeCollection };
    
      /* ►  Node A  –  stake = 3 × minStake */
      const { node: nodeA, identityId: idA } =
            await setupNodeWithStakeAndAsk(10, minStake * 3n, askValue, deps);
    
      /* ►  Node B  –  stake = 2 × minStake */
      const { node: nodeB, identityId: idB } =
            await setupNodeWithStakeAndAsk(14, minStake * 2n, askValue, deps);
    
      /* Delegators & their stakes */
      const [delegA1, delegA2] = [accounts[20], accounts[21]];
      const [delegB1, delegB2] = [accounts[22], accounts[23]];
    
      const stakePairs: [SignerWithAddress, bigint, number][] = [
        [delegA1, (minStake * 3n) * 3n / 4n , idA],   // 75 % of node A stake
        [delegA2, (minStake * 3n) / 10n     , idA],   // 10 %
        [delegB1, (minStake * 2n) * 2n / 3n , idB],   // 66 % of node B stake
        [delegB2, (minStake * 2n) / 6n      , idB],   // 16 %
      ];
    
      for (const [deleg, amt, nId] of stakePairs) {
        await Token.connect(accounts[0]).transfer(deleg.address, amt * 2n);
        await Token.connect(deleg).approve(await Staking.getAddress(), amt);
        await Staking.connect(deleg).stake(nId, amt);
      }
    
      /* ───────────────────────────────────────
       * 1.  Two knowledge-collections (one per node)
       * ─────────────────────────────────────── */
      const kcCreator  = getDefaultKCCreator(accounts);
      const receivers  = getDefaultReceivingNodes(accounts).map((node, i) => ({
        operational: accounts[30 + i * 2],
        admin: accounts[31 + i * 2]
      }));
      const recvIds    = (await createProfiles(Profile, receivers))
                           .map(p => Number(p.identityId));
      const KC_FEE     = ethers.parseEther('500');

      // Create first KC with its own Merkle root
      const merkleRootA = kcTools.calculateMerkleRoot(quads, 32);
      await createKnowledgeCollection(
        kcCreator, nodeA, idA, receivers, recvIds,
        { KnowledgeCollection: deps.KnowledgeCollection, Token: deps.Token },
        merkleRootA, 'kc-A', 10, 1000, 3, KC_FEE,
      );

      // Create second KC with its own Merkle root
      const merkleRootB = kcTools.calculateMerkleRoot(quads, 32);
      await createKnowledgeCollection(
        kcCreator, nodeB, idB, receivers, recvIds,
        { KnowledgeCollection: deps.KnowledgeCollection, Token: deps.Token },
        merkleRootB, 'kc-B', 10, 1000, 3, KC_FEE,
      );

      /* ───────────────────────────────────────
       * 2.  Proofs – W2 мора бити ≥ 2 ⇒ сваком чвору 2 пруфа
       * ─────────────────────────────────────── */
      const chunks = kcTools.splitIntoChunks(quads, 32);
      const solveOnce = async (node: any, id: bigint, root: string) => {
        console.log(`\nSolving challenge for node ${id}:`);
        await RandomSampling.connect(node.operational).createChallenge();
        const ch = await RandomSamplingStorage.getNodeChallenge(id);
        console.log('Challenge details:', {
          nodeId: id.toString(),
          kcId: ch.knowledgeCollectionId.toString(),
          chunkId: ch.chunkId.toString(),
          epoch: ch.epoch.toString()
        });

        const { proof } = kcTools.calculateMerkleProof(quads, 32, Number(ch.chunkId));
        const challengeChunk = chunks[ch.chunkId];
        console.log('Proof details:', {
          merkleRoot: root,
          chunkData: challengeChunk,
          proofLength: proof.length
        });

        await RandomSampling.connect(node.operational)
             .submitProof(chunks[ch.chunkId], proof);
        console.log('Proof submitted successfully');
      };

      // Node A → 2 proofs
      console.log('\n=== Node A Proofs ===');
      await solveOnce(nodeA, BigInt(idA), merkleRootA);
      let pp = await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks();
      for (let i = 0; i < Number(pp); i++) await hre.network.provider.send('evm_mine');
      await solveOnce(nodeA, BigInt(idA), merkleRootA);

      // Node B → 2 proofs
      console.log('\n=== Node B Proofs ===');
      await solveOnce(nodeB, BigInt(idB), merkleRootB);
      pp = await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks();
      for (let i = 0; i < Number(pp); i++) await hre.network.provider.send('evm_mine');
      await solveOnce(nodeB, BigInt(idB), merkleRootB);
    
      /* ───────────────────────────────────────
       * 3.  Finalize the epoch (lazy finalisation trick)
       * ─────────────────────────────────────── */
      const epoch0 = await Chronos.getCurrentEpoch();
      const hopEpoch = async () => {
        const t  = await Chronos.timeUntilNextEpoch();
        const bt = await RandomSampling.avgBlockTimeInSeconds();
        const n  = t > 0n ? Number(t / BigInt(bt)) + 2 : 2;
        for (let i = 0; i < n; i++) await hre.network.provider.send('evm_mine');
      };
      await hopEpoch();          // → E+1
      await hopEpoch();          // → E+2
    
      // dummy KC to trigger lazy-finalise pool 1
      await createKnowledgeCollection(
        kcCreator, nodeA, idA, receivers, recvIds,
        { KnowledgeCollection: deps.KnowledgeCollection, Token: deps.Token },
        merkleRoot, 'dummy', 10, 1000, 2, KC_FEE,
      );
      expect(await EpochStorage.lastFinalizedEpoch(1)).to.be.gte(epoch0);
    
      /* ───────────────────────────────────────
       * 4.  Snapshot expected rewards & pre-balances
       * ─────────────────────────────────────── */
      type Info = { exp: bigint; before: bigint };
      const map = new Map<string, Info>();
    
      for (const [deleg, , nId] of stakePairs) {
        const exp = await RandomSampling.connect(deleg)
                        .getDelegatorEpochRewardsAmount(nId, epoch0);
        expect(exp, 'each delegator gets > 0').to.be.gt(0n);
        const before = await Token.balanceOf(deleg.address);
        map.set(deleg.address, { exp, before });
      }
      const stakingBefore = await Token.balanceOf(await StakingStorage.getAddress());
    
      /* ───────────────────────────────────────
       * 5.  Claim rewards & event / balance checks
       * ─────────────────────────────────────── */
      for (const [deleg, , nId] of stakePairs) {
        const { exp } = map.get(deleg.address)!;
        const tx = await RandomSampling.connect(deleg).claimRewards(nId, epoch0);
        await expect(tx)
          .to.emit(RandomSampling, 'RewardsClaimed')
          .withArgs(nId, epoch0, deleg.address, exp);
      }
    
      /* ───────────────────────────────────────
       * 6.  Post-balances + double claim guard
       * ─────────────────────────────────────── */
      for (const [deleg] of stakePairs) {
        const { exp, before } = map.get(deleg.address)!;
        const after = await Token.balanceOf(deleg.address);
        expect(after).to.equal(before + exp);
    
        // already claimed ⇒ revert
        await expect(
          RandomSampling.connect(deleg).claimRewards(idA, epoch0),
        ).to.be.reverted;
      }
    
      const stakingAfter = await Token.balanceOf(await StakingStorage.getAddress());
      const totalPaid    = [...map.values()].reduce((s, { exp }) => s + exp, 0n);
      expect(stakingBefore - stakingAfter).to.equal(totalPaid);
    
      /* Negative path: delegator claims on a node it didn't delegate to */
      await expect(
        RandomSampling.connect(delegA1).claimRewards(idB, epoch0),
      ).to.be.revertedWith('Delegator has no score for the given epoch');
    });
    


  });


});
