import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
// @ts-expect-error: No type definitions available for assertion-tools
import { kcTools } from 'assertion-tools';
import { expect } from 'chai';
import hre, { network } from 'hardhat';

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
  const stakeRatio = (cappedStake * SCALING_FACTOR) / maximumStake;
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

    it('Should have the correct W1 after initialization', async () => {
      const W1 = await RandomSamplingStorage.getW1();
      expect(W1).to.equal(0);
    });

    it('Should have the correct W2 after initialization', async () => {
      const W2 = await RandomSamplingStorage.getW2();
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
        await RandomSampling.getActiveProofingPeriodDurationInBlocks();
      const newDuration = initialDuration + 10n;
      const expectedEffectiveEpoch = currentEpoch + 1n;
      const hubOwner = accounts[0];

      // Ensure no pending change initially
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(
        await RandomSampling.isPendingProofingPeriodDuration(),
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
        await RandomSampling.isPendingProofingPeriodDuration(),
        'Should be a pending duration after setting',
      ).to.be.true;

      // 3. Active duration remains unchanged in the current epoch
      expect(
        await RandomSampling.getActiveProofingPeriodDurationInBlocks(),
        'Active duration should remain unchanged in current epoch',
      ).to.equal(initialDuration);
    });

    it('Should replace pending proofing period duration if one exists', async () => {
      // Setup
      const currentEpoch = await Chronos.getCurrentEpoch();
      const initialDuration =
        await RandomSampling.getActiveProofingPeriodDurationInBlocks();
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
        await RandomSampling.isPendingProofingPeriodDuration(),
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
        await RandomSampling.isPendingProofingPeriodDuration(),
        'Should still have pending duration after replace',
      ).to.be.true;

      // 3. Active duration remains unchanged in the current epoch
      expect(
        await RandomSampling.getActiveProofingPeriodDurationInBlocks(),
        'Active duration should remain unchanged',
      ).to.equal(initialDuration);

      // 4. Check the actual pending value
      // Advance to the effective epoch
      const timeUntilNextEpoch = await Chronos.timeUntilNextEpoch();
      await time.increase(Number(timeUntilNextEpoch) + 10);

      expect(
        await Chronos.getCurrentEpoch(),
        'Should be in the next epoch',
      ).to.equal(expectedEffectiveEpoch);
      expect(
        await RandomSampling.getActiveProofingPeriodDurationInBlocks(),
        'Active duration should be updated in effective epoch',
      ).to.equal(secondNewDuration);
    });

    it('Should correctly apply the new duration only in the effective epoch', async () => {
      // Setup
      const currentEpoch = await Chronos.getCurrentEpoch();
      const effectiveEpoch = currentEpoch + 1n;
      const initialDuration =
        await RandomSampling.getActiveProofingPeriodDurationInBlocks();
      const newDuration = initialDuration + 20n; // Different new duration
      const hubOwner = accounts[0];

      // Schedule change for next epoch
      await RandomSampling.connect(hubOwner).setProofingPeriodDurationInBlocks(
        newDuration,
      );
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(
        await RandomSampling.isPendingProofingPeriodDuration(),
        'Duration change should be pending',
      ).to.be.true;

      // Ensure activeProofPeriodStartBlock is initialized if needed
      let initialStartBlockE = (
        await RandomSampling.getActiveProofPeriodStatus()
      ).activeProofPeriodStartBlock;
      if (initialStartBlockE === 0n) {
        await RandomSampling.updateAndGetActiveProofPeriodStartBlock();
        initialStartBlockE = (await RandomSampling.getActiveProofPeriodStatus())
          .activeProofPeriodStartBlock;
      }
      expect(initialStartBlockE).to.be.greaterThan(
        0n,
        'Initial start block should be > 0',
      );

      // --- Verification in Current Epoch (Epoch E) ---
      expect(
        await RandomSampling.getActiveProofingPeriodDurationInBlocks(),
        'Active duration should be initial in Epoch E',
      ).to.equal(initialDuration);

      // Advance blocks within Epoch E by the initial duration
      for (let i = 0; i < Number(initialDuration); i++) {
        await hre.network.provider.send('evm_mine');
      }

      // Update period and check if it used the initial duration
      await RandomSampling.updateAndGetActiveProofPeriodStartBlock();
      const updatedStartBlockE = (
        await RandomSampling.getActiveProofPeriodStatus()
      ).activeProofPeriodStartBlock;
      expect(updatedStartBlockE).to.equal(
        initialStartBlockE + initialDuration,
        'Start block should advance by initial duration in Epoch E',
      );

      // --- Advance to Next Epoch (Epoch E+1) ---
      const timeUntilNextEpoch = await Chronos.timeUntilNextEpoch();
      await time.increase(Number(timeUntilNextEpoch) + 5);
      expect(
        await Chronos.getCurrentEpoch(),
        'Should now be in the effective epoch',
      ).to.equal(effectiveEpoch);

      expect(
        await Chronos.getCurrentEpoch(),
        'Should now be in the effective epoch',
      ).to.equal(effectiveEpoch);

      // --- Verification in Effective Epoch (Epoch E+1) ---
      expect(
        await RandomSampling.getActiveProofingPeriodDurationInBlocks(),
        'Active duration should be new in Epoch E+1',
      ).to.equal(newDuration);

      // Get the start block relevant for this new epoch
      // It might have carried over or been updated by the block advance
      await RandomSampling.updateAndGetActiveProofPeriodStartBlock();
      const startBlockE1 = (await RandomSampling.getActiveProofPeriodStatus())
        .activeProofPeriodStartBlock;

      // Advance blocks within Epoch E+1 by the *new* duration
      for (let i = 0; i < Number(newDuration); i++) {
        await hre.network.provider.send('evm_mine');
      }

      // Update period and check if it used the new duration
      await RandomSampling.updateAndGetActiveProofPeriodStartBlock();
      const updatedStartBlockE1 = (
        await RandomSampling.getActiveProofPeriodStatus()
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
        await RandomSampling.getActiveProofingPeriodDurationInBlocks();
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
      const tx = await RandomSampling.updateAndGetActiveProofPeriodStartBlock();
      await tx.wait();

      const proofPeriodStatus =
        await RandomSampling.getActiveProofPeriodStatus();
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
        .to.emit(RandomSamplingStorage, 'NodeChallengeSet')
        .withArgs(publishingNodeIdentityId, challenge);

      const proofPeriodDuration =
        await RandomSampling.getActiveProofingPeriodDurationInBlocks();

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
        await time.increase(Number(timeUntilNextEpoch) + 5);
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
      await RandomSampling.updateAndGetActiveProofPeriodStartBlock();

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
      await RandomSampling.updateAndGetActiveProofPeriodStartBlock();

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

    it('Should submit a valid proof and successfully emit NodeEpochScoreAdded event with correct parameters', async () => {
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
      await RandomSampling.updateAndGetActiveProofPeriodStartBlock();

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

      // Verify that epochNodeValidProofsCount was incremented
      await expect(receipt)
        .to.emit(RandomSamplingStorage, 'NodeEpochScoreAdded')
        .withArgs(
          challenge.epoch,
          publishingNodeIdentityId,
          (score: bigint) => score.toString() === expectedScore.toString(),
          (totalScore: bigint) =>
            totalScore.toString() === expectedScore.toString(),
        );
    });

    it('Should submit a valid proof and successfully and add score to nodeEpochProofPeriodScore', async () => {
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
      await RandomSampling.updateAndGetActiveProofPeriodStartBlock();

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
        .to.emit(RandomSamplingStorage, 'NodeEpochScoreAdded')
        .withArgs(
          challenge.epoch,
          publishingNodeIdentityId,
          (score: bigint) => score.toString() === expectedScore.toString(),
          (totalScore: bigint) =>
            totalScore.toString() === expectedScore.toString(),
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
      await RandomSampling.updateAndGetActiveProofPeriodStartBlock();

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

  describe('Optimized Knowledge Collection Search', () => {
    let publishingNode: {
      operational: SignerWithAddress;
      admin: SignerWithAddress;
    };
    let publishingNodeIdentityId: number;
    let receivingNodes: {
      operational: SignerWithAddress;
      admin: SignerWithAddress;
    }[];
    let receivingNodesIdentityIds: number[];
    let kcCreator: SignerWithAddress;
    let deps: {
      accounts: SignerWithAddress[];
      Profile: Profile;
      Token: Token;
      Staking: Staking;
      Ask: Ask;
      KnowledgeCollection: KnowledgeCollection;
    };

    beforeEach(async () => {
      // Setup nodes
      kcCreator = getDefaultKCCreator(accounts);
      const minStake = await ParametersStorage.minimumStake();
      const nodeAsk = 200000000000000000n; // 0.2 ETH

      deps = {
        accounts,
        Profile,
        Token,
        Staking,
        Ask,
        KnowledgeCollection,
      };

      ({ node: publishingNode, identityId: publishingNodeIdentityId } =
        await setupNodeWithStakeAndAsk(1, minStake, nodeAsk, deps));

      receivingNodes = [];
      receivingNodesIdentityIds = [];
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
    });

    it('Should find active knowledge collections when mix of active and expired collections exist', async () => {
      const initialEpoch = await Chronos.getCurrentEpoch();

      // Create 20 knowledge collections with different expiration epochs
      const collections = [];

      // Create 15 collections that expire in epoch 1 (will be expired)
      for (let i = 0; i < 15; i++) {
        await createKnowledgeCollection(
          kcCreator,
          publishingNode,
          publishingNodeIdentityId,
          receivingNodes,
          receivingNodesIdentityIds,
          deps,
          merkleRoot,
          `expired-operation-${i}`,
          10,
          1000,
          1, // epochsDuration = 1, so expires after current epoch + duration + 1
        );
        collections.push({ id: i + 1, active: false });
      }

      // Create 5 collections that expire in epoch 10 (will be active)
      for (let i = 15; i < 20; i++) {
        await createKnowledgeCollection(
          kcCreator,
          publishingNode,
          publishingNodeIdentityId,
          receivingNodes,
          receivingNodesIdentityIds,
          deps,
          merkleRoot,
          `active-operation-${i}`,
          10,
          1000,
          10, // epochsDuration = 10, so expires after current epoch + duration + 1
        );
        collections.push({ id: i + 1, active: true });
      }

      // Advance to epoch 5 (so first 15 collections are expired, last 5 are active)
      for (let epoch = Number(initialEpoch); epoch < 5; epoch++) {
        const timeUntilNextEpoch = await Chronos.timeUntilNextEpoch();
        await time.increase(Number(timeUntilNextEpoch) + 5);
      }

      const currentEpoch = await Chronos.getCurrentEpoch();
      expect(currentEpoch).to.be.gte(5n, 'Should be in epoch 5 or later');

      // Verify which collections are active/expired
      for (const collection of collections) {
        const endEpoch = await KnowledgeCollectionStorage.getEndEpoch(
          collection.id,
        );
        const isActive = currentEpoch <= endEpoch;
        if (collection.active) {
          // eslint-disable-next-line @typescript-eslint/no-unused-expressions
          expect(isActive).to.be.true;
        } else {
          // eslint-disable-next-line @typescript-eslint/no-unused-expressions
          expect(isActive).to.be.false;
        }
      }

      // Create challenge multiple times to verify it finds active collections
      const foundCollections = new Set<number>();
      const maxAttempts = 20; // Try multiple times to test randomness and consistency

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // Move to next proof period to allow new challenge
        const duration =
          await RandomSampling.getActiveProofingPeriodDurationInBlocks();
        for (let i = 0; i < Number(duration); i++) {
          await hre.network.provider.send('evm_mine');
        }

        await RandomSampling.connect(
          publishingNode.operational,
        ).createChallenge();
        const challenge = await RandomSamplingStorage.getNodeChallenge(
          publishingNodeIdentityId,
        );

        // Verify the found collection is one of the active ones
        expect([16, 17, 18, 19, 20]).to.include(
          Number(challenge.knowledgeCollectionId),
        );
        foundCollections.add(Number(challenge.knowledgeCollectionId));

        // Mark challenge as solved to allow next challenge
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
        await RandomSamplingStorage.setNodeChallenge(
          publishingNodeIdentityId,
          solvedChallenge,
        );
      }

      // Verify that the algorithm found at least 2 different active collections (shows it's working properly)
      expect(foundCollections.size).to.be.gte(
        2,
        'Should find multiple different active collections',
      );
    });

    it('Should revert when all knowledge collections are expired', async () => {
      // Create 3 knowledge collections that expire in epoch 1
      for (let i = 0; i < 3; i++) {
        await createKnowledgeCollection(
          kcCreator,
          publishingNode,
          publishingNodeIdentityId,
          receivingNodes,
          receivingNodesIdentityIds,
          deps,
          merkleRoot,
          `expired-operation-${i}`,
          10,
          1000,
          1, // epochsDuration = 1, expires after epoch 1
        );
      }

      // Advance to epoch 5 (all collections expired)
      for (let epoch = 1; epoch < 5; epoch++) {
        const timeUntilNextEpoch = await Chronos.timeUntilNextEpoch();
        await time.increase(Number(timeUntilNextEpoch) + 5);
      }

      // Verify all collections are expired
      const currentEpoch = await Chronos.getCurrentEpoch();
      for (let kcId = 1; kcId <= 3; kcId++) {
        const endEpoch = await KnowledgeCollectionStorage.getEndEpoch(kcId);
        expect(currentEpoch).to.be.gt(endEpoch, `KC ${kcId} should be expired`);
      }

      // Attempt to create challenge should revert
      await expect(
        RandomSampling.connect(publishingNode.operational).createChallenge(),
      ).to.be.revertedWith(
        'Failed to find a knowledge collection that is active in the current epoch',
      );
    });

    it('Should work efficiently with single active collection among many expired ones', async () => {
      // Create 9 expired collections
      for (let i = 0; i < 9; i++) {
        await createKnowledgeCollection(
          kcCreator,
          publishingNode,
          publishingNodeIdentityId,
          receivingNodes,
          receivingNodesIdentityIds,
          deps,
          merkleRoot,
          `expired-operation-${i}`,
          10,
          1000,
          1, // epochsDuration = 1, expires after epoch 1
        );
      }

      // Create 1 active collection (will be KC #10)
      await createKnowledgeCollection(
        kcCreator,
        publishingNode,
        publishingNodeIdentityId,
        receivingNodes,
        receivingNodesIdentityIds,
        deps,
        merkleRoot,
        'active-operation',
        10,
        1000,
        10, // epochsDuration = 10, active for longer
      );

      // Advance to epoch 4 (first 9 expired, last 1 active)
      for (let epoch = 1; epoch < 4; epoch++) {
        const timeUntilNextEpoch = await Chronos.timeUntilNextEpoch();
        await time.increase(Number(timeUntilNextEpoch) + 5);
      }

      // Verify only the last collection is active
      const currentEpoch = await Chronos.getCurrentEpoch();
      for (let kcId = 1; kcId <= 9; kcId++) {
        const endEpoch = await KnowledgeCollectionStorage.getEndEpoch(kcId);
        expect(currentEpoch).to.be.gt(endEpoch, `KC ${kcId} should be expired`);
      }

      const activeKcEndEpoch = await KnowledgeCollectionStorage.getEndEpoch(10);
      expect(currentEpoch).to.be.lte(
        activeKcEndEpoch,
        'KC 10 should be active',
      );

      // Create challenge should find the active collection
      await RandomSampling.connect(
        publishingNode.operational,
      ).createChallenge();
      const challenge = await RandomSamplingStorage.getNodeChallenge(
        publishingNodeIdentityId,
      );

      expect(challenge.knowledgeCollectionId).to.equal(
        10n,
        'Should find the only active collection',
      );
    });

    it('Should demonstrate randomness by finding different collections over multiple attempts', async () => {
      // Create 5 active knowledge collections
      for (let i = 0; i < 5; i++) {
        await createKnowledgeCollection(
          kcCreator,
          publishingNode,
          publishingNodeIdentityId,
          receivingNodes,
          receivingNodesIdentityIds,
          deps,
          merkleRoot,
          `active-operation-${i}`,
          10,
          1000,
          10, // All active for 10 epochs
        );
      }

      const foundCollections = new Set<number>();
      const maxAttempts = 15;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // Move to next proof period
        const duration =
          await RandomSampling.getActiveProofingPeriodDurationInBlocks();
        for (let i = 0; i < Number(duration); i++) {
          await hre.network.provider.send('evm_mine');
        }

        await RandomSampling.connect(
          publishingNode.operational,
        ).createChallenge();
        const challenge = await RandomSamplingStorage.getNodeChallenge(
          publishingNodeIdentityId,
        );

        // All collections should be active
        expect(challenge.knowledgeCollectionId).to.be.gte(1n);
        expect(challenge.knowledgeCollectionId).to.be.lte(5n);
        foundCollections.add(Number(challenge.knowledgeCollectionId));

        // Mark as solved for next iteration
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
        await RandomSamplingStorage.setNodeChallenge(
          publishingNodeIdentityId,
          solvedChallenge,
        );
      }

      // Should find at least 3 different collections (demonstrates randomness)
      expect(foundCollections.size).to.be.gte(
        3,
        `Should find multiple collections for randomness. Found: ${Array.from(foundCollections)}`,
      );
    });

    it('Should handle edge case with collections at different positions in the range', async () => {
      // Create specific pattern: active-expired-active-expired-active
      const patterns = [
        { active: true, duration: 10 }, // KC 1: active
        { active: false, duration: 1 }, // KC 2: expired
        { active: true, duration: 10 }, // KC 3: active
        { active: false, duration: 1 }, // KC 4: expired
        { active: true, duration: 10 }, // KC 5: active
      ];

      for (let i = 0; i < patterns.length; i++) {
        await createKnowledgeCollection(
          kcCreator,
          publishingNode,
          publishingNodeIdentityId,
          receivingNodes,
          receivingNodesIdentityIds,
          deps,
          merkleRoot,
          `pattern-operation-${i}`,
          10,
          1000,
          patterns[i].duration,
        );
      }

      // Advance to epoch 4 (expired ones are expired, active ones are active)
      for (let epoch = 1; epoch < 4; epoch++) {
        const timeUntilNextEpoch = await Chronos.timeUntilNextEpoch();
        await time.increase(Number(timeUntilNextEpoch) + 5);
      }

      // Test multiple challenges to ensure it finds active collections (1, 3, 5)
      const foundCollections = new Set<number>();

      for (let attempt = 0; attempt < 10; attempt++) {
        const duration =
          await RandomSampling.getActiveProofingPeriodDurationInBlocks();
        for (let i = 0; i < Number(duration); i++) {
          await hre.network.provider.send('evm_mine');
        }

        await RandomSampling.connect(
          publishingNode.operational,
        ).createChallenge();
        const challenge = await RandomSamplingStorage.getNodeChallenge(
          publishingNodeIdentityId,
        );

        foundCollections.add(Number(challenge.knowledgeCollectionId));

        // Should only find active collections (1, 3, 5)
        expect([1, 3, 5]).to.include(Number(challenge.knowledgeCollectionId));

        // Mark as solved for next iteration
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
        await RandomSamplingStorage.setNodeChallenge(
          publishingNodeIdentityId,
          solvedChallenge,
        );
      }

      // Should find multiple active collections from the pattern
      expect(foundCollections.size).to.be.gte(
        2,
        'Should find multiple active collections from the alternating pattern',
      );

      // Verify it never found expired collections (2, 4)
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(foundCollections.has(2)).to.be.false;
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(foundCollections.has(4)).to.be.false;
    });
  });

  describe('Node scoring', () => {
    let nodeIdCounter = 100; // Start from high index to avoid conflicts with other tests

    beforeEach(async () => {
      // Create a basic knowledge collection to initialize epoch publishing data
      // Use unique account indices for setup to avoid conflicts
      const kcCreator = accounts[70]; // Use high index account
      const setupNode = {
        admin: accounts[71],
        operational: accounts[72],
      };

      const { identityId: setupNodeId } = await createProfile(
        Profile,
        setupNode,
      );

      // Set minimum stake and ask for the setup node
      const minStake = await ParametersStorage.minimumStake();
      await setNodeStake(setupNode, BigInt(setupNodeId), minStake, {
        Token,
        Staking,
        Ask,
      });
      await Profile.connect(setupNode.operational).updateAsk(setupNodeId, 100n);
      await Ask.recalculateActiveSet();

      // Create receiving nodes with unique indices
      const receivingNodes = Array.from({ length: 3 }, (_, i) => ({
        admin: accounts[73 + i * 2],
        operational: accounts[74 + i * 2],
      }));

      const receivingNodesIdentityIds = (
        await createProfiles(Profile, receivingNodes)
      ).map((p) => p.identityId);

      const deps = {
        accounts,
        Profile,
        Token,
        Staking,
        Ask,
        KnowledgeCollection,
      };

      // Create a knowledge collection to initialize publishing data
      await createKnowledgeCollection(
        kcCreator,
        setupNode,
        setupNodeId,
        receivingNodes,
        receivingNodesIdentityIds,
        deps,
        merkleRoot,
      );

      // Reset node counter for each test
      nodeIdCounter = 100;
    });

    it('Should return score of 0 for zero stake node', async () => {
      // Setup: Create a node with zero stake using unique accounts
      const publishingNode = {
        admin: accounts[nodeIdCounter++],
        operational: accounts[nodeIdCounter++],
      };
      const { identityId: publishingNodeIdentityId } = await createProfile(
        Profile,
        publishingNode,
      );

      // Set ask to valid value within bounds
      await Profile.connect(publishingNode.operational).updateAsk(
        publishingNodeIdentityId,
        100n,
      );
      await Ask.recalculateActiveSet();

      // Verify zero stake
      const nodeStake = await StakingStorage.getNodeStake(
        publishingNodeIdentityId,
      );
      expect(nodeStake).to.equal(0n);

      // Calculate score - should handle zero stake gracefully
      const score = await RandomSampling.calculateNodeScore(
        publishingNodeIdentityId,
      );

      // Should be zero because stake factor is zero
      expect(score).to.equal(0n);
    });

    it('Should cap stake at maximumStake and calculate score correctly', async () => {
      // Setup: Create a node with exactly maximum stake
      const maximumStake = await ParametersStorage.maximumStake();
      const askLowerBoundBefore = await AskStorage.getAskLowerBound();
      const nodeAsk = askLowerBoundBefore / SCALING_FACTOR + 10n; // Slightly above lower bound
      const deps = {
        accounts,
        Profile,
        Token,
        Staking,
        Ask,
        KnowledgeCollection,
      };

      const { identityId: publishingNodeIdentityId } =
        await setupNodeWithStakeAndAsk(
          nodeIdCounter,
          maximumStake,
          nodeAsk,
          deps,
        );
      nodeIdCounter += 2; // Account for both admin and operational accounts

      // Set stake to 2x maximum stake to test capping
      await StakingStorage.setNodeStake(
        publishingNodeIdentityId,
        maximumStake * 2n,
      );

      expect(
        await StakingStorage.getNodeStake(publishingNodeIdentityId),
      ).to.equal(maximumStake * 2n);

      // Calculate expected score using helper function
      const expectedScore = await calculateExpectedNodeScore(
        BigInt(publishingNodeIdentityId),
        maximumStake * 2n,
        {
          ParametersStorage,
          ProfileStorage,
          AskStorage,
          EpochStorage,
        },
      );

      // Calculate actual score from contract
      const actualScore = await RandomSampling.calculateNodeScore(
        publishingNodeIdentityId,
      );

      expect(actualScore).to.equal(expectedScore);
    });

    it('Should handle stake calculation correctly when node has maximum stake', async () => {
      // Setup: Create a node with exactly maximum stake and verify internal capping
      const maximumStake = await ParametersStorage.maximumStake();
      const askLowerBoundBefore = await AskStorage.getAskLowerBound();
      const nodeAsk = askLowerBoundBefore / SCALING_FACTOR + 10n; // Slightly above lower bound
      const deps = {
        accounts,
        Profile,
        Token,
        Staking,
        Ask,
        KnowledgeCollection,
      };

      const { identityId: publishingNodeIdentityId } =
        await setupNodeWithStakeAndAsk(
          nodeIdCounter,
          maximumStake,
          nodeAsk,
          deps,
        );
      nodeIdCounter += 2; // Account for both admin and operational accounts

      // Verify stake is exactly at maximum
      const actualNodeStake = await StakingStorage.getNodeStake(
        publishingNodeIdentityId,
      );
      expect(actualNodeStake).to.equal(maximumStake);

      // Calculate actual score from contract
      const actualScore = await RandomSampling.calculateNodeScore(
        publishingNodeIdentityId,
      );

      const expectedScore = await calculateExpectedNodeScore(
        BigInt(publishingNodeIdentityId),
        maximumStake,
        {
          ParametersStorage,
          ProfileStorage,
          AskStorage,
          EpochStorage,
        },
      );

      expect(actualScore).to.equal(expectedScore);
    });

    it('Should calculate correct score for minimum viable stake', async () => {
      // Setup: Create a node with minimum stake + 1
      const minimumStake = await ParametersStorage.minimumStake();
      const minViableStake = minimumStake + 1n;
      const askLowerBoundBefore = await AskStorage.getAskLowerBound();
      const nodeAsk = askLowerBoundBefore / SCALING_FACTOR + 10n; // Slightly above lower bound
      const deps = {
        accounts,
        Profile,
        Token,
        Staking,
        Ask,
        KnowledgeCollection,
      };

      const { identityId: publishingNodeIdentityId } =
        await setupNodeWithStakeAndAsk(
          nodeIdCounter,
          minViableStake,
          nodeAsk,
          deps,
        );
      nodeIdCounter += 2; // Account for both admin and operational accounts

      // Calculate expected score
      const expectedScore = await calculateExpectedNodeScore(
        BigInt(publishingNodeIdentityId),
        minViableStake,
        {
          ParametersStorage,
          ProfileStorage,
          AskStorage,
          EpochStorage,
        },
      );

      // Calculate actual score from contract
      const actualScore = await RandomSampling.calculateNodeScore(
        publishingNodeIdentityId,
      );

      expect(actualScore).to.equal(expectedScore);
    });

    it('Should handle precision loss testing and maintain accuracy', async () => {
      // Setup: Use stakes that might cause precision issues
      const minimumStake = await ParametersStorage.minimumStake();
      const maximumStake = await ParametersStorage.maximumStake();

      const deps = {
        accounts,
        Profile,
        Token,
        Staking,
        Ask,
        KnowledgeCollection,
      };

      const stake = minimumStake * 10n;

      // Get ask bounds to set a valid ask price
      const askLowerBoundBefore = await AskStorage.getAskLowerBound();
      const nodeAsk = askLowerBoundBefore / SCALING_FACTOR + 10n; // Slightly above lower bound

      const { identityId: publishingNodeIdentityId } =
        await setupNodeWithStakeAndAsk(nodeIdCounter, stake, nodeAsk, deps);
      nodeIdCounter += 2; // Account for both admin and operational accounts

      const [askLowerBound, askUpperBound] = await AskStorage.getAskBounds();

      // Calculate actual score from contract
      const actualScore = await RandomSampling.calculateNodeScore(
        publishingNodeIdentityId,
      );

      // Calculate expected score using the proper contract formula
      const cappedStake = stake > maximumStake ? maximumStake : stake;

      // Stake factor: 2 * (stake / maxStake)^2
      const stakeRatio = Number(cappedStake) / Number(maximumStake);
      const expectedStakeFactor = 2 * stakeRatio ** 2;

      // Ask factor: (stakeRatio) * ((upperBound - nodeAsk) / (upperBound - lowerBound))^2
      const nodeAskScaled = Number(nodeAsk) * Number(SCALING_FACTOR);
      let expectedAskFactor = 0;
      if (
        nodeAskScaled >= Number(askLowerBound) &&
        nodeAskScaled <= Number(askUpperBound)
      ) {
        const askDiffRatio =
          (Number(askUpperBound) - nodeAskScaled) /
          (Number(askUpperBound) - Number(askLowerBound));
        expectedAskFactor = stakeRatio * askDiffRatio ** 2;
      }

      // Publishing factor is 0 for this test (no knowledge collections)
      const expectedPublishingFactor = 0;
      const expectedTotal =
        expectedStakeFactor + expectedAskFactor + expectedPublishingFactor;

      // The precision difference should be very small which indicates that your calculation logic is essentially correct - it's just hitting the limits of floating-point precision in JavaScript.
      expect(Number(actualScore) / Number(SCALING_FACTOR)).to.be.closeTo(
        expectedTotal,
        1e-15,
      );
    });

    it('Should calculate accurate score for node with stake and ask', async () => {
      // Setup: Create a realistic node scenario
      const nodeStake = (await ParametersStorage.minimumStake()) * 5n; // 5x minimum stake
      const askLowerBoundBefore = await AskStorage.getAskLowerBound();
      const nodeAsk = askLowerBoundBefore / SCALING_FACTOR + 10n; // Slightly above lower bound
      const deps = {
        accounts,
        Profile,
        Token,
        Staking,
        Ask,
        KnowledgeCollection,
      };

      const { node: publishingNode, identityId: publishingNodeIdentityId } =
        await setupNodeWithStakeAndAsk(nodeIdCounter, nodeStake, nodeAsk, deps);
      nodeIdCounter += 2; // Account for both admin and operational accounts

      // Create a knowledge collection to set up publishing factor
      const kcCreator = accounts[90]; // Use high index to avoid conflicts
      const receivingNodes = [];
      const receivingNodesIdentityIds = [];
      for (let i = 0; i < 5; i++) {
        const { node, identityId } = await setupNodeWithStakeAndAsk(
          nodeIdCounter,
          await ParametersStorage.minimumStake(),
          nodeAsk,
          deps,
        );
        nodeIdCounter += 2; // Account for both admin and operational accounts
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

      // Calculate expected score using our helper function
      const expectedScore = await calculateExpectedNodeScore(
        BigInt(publishingNodeIdentityId),
        nodeStake,
        {
          ParametersStorage,
          ProfileStorage,
          AskStorage,
          EpochStorage,
        },
      );

      // Calculate actual score from contract
      const actualScore = await RandomSampling.calculateNodeScore(
        publishingNodeIdentityId,
      );

      // Verify they match exactly
      expect(actualScore).to.equal(expectedScore);
    });

    it('Should return higher score for lower ask prices (competitive pricing)', async () => {
      // Setup: Create two identical nodes with different ask prices
      const nodeStake = (await ParametersStorage.minimumStake()) * 3n;
      const deps = {
        accounts,
        Profile,
        Token,
        Staking,
        Ask,
        KnowledgeCollection,
      };

      // Get ask bounds to set competitive asks
      const [askLowerBound, askUpperBound] = await AskStorage.getAskBounds();

      expect(askUpperBound).to.be.greaterThan(askLowerBound);
      expect(askLowerBound).to.be.greaterThan(0n);

      const lowAsk = askLowerBound / SCALING_FACTOR + 1n; // Just above lower bound (competitive)
      const highAsk = askUpperBound / SCALING_FACTOR - 1n; // Just below upper bound (expensive)

      // Node 1: Low ask (competitive)
      const { identityId: node1Id } = await setupNodeWithStakeAndAsk(
        nodeIdCounter,
        nodeStake,
        lowAsk,
        deps,
      );
      nodeIdCounter += 2; // Account for both admin and operational accounts

      // Node 2: High ask (expensive)
      const { identityId: node2Id } = await setupNodeWithStakeAndAsk(
        nodeIdCounter,
        nodeStake,
        highAsk,
        deps,
      );
      nodeIdCounter += 2; // Account for both admin and operational accounts

      // Calculate scores
      const score1 = await RandomSampling.calculateNodeScore(node1Id);
      const score2 = await RandomSampling.calculateNodeScore(node2Id);

      // Lower ask should result in higher score (better competitiveness)
      expect(score1).to.be.greaterThan(score2);
    });

    it('Should return higher score for higher stake amounts', async () => {
      // Setup: Create two nodes with different stake amounts
      const lowStake = await ParametersStorage.minimumStake();
      const highStake = lowStake * 4n; // 4x the minimum
      const askLowerBoundBefore = await AskStorage.getAskLowerBound();
      const nodeAsk = askLowerBoundBefore / SCALING_FACTOR + 10n; // Slightly above lower bound
      const deps = {
        accounts,
        Profile,
        Token,
        Staking,
        Ask,
        KnowledgeCollection,
      };

      // Node 1: Low stake
      const { identityId: node1Id } = await setupNodeWithStakeAndAsk(
        nodeIdCounter,
        lowStake,
        nodeAsk,
        deps,
      );
      nodeIdCounter += 2; // Account for both admin and operational accounts

      // Node 2: High stake
      const { identityId: node2Id } = await setupNodeWithStakeAndAsk(
        nodeIdCounter,
        highStake,
        nodeAsk,
        deps,
      );
      nodeIdCounter += 2; // Account for both admin and operational accounts

      // Calculate scores
      const score1 = await RandomSampling.calculateNodeScore(node1Id);
      const score2 = await RandomSampling.calculateNodeScore(node2Id);

      // Higher stake should result in higher score
      expect(score2).to.be.greaterThan(score1);
    });

    it('Should demonstrate quadratic relationship in stake factor', async () => {
      // Setup: Test that stake factor follows quadratic formula: 2 * (stake/maxStake)^2
      const minimumStake = await ParametersStorage.minimumStake();
      const testStakes = [
        minimumStake,
        minimumStake * 2n,
        minimumStake * 4n,
        minimumStake * 8n,
      ];
      const nodeAsk = 200000000000000000n; // 0.2 ETH

      const deps = {
        accounts,
        Profile,
        Token,
        Staking,
        Ask,
        KnowledgeCollection,
      };

      const scores = [];
      for (const stake of testStakes) {
        const { identityId } = await setupNodeWithStakeAndAsk(
          nodeIdCounter,
          stake,
          nodeAsk,
          deps,
        );
        nodeIdCounter += 2;

        const score = await RandomSampling.calculateNodeScore(identityId);
        scores.push(score);
      }

      // Verify quadratic growth: doubling stake should roughly quadruple the stake component
      // Since score = stakeFactor + askFactor + pubFactor, and askFactor depends on stake too,
      // we expect significant but not exactly 4x growth
      expect(scores[1]).to.be.greaterThan(scores[0] * 2n); // More than 2x
      expect(scores[2]).to.be.greaterThan(scores[1] * 2n); // More than 2x again
      expect(scores[3]).to.be.greaterThan(scores[2] * 2n); // More than 2x again
    });

    it('Should handle ask prices near bounds correctly', async () => {
      // Setup: Test ask prices near lower and upper bounds
      const nodeStake = (await ParametersStorage.minimumStake()) * 3n;
      const deps = {
        accounts,
        Profile,
        Token,
        Staking,
        Ask,
        KnowledgeCollection,
      };

      const [askLowerBound, askUpperBound] = await AskStorage.getAskBounds();

      expect(askUpperBound).to.be.greaterThan(askLowerBound);
      expect(askLowerBound).to.be.greaterThan(0n);

      // Ensure asks are properly within bounds by adding/subtracting small amounts
      const lowerBoundAsk = askLowerBound / SCALING_FACTOR + 1n; // Slightly above lower bound
      const upperBoundAsk = askUpperBound / SCALING_FACTOR - 1n; // Slightly below upper bound

      // Node 1: Near lower bound (competitive pricing)
      const { identityId: node1Id } = await setupNodeWithStakeAndAsk(
        nodeIdCounter,
        nodeStake,
        lowerBoundAsk,
        deps,
      );
      nodeIdCounter += 2;

      // Node 2: Near upper bound (expensive pricing)
      const { identityId: node2Id } = await setupNodeWithStakeAndAsk(
        nodeIdCounter,
        nodeStake,
        upperBoundAsk,
        deps,
      );
      nodeIdCounter += 2;

      const score1 = await RandomSampling.calculateNodeScore(node1Id);
      const expectedScore1 = await calculateExpectedNodeScore(
        BigInt(node1Id),
        nodeStake,
        {
          ParametersStorage,
          ProfileStorage,
          AskStorage,
          EpochStorage,
        },
      );
      const score2 = await RandomSampling.calculateNodeScore(node2Id);
      const expectedScore2 = await calculateExpectedNodeScore(
        BigInt(node2Id),
        nodeStake,
        {
          ParametersStorage,
          ProfileStorage,
          AskStorage,
          EpochStorage,
        },
      );

      // Verify that both scores are reasonable and within expected ranges
      // The exact relationship depends on the ask factor implementation details
      expect(score1).to.be.equal(expectedScore1);
      expect(score2).to.be.equal(expectedScore2);

      // Verify node with lower ask has higher score
      expect(score1).to.be.greaterThan(score2);
    });

    it('Should return zero ask factor for asks outside bounds', async () => {
      // Setup: Test asks outside the valid bounds
      const nodeStake = (await ParametersStorage.minimumStake()) * 2n;
      const deps = {
        accounts,
        Profile,
        Token,
        Staking,
        Ask,
        KnowledgeCollection,
      };

      const [askLowerBound, askUpperBound] = await AskStorage.getAskBounds();

      expect(askUpperBound).to.be.greaterThan(askLowerBound);
      expect(askLowerBound).to.be.greaterThan(0n);

      // Test with ask below lower bound (if possible to set)
      const belowBoundAsk = askLowerBound / SCALING_FACTOR / 2n;
      if (belowBoundAsk > 0n) {
        const { identityId: lowNodeId } = await setupNodeWithStakeAndAsk(
          nodeIdCounter,
          nodeStake,
          belowBoundAsk,
          deps,
        );
        nodeIdCounter += 2;

        // Test with ask above upper bound
        const aboveBoundAsk = (askUpperBound / SCALING_FACTOR) * 2n;
        const { identityId: highNodeId } = await setupNodeWithStakeAndAsk(
          nodeIdCounter,
          nodeStake,
          aboveBoundAsk,
          deps,
        );
        nodeIdCounter += 2;

        // Test with ask within bounds for comparison
        const withinBoundAsk = askLowerBound / SCALING_FACTOR + 1n;
        const { identityId: validNodeId } = await setupNodeWithStakeAndAsk(
          nodeIdCounter,
          nodeStake,
          withinBoundAsk,
          deps,
        );
        nodeIdCounter += 2;

        const lowAskScore = await RandomSampling.calculateNodeScore(lowNodeId);
        const highAskScore =
          await RandomSampling.calculateNodeScore(highNodeId);
        const validAskScore =
          await RandomSampling.calculateNodeScore(validNodeId);

        // Nodes with asks outside bounds should have lower scores (no ask factor)
        expect(validAskScore).to.be.greaterThan(lowAskScore);
        expect(validAskScore).to.be.greaterThan(highAskScore);
        expect(highAskScore).to.be.equal(lowAskScore);
      }
    });

    it('Should demonstrate publishing factor impact on score', async () => {
      // Setup: Create nodes and test publishing factor contribution
      const nodeStake = (await ParametersStorage.minimumStake()) * 3n;
      const askLowerBoundBefore = await AskStorage.getAskLowerBound();
      const nodeAsk = askLowerBoundBefore / SCALING_FACTOR + 10n; // Slightly above lower bound
      const deps = {
        accounts,
        Profile,
        Token,
        Staking,
        Ask,
        KnowledgeCollection,
      };

      // Node 1: Will have publishing activity
      const { node: publishingNode, identityId: publishingNodeId } =
        await setupNodeWithStakeAndAsk(nodeIdCounter, nodeStake, nodeAsk, deps);
      nodeIdCounter += 2;

      // Node 2: Will have no publishing activity
      const { identityId: nonPublishingNodeId } =
        await setupNodeWithStakeAndAsk(nodeIdCounter, nodeStake, nodeAsk, deps);
      nodeIdCounter += 2;

      // Create receiving nodes
      const receivingNodes = [];
      const receivingNodesIdentityIds = [];
      for (let i = 0; i < 3; i++) {
        const { node, identityId } = await setupNodeWithStakeAndAsk(
          nodeIdCounter,
          await ParametersStorage.minimumStake(),
          nodeAsk,
          deps,
        );
        nodeIdCounter += 2;
        receivingNodes.push(node);
        receivingNodesIdentityIds.push(identityId);
      }

      // Create knowledge collection with publishing node (gives it publishing factor)
      const kcCreator = accounts[95];
      await createKnowledgeCollection(
        kcCreator,
        publishingNode,
        publishingNodeId,
        receivingNodes,
        receivingNodesIdentityIds,
        deps,
        merkleRoot,
      );

      // Calculate scores
      const publishingScore =
        await RandomSampling.calculateNodeScore(publishingNodeId);
      const nonPublishingScore =
        await RandomSampling.calculateNodeScore(nonPublishingNodeId);

      // Verify publishing factor
      const publishingFactor =
        await EpochStorage.getNodeCurrentEpochProducedKnowledgeValue(
          publishingNodeId,
        );
      expect(publishingFactor).to.be.greaterThan(0n);

      const nonPublishingFactor =
        await EpochStorage.getNodeCurrentEpochProducedKnowledgeValue(
          nonPublishingNodeId,
        );
      expect(nonPublishingFactor).to.equal(0n);
      expect(publishingFactor).to.be.greaterThan(nonPublishingFactor);

      // Node with publishing activity should have higher score
      expect(publishingScore).to.be.greaterThan(nonPublishingScore);
    });

    it('Should handle edge case where maximum publishing value is zero', async () => {
      // Move to a new epoch
      await network.provider.send('evm_increaseTime', [
        Number(await Chronos.epochLength()) * 2,
      ]);
      await network.provider.send('evm_mine');

      // Create a node with minimum stake and ask
      const nodeStake = await ParametersStorage.minimumStake();
      const askLowerBoundBefore = await AskStorage.getAskLowerBound();
      const nodeAsk = askLowerBoundBefore / SCALING_FACTOR + 10n; // Slightly above lower bound
      const deps = {
        accounts,
        Profile,
        Token,
        Staking,
        Ask,
        KnowledgeCollection,
      };

      const { identityId } = await setupNodeWithStakeAndAsk(
        nodeIdCounter,
        nodeStake,
        nodeAsk,
        deps,
      );
      nodeIdCounter += 2;

      // Verify the max publishing value is indeed > 0 in our setup
      const maxNodePub =
        await EpochStorage.getCurrentEpochNodeMaxProducedKnowledgeValue();
      expect(maxNodePub).to.be.equal(0n);

      const actualNodeScore =
        await RandomSampling.calculateNodeScore(identityId);
      const expectedNodeScore = await calculateExpectedNodeScore(
        BigInt(identityId),
        nodeStake,
        {
          ParametersStorage,
          ProfileStorage,
          AskStorage,
          EpochStorage,
        },
      );
      expect(actualNodeScore).to.be.equal(expectedNodeScore);
    });

    it('Should handle identical nodes with identical scores', async () => {
      // Setup: Create two identical nodes and verify they get identical scores
      const nodeStake = (await ParametersStorage.minimumStake()) * 2n;
      const askLowerBoundBefore = await AskStorage.getAskLowerBound();
      const nodeAsk = askLowerBoundBefore / SCALING_FACTOR + 10n; // Slightly above lower bound
      const deps = {
        accounts,
        Profile,
        Token,
        Staking,
        Ask,
        KnowledgeCollection,
      };

      // Node 1
      const { identityId: node1Id } = await setupNodeWithStakeAndAsk(
        nodeIdCounter,
        nodeStake,
        nodeAsk,
        deps,
      );
      nodeIdCounter += 2;

      // Node 2 (identical setup)
      const { identityId: node2Id } = await setupNodeWithStakeAndAsk(
        nodeIdCounter,
        nodeStake,
        nodeAsk,
        deps,
      );
      nodeIdCounter += 2;

      // Calculate scores
      const score1 = await RandomSampling.calculateNodeScore(node1Id);
      const score2 = await RandomSampling.calculateNodeScore(node2Id);

      // Scores should be identical for identical nodes
      expect(score1).to.equal(score2);
    });
  });
});
