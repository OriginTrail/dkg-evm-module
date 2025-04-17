import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
// @ts-expect-error: No type definitions available for assertion-tools
import { kcTools } from 'assertion-tools';
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
    it('Should revert if an unsolved challenge already exists for this node in the current proof period', async () => {
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

    it('Should set the node challenge successfully and emit ChallengeCreated event', async () => {
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
        publishingNodeIdentityId,
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
        challenge.chunkId,
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
