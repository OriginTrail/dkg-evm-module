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
import { createProfilesAndKC } from '../helpers/kc-helpers';
import { createProfile } from '../helpers/profile-helpers';
import { createMockChallenge } from '../helpers/random-sampling';
import {
  getDefaultKCCreator,
  getDefaultReceivingNodes,
  getDefaultPublishingNode,
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

async function setNodeStake(
  node: { operational: SignerWithAddress; admin: SignerWithAddress },
  identityId: bigint,
  amount: bigint,
  hubOwner: SignerWithAddress,
  deps: { Token: Token; Staking: Staking; Ask: Ask },
) {
  const { Token, Staking } = deps;

  await Token.mint(node.operational.address, amount);
  await Token.connect(node.operational).approve(
    await Staking.getAddress(),
    amount,
  );
  await Staking.connect(node.operational).stake(identityId, amount);
}

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

      // Create challenge
      const challengeTx = await RandomSampling.connect(
        publishingNode.operational,
      ).createChallenge();
      await challengeTx.wait();

      // Get the challenge from storage to verify it
      const challenge = await RandomSamplingStorage.getNodeChallenge(
        publishingNodeIdentityId,
      );

      expect(challenge == null).to.equal(false);
      expect(challenge.solved).to.equal(false);
    });

    it('Should return the same challenge if unsolved within the period', async () => {
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);

      const { publishingNodeIdentityId } = await createProfilesAndKC(
        kcCreator,
        publishingNode,
        receivingNodes,
        { Profile, KnowledgeCollection, Token },
        merkleRoot,
      );
      const minStake = await ParametersStorage.minimumStake();
      await setNodeStake(
        publishingNode,
        BigInt(publishingNodeIdentityId),
        BigInt(minStake),
        accounts[0],
        { Token, Staking, Ask },
      );
      await Profile.connect(publishingNode.operational).updateAsk(
        publishingNodeIdentityId,
        100n,
      );
      await Ask.connect(accounts[0]).recalculateActiveSet();

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

    it('Should revert if creating challenge when already solved for current period', async () => {
      // Create profile and identity first
      const publishingNode = getDefaultPublishingNode(accounts);
      const { identityId } = await createProfile(Profile, publishingNode);

      // Create a mock challenge that's marked as solved
      const mockChallenge = await createMockChallenge(
        RandomSamplingStorage,
        KnowledgeCollectionStorage,
        Chronos,
      );

      // Store the mock challenge in the storage contract
      await RandomSamplingStorage.setNodeChallenge(identityId, mockChallenge);

      // Try to create a new challenge for the same period - should revert
      const challengeTx = RandomSampling.connect(
        publishingNode.operational,
      ).createChallenge();
      await expect(challengeTx).to.be.revertedWith(
        'The challenge for this proof period has already been solved',
      );
    });

    it('Should submit a valid proof successfully and calculate the correct score', async () => {
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);

      const { publishingNodeIdentityId } = await createProfilesAndKC(
        kcCreator,
        publishingNode,
        receivingNodes,
        { Profile, KnowledgeCollection, Token },
        merkleRoot,
      );

      // Mint tokens and set stake
      const minStake = await ParametersStorage.minimumStake();
      await setNodeStake(
        publishingNode,
        BigInt(publishingNodeIdentityId),
        BigInt(minStake),
        accounts[0],
        { Token, Staking, Ask },
      );

      // Recalculate the active set
      const newAsk = 200n;
      await Profile.connect(publishingNode.operational).updateAsk(
        publishingNodeIdentityId,
        newAsk,
      );
      await Ask.connect(accounts[0]).recalculateActiveSet();

      // Update and get the new active proof period
      const tx =
        await RandomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
      await tx.wait();

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
        challenge.chunkId,
      );

      // Submit proof
      const submitProofTx = await RandomSampling.connect(
        publishingNode.operational,
      ).submitProof(challengeChunk, proof);
      const receipt = await submitProofTx.wait();

      // Get the challenge from storage to verify it
      challenge = await RandomSamplingStorage.getNodeChallenge(
        publishingNodeIdentityId,
      );

      // Since the challenge was solved, the challenge should be marked as solved
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(challenge.solved).to.be.true;

      await expect(receipt)
        .to.emit(RandomSampling, 'ValidProofSubmitted')
        .withArgs(
          publishingNodeIdentityId,
          challenge.epoch,
          (score: bigint) => score > 0, // Just check score is positive, calculation checked elsewhere
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

    it('Should fail to submit proof for expired challenge', async () => {
      // Setup
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);
      const { publishingNodeIdentityId } = await createProfilesAndKC(
        kcCreator,
        publishingNode,
        receivingNodes,
        { Profile, KnowledgeCollection, Token },
        merkleRoot,
      );
      const minStake = await ParametersStorage.minimumStake();
      await setNodeStake(
        publishingNode,
        BigInt(publishingNodeIdentityId),
        BigInt(minStake),
        accounts[0],
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

    it('Should fail to submit invalid proof (wrong chunk/proof)', async () => {
      // Setup
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);
      const { publishingNodeIdentityId } = await createProfilesAndKC(
        kcCreator,
        publishingNode,
        receivingNodes,
        { Profile, KnowledgeCollection, Token },
        merkleRoot,
      );
      const minStake = await ParametersStorage.minimumStake();
      await setNodeStake(
        publishingNode,
        BigInt(publishingNodeIdentityId),
        BigInt(minStake),
        accounts[0],
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
      await expect(submitWrongChunkTx).to.be.revertedWith('Proof is not valid');
      let finalChallenge = await RandomSamplingStorage.getNodeChallenge(
        publishingNodeIdentityId,
      );
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(finalChallenge.solved).to.be.false; // Ensure state unchanged

      // Try submitting correct chunk with wrong proof
      const submitWrongProofTx = RandomSampling.connect(
        publishingNode.operational,
      ).submitProof(correctChunk, wrongProof);
      await expect(submitWrongProofTx).to.be.revertedWith('Proof is not valid');
      finalChallenge = await RandomSamplingStorage.getNodeChallenge(
        publishingNodeIdentityId,
      );
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(finalChallenge.solved).to.be.false; // Ensure state unchanged
    });

    it('Should fail challenge creation if no active Knowledge Collections exist', async () => {
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
        accounts[0],
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
