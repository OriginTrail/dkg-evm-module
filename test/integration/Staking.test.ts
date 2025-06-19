// test/rewards.initial-state.spec.ts
// @ts-nocheck
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import hre from 'hardhat';
import { randomBytes } from 'crypto';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

import {
  Token,
  Profile,
  ProfileStorage,
  Staking,
  Chronos,
  RandomSamplingStorage,
  EpochStorage,
  KnowledgeCollection,
  Hub,
  StakingStorage,
  RandomSampling,
  Ask,
  AskStorage,
  ParametersStorage,
} from '../../typechain';
import { createKnowledgeCollection } from '../helpers/kc-helpers';
import { createProfile } from '../helpers/profile-helpers';

/* ────────────────────────── helpers ────────────────────────── */

const toTRAC = (x: number) => hre.ethers.parseEther(x.toString());

// Sample data for KC (copied from full scenario)
const quads = [
  '<urn:us-cities:info:new-york> <http://schema.org/area> "468.9 sq mi" .',
  '<urn:us-cities:info:new-york> <http://schema.org/name> "New York" .',
  '<urn:us-cities:info:new-york> <http://schema.org/population> "8,336,817" .',
  '<urn:us-cities:info:new-york> <http://schema.org/state> "New York" .',
  '<urn:us-cities:info:new-york> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://schema.org/City> .',
  // Add more quads to ensure we have enough chunks
  ...Array(1000).fill(
    '<urn:fake:quad> <urn:fake:predicate> <urn:fake:object> .',
  ),
];

// Helper function to ensure node has chunks and submit proof
async function ensureNodeHasChunksThisEpoch(
  nodeId: number,
  node: { operational: SignerWithAddress; admin: SignerWithAddress },
  contracts: any,
  accounts: any,
  receivingNodes: {
    operational: SignerWithAddress;
    admin: SignerWithAddress;
  }[],
  receivingNodesIdentityIds: number[],
  chunkSize: number,
): Promise<void> {
  const produced =
    await contracts.epochStorage.getNodeCurrentEpochProducedKnowledgeValue(
      nodeId,
    );

  if (produced === 0n) {
    if (
      !receivingNodes.some(
        (r) => r.operational.address === node.operational.address,
      )
    ) {
      receivingNodes.unshift(node);
      receivingNodesIdentityIds.unshift(Number(nodeId));
    }

    const { kcTools } = await import('assertion-tools');
    const merkleRoot = kcTools.calculateMerkleRoot(quads, 32);

    await createKnowledgeCollection(
      node.operational, // signer = node.operational
      node, // publisher-node
      Number(nodeId),
      receivingNodes,
      receivingNodesIdentityIds,
      { KnowledgeCollection: contracts.kc, Token: contracts.token },
      merkleRoot,
      `ensure-chunks-${Date.now()}`,
      1, // knowledgeAssetsAmount
      chunkSize, // byteSize - must be >= CHUNK_BYTE_SIZE to avoid division by zero
      1, // epochs
      toTRAC(1),
    );

    await contracts.randomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
  }
}

// Helper function to advance to next proofing period
async function advanceToNextProofingPeriod(contracts: any): Promise<void> {
  const proofingPeriodDuration =
    await contracts.randomSamplingStorage.getActiveProofingPeriodDurationInBlocks();
  const { activeProofPeriodStartBlock, isValid } =
    await contracts.randomSamplingStorage.getActiveProofPeriodStatus();
  if (isValid) {
    // Find out how many blocks are left in the current proofing period
    const blocksLeft =
      Number(activeProofPeriodStartBlock) +
      Number(proofingPeriodDuration) -
      Number(await hre.network.provider.send('eth_blockNumber')) +
      1;
    for (let i = 0; i < blocksLeft; i++) {
      await hre.network.provider.send('evm_mine');
    }
  }
  await contracts.randomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
}

// Helper function to submit proof and log scores
async function submitProofAndLogScore(
  nodeId: number,
  nodeAccount: { operational: SignerWithAddress; admin: SignerWithAddress },
  contracts: any,
  epoch: bigint,
  nodeName: string,
) {
  // Get score before proof
  const scoreBefore = await contracts.randomSamplingStorage.getNodeEpochScore(
    epoch,
    nodeId,
  );

  // Create challenge and submit proof
  await contracts.randomSampling
    .connect(nodeAccount.operational)
    .createChallenge();
  const challenge =
    await contracts.randomSamplingStorage.getNodeChallenge(nodeId);

  // Calculate merkle proof for the challenge
  const { kcTools } = await import('assertion-tools');
  const chunks = kcTools.splitIntoChunks(quads, 32);
  const chunkId = Number(challenge[1]);
  const { proof } = kcTools.calculateMerkleProof(quads, 32, chunkId);

  await contracts.randomSampling
    .connect(nodeAccount.operational)
    .submitProof(chunks[chunkId], proof);

  // Get score after proof
  const scoreAfter = await contracts.randomSamplingStorage.getNodeEpochScore(
    epoch,
    nodeId,
  );
  const scorePerStake =
    await contracts.randomSamplingStorage.getNodeEpochScorePerStake(
      epoch,
      nodeId,
    );

  return { scoreBefore, scoreAfter, scorePerStake };
}

/* ───────────────────── fixture: build initial state ───────────────────── */

export async function buildInitialRewardsState() {
  await hre.deployments.fixture();

  const signers = await hre.ethers.getSigners();

  const contracts = {
    hub: await hre.ethers.getContract<Hub>('Hub'),
    token: await hre.ethers.getContract<Token>('Token'),
    chronos: await hre.ethers.getContract<Chronos>('Chronos'),
    profile: await hre.ethers.getContract<Profile>('Profile'),
    staking: await hre.ethers.getContract<Staking>('Staking'),
    stakingStorage:
      await hre.ethers.getContract<StakingStorage>('StakingStorage'),
    randomSamplingStorage: await hre.ethers.getContract<RandomSamplingStorage>(
      'RandomSamplingStorage',
    ),
    randomSampling:
      await hre.ethers.getContract<RandomSampling>('RandomSampling'),
    epochStorage: await hre.ethers.getContract<EpochStorage>('EpochStorageV8'),
    kc: await hre.ethers.getContract<KnowledgeCollection>(
      'KnowledgeCollection',
    ),
    ask: await hre.ethers.getContract<Ask>('Ask'),
    askStorage: await hre.ethers.getContract<AskStorage>('AskStorage'),
    parametersStorage:
      await hre.ethers.getContract<ParametersStorage>('ParametersStorage'),
    profileStorage:
      await hre.ethers.getContract<ProfileStorage>('ProfileStorage'),
  };

  // Get chunk size to avoid division by zero in challenge generation
  const chunkSize = Number(
    await contracts.randomSamplingStorage.CHUNK_BYTE_SIZE(),
  );

  const accounts = {
    owner: signers[0],
    // 4 nodes with separate operational and admin wallets
    node1: { operational: signers[1], admin: signers[2] },
    node2: { operational: signers[3], admin: signers[4] },
    node3: { operational: signers[5], admin: signers[6] },
    node4: { operational: signers[7], admin: signers[8] },
    // 12 delegators now (need more for the new distribution)
    delegators: signers.slice(10, 22),
    kcCreator: signers[9],
  };

  // Create receiving nodes arrays for proof submissions (all nodes)
  const receivingNodes = [
    accounts.node1,
    accounts.node2,
    accounts.node3,
    accounts.node4,
  ];
  const receivingNodesIdentityIds: number[] = [];

  await contracts.hub.setContractAddress('HubOwner', accounts.owner.address);

  // Initialize ask system to prevent division by zero
  await contracts.parametersStorage.setMinimumStake(toTRAC(100));
  await contracts.parametersStorage
    .connect(accounts.owner)
    .setOperatorFeeUpdateDelay(0);

  // Mint tokens for all delegators
  for (const delegator of accounts.delegators) {
    await contracts.token.mint(delegator.address, toTRAC(1_000_000));
  }
  await contracts.token.mint(accounts.kcCreator.address, toTRAC(1_000_000));

  // Create node profiles
  const { identityId: node1Id } = await createProfile(
    contracts.profile,
    accounts.node1,
  );
  const { identityId: node2Id } = await createProfile(
    contracts.profile,
    accounts.node2,
  );
  const { identityId: node3Id } = await createProfile(
    contracts.profile,
    accounts.node3,
  );
  const { identityId: node4Id } = await createProfile(
    contracts.profile,
    accounts.node4,
  );

  // Set operator fees to 10%
  await contracts.profile
    .connect(accounts.node1.admin)
    .updateOperatorFee(node1Id, 1000);
  await contracts.profile
    .connect(accounts.node2.admin)
    .updateOperatorFee(node2Id, 1000);
  await contracts.profile
    .connect(accounts.node3.admin)
    .updateOperatorFee(node3Id, 1000);
  await contracts.profile
    .connect(accounts.node4.admin)
    .updateOperatorFee(node4Id, 1000);

  // Populate receiving nodes identity IDs
  receivingNodesIdentityIds.push(node1Id, node2Id, node3Id, node4Id);

  // Initialize ask system for nodes
  const nodeAsk = hre.ethers.parseUnits('0.2', 18);
  await contracts.profile
    .connect(accounts.node1.operational)
    .updateAsk(node1Id, nodeAsk);
  await contracts.profile
    .connect(accounts.node2.operational)
    .updateAsk(node2Id, nodeAsk);
  await contracts.profile
    .connect(accounts.node3.operational)
    .updateAsk(node3Id, nodeAsk);
  await contracts.profile
    .connect(accounts.node4.operational)
    .updateAsk(node4Id, nodeAsk);
  await contracts.ask.connect(accounts.owner).recalculateActiveSet();

  const nodes = [
    {
      identityId: node1Id,
      operational: accounts.node1.operational,
      admin: accounts.node1.admin,
    },
    {
      identityId: node2Id,
      operational: accounts.node2.operational,
      admin: accounts.node2.admin,
    },
    {
      identityId: node3Id,
      operational: accounts.node3.operational,
      admin: accounts.node3.admin,
    },
    {
      identityId: node4Id,
      operational: accounts.node4.operational,
      admin: accounts.node4.admin,
    },
  ];

  // Jump to clean epoch start
  const timeUntilNextEpoch = await contracts.chronos.timeUntilNextEpoch();
  await time.increase(timeUntilNextEpoch + 1n);

  // Fast-forward to epoch-2
  while ((await contracts.chronos.getCurrentEpoch()) < 2n) {
    await time.increase((await contracts.chronos.timeUntilNextEpoch()) + 1n);
  }

  // Create reward pool for epoch-2
  const kcTokenAmount = toTRAC(1_000);
  const numberOfEpochs = 5;
  const { kcTools } = await import('assertion-tools');
  const merkleRoot = kcTools.calculateMerkleRoot(quads, 32);

  await createKnowledgeCollection(
    accounts.kcCreator,
    accounts.node1,
    node1Id,
    receivingNodes,
    receivingNodesIdentityIds,
    { KnowledgeCollection: contracts.kc, Token: contracts.token },
    merkleRoot,
    'epoch-2-reward-pool',
    10,
    chunkSize * 10, // byteSize - use multiple of chunkSize for better testing
    numberOfEpochs,
    kcTokenAmount,
  );

  // EPOCH-2 STAKES:
  // Node-1: D1→10k, D2→20k
  // Node-2: D3→10k, D4→20k (same pattern as Node-1)
  console.log(
    '\n╔══════════════════════════════════════════════════════════════════════════════════╗',
  );
  console.log(
    '║                                EPOCH-2 STAKING                                  ║',
  );
  console.log(
    '╠══════════════════════════════════════════════════════════════════════════════════╣',
  );

  // Node-1 delegators
  await contracts.token
    .connect(accounts.delegators[0])
    .approve(await contracts.staking.getAddress(), toTRAC(10_000));
  await contracts.staking
    .connect(accounts.delegators[0])
    .stake(node1Id, toTRAC(10_000));
  console.log(
    '║  📍 D1  →  10,000 TRAC  →  Node-1                                               ║',
  );

  await contracts.token
    .connect(accounts.delegators[1])
    .approve(await contracts.staking.getAddress(), toTRAC(20_000));
  await contracts.staking
    .connect(accounts.delegators[1])
    .stake(node1Id, toTRAC(20_000));
  console.log(
    '║  📍 D2  →  20,000 TRAC  →  Node-1                                               ║',
  );

  // Node-2 delegators (same pattern)
  await contracts.token
    .connect(accounts.delegators[2])
    .approve(await contracts.staking.getAddress(), toTRAC(10_000));
  await contracts.staking
    .connect(accounts.delegators[2])
    .stake(node2Id, toTRAC(10_000));
  console.log(
    '║  📍 D3  →  10,000 TRAC  →  Node-2                                               ║',
  );

  await contracts.token
    .connect(accounts.delegators[3])
    .approve(await contracts.staking.getAddress(), toTRAC(20_000));
  await contracts.staking
    .connect(accounts.delegators[3])
    .stake(node2Id, toTRAC(20_000));
  console.log(
    '║  📍 D4  →  20,000 TRAC  →  Node-2                                               ║',
  );
  console.log(
    '╚══════════════════════════════════════════════════════════════════════════════════╝',
  );

  // Submit proofs at end of epoch-2
  await advanceToNextProofingPeriod(contracts);

  // Ensure nodes have chunks before submitting proofs
  await ensureNodeHasChunksThisEpoch(
    node1Id,
    accounts.node1,
    contracts,
    accounts,
    receivingNodes,
    receivingNodesIdentityIds,
    chunkSize,
  );
  await ensureNodeHasChunksThisEpoch(
    node2Id,
    accounts.node2,
    contracts,
    accounts,
    receivingNodes,
    receivingNodesIdentityIds,
    chunkSize,
  );

  console.log('\n🔬 EPOCH-2 PROOFS SUBMITTED:');
  const node1Proof2 = await submitProofAndLogScore(
    node1Id,
    accounts.node1,
    contracts,
    2n,
    'Node-1',
  );
  console.log(
    `   ✅ Node-1: Score ${node1Proof2.scoreBefore} → ${node1Proof2.scoreAfter} (gain: ${node1Proof2.scoreAfter - node1Proof2.scoreBefore})`,
  );

  const node2Proof2 = await submitProofAndLogScore(
    node2Id,
    accounts.node2,
    contracts,
    2n,
    'Node-2',
  );
  console.log(
    `   ✅ Node-2: Score ${node2Proof2.scoreBefore} → ${node2Proof2.scoreAfter} (gain: ${node2Proof2.scoreAfter - node2Proof2.scoreBefore})`,
  );

  // → EPOCH-3
  await time.increase((await contracts.chronos.timeUntilNextEpoch()) + 1n);

  // Create reward pool for epoch-3
  await createKnowledgeCollection(
    accounts.kcCreator,
    accounts.node2,
    node2Id,
    [accounts.node1, accounts.node3, accounts.node4],
    [node1Id, node3Id, node4Id],
    { KnowledgeCollection: contracts.kc, Token: contracts.token },
    merkleRoot, // Use consistent merkleRoot from quads
    'epoch-3-reward-pool',
    1,
    chunkSize * 5, // byteSize - use multiple of chunkSize
    1,
    toTRAC(100),
  );

  // EPOCH-3 STAKES:
  // Node-1: D5→30k, D6→40k, D7→50k
  // Node-2: D8→30k, D9→40k, D10→50k (same pattern as Node-1)
  // Node-3: D11→60k, D12→50k (original Node-2 pattern from your request)
  console.log(
    '\n╔══════════════════════════════════════════════════════════════════════════════════╗',
  );
  console.log(
    '║                                EPOCH-3 STAKING                                  ║',
  );
  console.log(
    '╠══════════════════════════════════════════════════════════════════════════════════╣',
  );

  // Node-1 additional delegators
  await contracts.token
    .connect(accounts.delegators[4])
    .approve(await contracts.staking.getAddress(), toTRAC(30_000));
  await contracts.staking
    .connect(accounts.delegators[4])
    .stake(node1Id, toTRAC(30_000));
  console.log(
    '║  📍 D5  →  30,000 TRAC  →  Node-1                                               ║',
  );

  await contracts.token
    .connect(accounts.delegators[5])
    .approve(await contracts.staking.getAddress(), toTRAC(40_000));
  await contracts.staking
    .connect(accounts.delegators[5])
    .stake(node1Id, toTRAC(40_000));
  console.log(
    '║  📍 D6  →  40,000 TRAC  →  Node-1                                               ║',
  );

  await contracts.token
    .connect(accounts.delegators[6])
    .approve(await contracts.staking.getAddress(), toTRAC(50_000));
  await contracts.staking
    .connect(accounts.delegators[6])
    .stake(node1Id, toTRAC(50_000));
  console.log(
    '║  📍 D7  →  50,000 TRAC  →  Node-1                                               ║',
  );

  // Node-2 additional delegators (same pattern as Node-1)
  await contracts.token
    .connect(accounts.delegators[7])
    .approve(await contracts.staking.getAddress(), toTRAC(30_000));
  await contracts.staking
    .connect(accounts.delegators[7])
    .stake(node2Id, toTRAC(30_000));
  console.log(
    '║  📍 D8  →  30,000 TRAC  →  Node-2                                               ║',
  );

  await contracts.token
    .connect(accounts.delegators[8])
    .approve(await contracts.staking.getAddress(), toTRAC(40_000));
  await contracts.staking
    .connect(accounts.delegators[8])
    .stake(node2Id, toTRAC(40_000));
  console.log(
    '║  📍 D9  →  40,000 TRAC  →  Node-2                                               ║',
  );

  await contracts.token
    .connect(accounts.delegators[9])
    .approve(await contracts.staking.getAddress(), toTRAC(50_000));
  await contracts.staking
    .connect(accounts.delegators[9])
    .stake(node2Id, toTRAC(50_000));
  console.log(
    '║  📍 D10 →  50,000 TRAC  →  Node-2                                               ║',
  );

  // Node-3 delegators (your original Node-2 pattern)
  await contracts.token
    .connect(accounts.delegators[10])
    .approve(await contracts.staking.getAddress(), toTRAC(60_000));
  await contracts.staking
    .connect(accounts.delegators[10])
    .stake(node3Id, toTRAC(60_000));
  console.log(
    '║  📍 D11 →  60,000 TRAC  →  Node-3                                               ║',
  );

  await contracts.token
    .connect(accounts.delegators[11])
    .approve(await contracts.staking.getAddress(), toTRAC(50_000));
  await contracts.staking
    .connect(accounts.delegators[11])
    .stake(node3Id, toTRAC(50_000));
  console.log(
    '║  📍 D12 →  50,000 TRAC  →  Node-3                                               ║',
  );
  console.log(
    '╚══════════════════════════════════════════════════════════════════════════════════╝',
  );

  // Submit proofs at end of epoch-3
  await advanceToNextProofingPeriod(contracts);

  // Ensure nodes have chunks before submitting proofs
  await ensureNodeHasChunksThisEpoch(
    node1Id,
    accounts.node1,
    contracts,
    accounts,
    receivingNodes,
    receivingNodesIdentityIds,
    chunkSize,
  );
  await ensureNodeHasChunksThisEpoch(
    node2Id,
    accounts.node2,
    contracts,
    accounts,
    receivingNodes,
    receivingNodesIdentityIds,
    chunkSize,
  );
  await ensureNodeHasChunksThisEpoch(
    node3Id,
    accounts.node3,
    contracts,
    accounts,
    receivingNodes,
    receivingNodesIdentityIds,
    chunkSize,
  );

  console.log('\n🔬 EPOCH-3 PROOFS SUBMITTED:');
  const node1Proof3 = await submitProofAndLogScore(
    node1Id,
    accounts.node1,
    contracts,
    3n,
    'Node-1',
  );
  console.log(
    `   ✅ Node-1: Score ${node1Proof3.scoreBefore} → ${node1Proof3.scoreAfter} (gain: ${node1Proof3.scoreAfter - node1Proof3.scoreBefore})`,
  );

  const node2Proof3 = await submitProofAndLogScore(
    node2Id,
    accounts.node2,
    contracts,
    3n,
    'Node-2',
  );
  console.log(
    `   ✅ Node-2: Score ${node2Proof3.scoreBefore} → ${node2Proof3.scoreAfter} (gain: ${node2Proof3.scoreAfter - node2Proof3.scoreBefore})`,
  );

  const node3Proof3 = await submitProofAndLogScore(
    node3Id,
    accounts.node3,
    contracts,
    3n,
    'Node-3',
  );
  console.log(
    `   ✅ Node-3: Score ${node3Proof3.scoreBefore} → ${node3Proof3.scoreAfter} (gain: ${node3Proof3.scoreAfter - node3Proof3.scoreBefore})`,
  );

  // → EPOCH-4 (to finalize epoch-3)
  await time.increase((await contracts.chronos.timeUntilNextEpoch()) + 1n);

  // Create KC to finalize epoch-3 (this is crucial for epoch finalization!)
  await createKnowledgeCollection(
    accounts.kcCreator,
    accounts.node4,
    node4Id,
    [accounts.node1, accounts.node2, accounts.node3],
    [node1Id, node2Id, node3Id],
    { KnowledgeCollection: contracts.kc, Token: contracts.token },
    merkleRoot, // Use consistent merkleRoot from quads
    'finalize-epoch-3',
    10,
    chunkSize * 20, // byteSize - use multiple of chunkSize
    10,
    toTRAC(50_000),
  );

  // Print detailed snapshot
  console.log('\n');
  console.log(
    '═══════════════════════════════════════════════════════════════════════════════════════════════',
  );
  console.log(
    '                                 🎯 FINAL SYSTEM STATE 🎯                                      ',
  );
  console.log(
    '═══════════════════════════════════════════════════════════════════════════════════════════════',
  );

  const currentEpoch = await contracts.chronos.getCurrentEpoch();
  const lastFinalizedEpoch = await contracts.epochStorage.lastFinalizedEpoch(1);
  console.log(
    `📅 Current Epoch: ${currentEpoch} | Last Finalized: ${lastFinalizedEpoch}`,
  );
  console.log('');

  console.log(
    '┌─────────────────────────────────────────────────────────────────────────────────────────────┐',
  );
  console.log(
    '│                                     📊 STAKING TIMELINE                                     │',
  );
  console.log(
    '├─────────────────────────────────────────────────────────────────────────────────────────────┤',
  );
  console.log(
    '│  EPOCH-2: D1→10k, D2→20k (Node-1)  │  D3→10k, D4→20k (Node-2)                           │',
  );
  console.log(
    '│  EPOCH-3: D5→30k, D6→40k, D7→50k (Node-1)  │  D8→30k, D9→40k, D10→50k (Node-2)         │',
  );
  console.log(
    '│           D11→60k, D12→50k (Node-3)                                                      │',
  );
  console.log(
    '└─────────────────────────────────────────────────────────────────────────────────────────────┘',
  );
  console.log('');

  for (const [i, node] of nodes.entries()) {
    const totalStake = await contracts.stakingStorage.getNodeStake(
      node.identityId,
    );
    const nodeScore2 = await contracts.randomSamplingStorage.getNodeEpochScore(
      2n,
      node.identityId,
    );
    const nodeScore3 = await contracts.randomSamplingStorage.getNodeEpochScore(
      3n,
      node.identityId,
    );

    console.log(`🚀 Node-${i + 1} (ID: ${node.identityId})`);
    console.log(
      `   💰 Total Stake: ${hre.ethers.formatUnits(totalStake, 18)} TRAC | 🎯 Operator Fee: 10%`,
    );
    console.log(
      `   📊 Scores → Epoch-2: ${nodeScore2} | Epoch-3: ${nodeScore3}`,
    );

    const delegatorStakes = [];
    for (let d = 0; d < accounts.delegators.length; d++) {
      const key = hre.ethers.keccak256(
        hre.ethers.solidityPacked(
          ['address'],
          [accounts.delegators[d].address],
        ),
      );
      const stake = await contracts.stakingStorage.getDelegatorStakeBase(
        node.identityId,
        key,
      );
      if (stake > 0n) {
        delegatorStakes.push(`D${d + 1}: ${hre.ethers.formatUnits(stake, 18)}`);
      }
    }

    if (delegatorStakes.length > 0) {
      console.log(`   👥 Delegators: ${delegatorStakes.join(' | ')}`);
    }
    console.log('');
  }

  console.log(
    '═══════════════════════════════════════════════════════════════════════════════════════════════\n',
  );

  // Return environment for tests
  return {
    Token: contracts.token,
    Profile: contracts.profile,
    ProfileStorage: contracts.profileStorage,
    Staking: contracts.staking,
    Chronos: contracts.chronos,
    RandomSamplingStorage: contracts.randomSamplingStorage,
    EpochStorage: contracts.epochStorage,
    KC: contracts.kc,
    delegators: accounts.delegators,
    nodes,
    receivingNodes,
    receivingNodesIdentityIds,
    accounts,
  };
}

/* ───────────────────────────── tests ───────────────────────────── */

describe('rewards tests', () => {
  /* fixture state visible to all tests in this describe-block */
  let env: Awaited<ReturnType<typeof buildInitialRewardsState>>;

  before(async () => {
    env = await buildInitialRewardsState();
  });

  /* 1️⃣  Claim-jumping guard. */
  it('D1 cannot claim the newest finalised epoch while older remain unclaimed', async () => {
    const { Staking, EpochStorage, delegators, nodes } = env;
    const newestFinalised = await EpochStorage.lastFinalizedEpoch(1); //  == 3
    await expect(
      Staking.connect(delegators[0]).claimDelegatorRewards(
        nodes[0].identityId,
        newestFinalised,
        delegators[0].address,
      ),
    ).to.be.reverted;
  });

  /* 2️⃣  Operator-fee sanity (all nodes @ 1000 ‱). */
  it('every node stores 10 % operator fee', async () => {
    const { ProfileStorage, nodes } = env;
    for (const n of nodes) {
      const opFee = await ProfileStorage.getOperatorFee(n.identityId);
      expect(opFee).to.equal(1000); // 1000 ‱  ==  10 %
    }
  });

  /* Add more `it()` tests below using env.* contracts & objects. */
});
