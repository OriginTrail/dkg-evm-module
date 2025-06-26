/* eslint-disable @typescript-eslint/no-explicit-any */
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre from 'hardhat';

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
  DelegatorsInfo,
  ShardingTable,
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
  contracts: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  accounts: any, // eslint-disable-line @typescript-eslint/no-explicit-any
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

    // @ts-expect-error – dynamic CJS import of assertion-tools
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

    await contracts.randomSampling.updateAndGetActiveProofPeriodStartBlock();
  }
}

// Helper function to advance to next proofing period
async function advanceToNextProofingPeriod(
  contracts: any, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<void> {
  const proofingPeriodDuration =
    await contracts.randomSampling.getActiveProofingPeriodDurationInBlocks();
  const { activeProofPeriodStartBlock, isValid } =
    await contracts.randomSampling.getActiveProofPeriodStatus();
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
  await contracts.randomSampling.updateAndGetActiveProofPeriodStartBlock();
}

// Helper function to submit proof and log scores
async function submitProofAndLogScore(
  nodeId: number,
  nodeAccount: { operational: SignerWithAddress; admin: SignerWithAddress },
  contracts: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  epoch: bigint,
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
  // @ts-expect-error – dynamic CJS import of assertion-tools
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
    delegatorsInfo:
      await hre.ethers.getContract<DelegatorsInfo>('DelegatorsInfo'),
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
    shardingTable: await hre.ethers.getContract<ShardingTable>('ShardingTable'),
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

  // Add nodes to sharding table
  // @ts-expect-error – intentional direct insertNode for test setup
  await contracts.shardingTable.connect(accounts.owner).insertNode(node1Id);
  // @ts-expect-error – intentional direct insertNode for test setup
  await contracts.shardingTable.connect(accounts.owner).insertNode(node2Id);
  // @ts-expect-error – intentional direct insertNode for test setup
  await contracts.shardingTable.connect(accounts.owner).insertNode(node3Id);
  // @ts-expect-error – intentional direct insertNode for test setup
  await contracts.shardingTable.connect(accounts.owner).insertNode(node4Id);

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

  // Create identical reward pools for epoch-2 (each node publishes same amount)
  const kcTokenAmount = toTRAC(250); // Split total among 4 nodes
  const numberOfEpochs = 5;
  // @ts-expect-error – dynamic CJS import of assertion-tools
  const { kcTools } = await import('assertion-tools');
  const merkleRoot = kcTools.calculateMerkleRoot(quads, 32);

  // Create identical KC for each node to ensure equal publishing values
  for (let i = 0; i < nodes.length; i++) {
    const publisherNode = nodes[i];
    const otherNodes = nodes.filter((_, idx) => idx !== i);
    const otherNodeIds = otherNodes.map((n) => n.identityId);

    await createKnowledgeCollection(
      accounts.kcCreator,
      publisherNode,
      publisherNode.identityId,
      otherNodes,
      otherNodeIds,
      { KnowledgeCollection: contracts.kc, Token: contracts.token },
      merkleRoot,
      `epoch-2-node-${i + 1}-kc`,
      3, // Same knowledge assets amount for all
      chunkSize * 3, // Same byte size for all
      numberOfEpochs,
      kcTokenAmount, // Same token amount for all
    );
  }

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

  // All nodes already have equal KC chunks from the identical KC creation above
  // No need for ensureNodeHasChunksThisEpoch() since each node published identical KC

  console.log('\n🔬 EPOCH-2 PROOFS SUBMITTED:');
  const node1Proof2 = await submitProofAndLogScore(
    node1Id,
    accounts.node1,
    contracts,
    2n,
  );
  console.log(
    `   ✅ Node-1: Score ${node1Proof2.scoreBefore} → ${node1Proof2.scoreAfter} (gain: ${node1Proof2.scoreAfter - node1Proof2.scoreBefore})`,
  );

  const node2Proof2 = await submitProofAndLogScore(
    node2Id,
    accounts.node2,
    contracts,
    2n,
  );
  console.log(
    `   ✅ Node-2: Score ${node2Proof2.scoreBefore} → ${node2Proof2.scoreAfter} (gain: ${node2Proof2.scoreAfter - node2Proof2.scoreBefore})`,
  );

  const node3Proof2 = await submitProofAndLogScore(
    node3Id,
    accounts.node3,
    contracts,
    2n,
  );
  console.log(
    `   ✅ Node-3: Score ${node3Proof2.scoreBefore} → ${node3Proof2.scoreAfter} (gain: ${node3Proof2.scoreAfter - node3Proof2.scoreBefore})`,
  );

  const node4Proof2 = await submitProofAndLogScore(
    node4Id,
    accounts.node4,
    contracts,
    2n,
  );
  console.log(
    `   ✅ Node-4: Score ${node4Proof2.scoreBefore} → ${node4Proof2.scoreAfter} (gain: ${node4Proof2.scoreAfter - node4Proof2.scoreBefore})`,
  );

  // → EPOCH-3
  await time.increase((await contracts.chronos.timeUntilNextEpoch()) + 1n);

  // Create identical reward pools for epoch-3 (each node publishes same amount)
  const kcTokenAmountEpoch3 = toTRAC(100); // Split total among 4 nodes
  const numberOfEpochsEpoch3 = 1;

  // Create identical KC for each node to ensure equal publishing values
  for (let i = 0; i < nodes.length; i++) {
    const publisherNode = nodes[i];
    const otherNodes = nodes.filter((_, idx) => idx !== i);
    const otherNodeIds = otherNodes.map((n) => n.identityId);

    await createKnowledgeCollection(
      accounts.kcCreator,
      publisherNode,
      publisherNode.identityId,
      otherNodes,
      otherNodeIds,
      { KnowledgeCollection: contracts.kc, Token: contracts.token },
      merkleRoot,
      `epoch-3-node-${i + 1}-kc`,
      1, // Same knowledge assets amount for all
      chunkSize * 5, // Same byte size for all
      numberOfEpochsEpoch3,
      kcTokenAmountEpoch3, // Same token amount for all
    );
  }

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

  // All nodes already have equal KC chunks from the identical KC creation above
  // No need for ensureNodeHasChunksThisEpoch() since each node published identical KC

  console.log('\n🔬 EPOCH-3 PROOFS SUBMITTED:');
  const node1Proof3 = await submitProofAndLogScore(
    node1Id,
    accounts.node1,
    contracts,
    3n,
  );
  console.log(
    `   ✅ Node-1: Score ${node1Proof3.scoreBefore} → ${node1Proof3.scoreAfter} (gain: ${node1Proof3.scoreAfter - node1Proof3.scoreBefore})`,
  );

  const node2Proof3 = await submitProofAndLogScore(
    node2Id,
    accounts.node2,
    contracts,
    3n,
  );
  console.log(
    `   ✅ Node-2: Score ${node2Proof3.scoreBefore} → ${node2Proof3.scoreAfter} (gain: ${node2Proof3.scoreAfter - node2Proof3.scoreBefore})`,
  );

  const node3Proof3 = await submitProofAndLogScore(
    node3Id,
    accounts.node3,
    contracts,
    3n,
  );
  console.log(
    `   ✅ Node-3: Score ${node3Proof3.scoreBefore} → ${node3Proof3.scoreAfter} (gain: ${node3Proof3.scoreAfter - node3Proof3.scoreBefore})`,
  );

  const node4Proof3 = await submitProofAndLogScore(
    node4Id,
    accounts.node4,
    contracts,
    3n,
  );
  console.log(
    `   ✅ Node-4: Score ${node4Proof3.scoreBefore} → ${node4Proof3.scoreAfter} (gain: ${node4Proof3.scoreAfter - node4Proof3.scoreBefore})`,
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

  // Submit proofs at end of epoch-4
  await advanceToNextProofingPeriod(contracts);

  // Ensure all nodes have chunks before submitting proofs for epoch-4
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
  await ensureNodeHasChunksThisEpoch(
    node4Id,
    accounts.node4,
    contracts,
    accounts,
    receivingNodes,
    receivingNodesIdentityIds,
    chunkSize,
  );

  console.log('\n🔬 EPOCH-4 PROOFS SUBMITTED:');
  const node1Proof4 = await submitProofAndLogScore(
    node1Id,
    accounts.node1,
    contracts,
    4n,
  );
  console.log(
    `   ✅ Node-1: Score ${node1Proof4.scoreBefore} → ${node1Proof4.scoreAfter} (gain: ${node1Proof4.scoreAfter - node1Proof4.scoreBefore})`,
  );

  const node2Proof4 = await submitProofAndLogScore(
    node2Id,
    accounts.node2,
    contracts,
    4n,
  );
  console.log(
    `   ✅ Node-2: Score ${node2Proof4.scoreBefore} → ${node2Proof4.scoreAfter} (gain: ${node2Proof4.scoreAfter - node2Proof4.scoreBefore})`,
  );

  const node3Proof4 = await submitProofAndLogScore(
    node3Id,
    accounts.node3,
    contracts,
    4n,
  );
  console.log(
    `   ✅ Node-3: Score ${node3Proof4.scoreBefore} → ${node3Proof4.scoreAfter} (gain: ${node3Proof4.scoreAfter - node3Proof4.scoreBefore})`,
  );

  const node4Proof4 = await submitProofAndLogScore(
    node4Id,
    accounts.node4,
    contracts,
    4n,
  );
  console.log(
    `   ✅ Node-4: Score ${node4Proof4.scoreBefore} → ${node4Proof4.scoreAfter} (gain: ${node4Proof4.scoreAfter - node4Proof4.scoreBefore})`,
  );

  // → EPOCH-5
  await time.increase((await contracts.chronos.timeUntilNextEpoch()) + 1n);

  // Create KC for epoch-5 to ensure there's activity
  await createKnowledgeCollection(
    accounts.kcCreator,
    accounts.node1,
    node1Id,
    [accounts.node2, accounts.node3, accounts.node4],
    [node2Id, node3Id, node4Id],
    { KnowledgeCollection: contracts.kc, Token: contracts.token },
    merkleRoot, // Use consistent merkleRoot from quads
    'epoch-5-no-proofs',
    5,
    chunkSize * 15, // byteSize - use multiple of chunkSize
    3,
    toTRAC(2_000),
  );

  // EPOCH-5 STAKES:
  // Add delegator 13 and 14 with 35k TRAC each
  console.log(
    '\n╔══════════════════════════════════════════════════════════════════════════════════╗',
  );
  console.log(
    '║                                EPOCH-5 STAKING                                  ║',
  );
  console.log(
    '╠══════════════════════════════════════════════════════════════════════════════════╣',
  );

  // Need to add more delegators to accounts since we only had 12 before
  if (accounts.delegators.length < 14) {
    const additionalDelegators = signers.slice(22, 24); // Get signers 22 and 23 for D13 and D14
    accounts.delegators.push(...additionalDelegators);

    // Mint tokens for new delegators
    for (const delegator of additionalDelegators) {
      await contracts.token.mint(delegator.address, toTRAC(1_000_000));
    }
  }

  // D13 stakes 35k to Node-1
  await contracts.token
    .connect(accounts.delegators[12])
    .approve(await contracts.staking.getAddress(), toTRAC(35_000));
  await contracts.staking
    .connect(accounts.delegators[12])
    .stake(node1Id, toTRAC(35_000));
  console.log(
    '║  📍 D13 →  35,000 TRAC  →  Node-1                                               ║',
  );

  // D14 stakes 35k to Node-2
  await contracts.token
    .connect(accounts.delegators[13])
    .approve(await contracts.staking.getAddress(), toTRAC(35_000));
  await contracts.staking
    .connect(accounts.delegators[13])
    .stake(node2Id, toTRAC(35_000));
  console.log(
    '║  📍 D14 →  35,000 TRAC  →  Node-2                                               ║',
  );
  console.log(
    '╚══════════════════════════════════════════════════════════════════════════════════╝',
  );

  console.log('\n🚫 EPOCH-5: NO PROOFS SUBMITTED');

  // → EPOCH-6 (to finalize epoch-5)
  await time.increase((await contracts.chronos.timeUntilNextEpoch()) + 1n);

  // Create KC for epoch-6 to finalize epoch-5
  await createKnowledgeCollection(
    accounts.kcCreator,
    accounts.node3,
    node3Id,
    [accounts.node1, accounts.node2, accounts.node4],
    [node1Id, node2Id, node4Id],
    { KnowledgeCollection: contracts.kc, Token: contracts.token },
    merkleRoot, // Use consistent merkleRoot from quads
    'finalize-epoch-5',
    8,
    chunkSize * 25, // byteSize - use multiple of chunkSize
    5,
    toTRAC(10_000),
  );

  console.log('\n🚫 EPOCH-6: NO PROOFS SUBMITTED');

  // → EPOCH-7 (to finalize epoch-6)
  await time.increase((await contracts.chronos.timeUntilNextEpoch()) + 1n);

  // Create KC for epoch-7 to finalize epoch-6
  await createKnowledgeCollection(
    accounts.kcCreator,
    accounts.node4,
    node4Id,
    [accounts.node1, accounts.node2, accounts.node3],
    [node1Id, node2Id, node3Id],
    { KnowledgeCollection: contracts.kc, Token: contracts.token },
    merkleRoot, // Use consistent merkleRoot from quads
    'finalize-epoch-6',
    12,
    chunkSize * 30, // byteSize - use multiple of chunkSize
    8,
    toTRAC(15_000),
  );

  console.log('\n📝 EPOCH-7: System ready for comprehensive testing');

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
    '│  EPOCH-2: D1→10k, D2→20k (Node-1)  │  D3→10k, D4→20k (Node-2)  │  All nodes proofs    │',
  );
  console.log(
    '│  EPOCH-3: D5→30k, D6→40k, D7→50k (Node-1)  │  D8→30k, D9→40k, D10→50k (Node-2)         │',
  );
  console.log(
    '│           D11→60k, D12→50k (Node-3)  │  All nodes submitted proofs                     │',
  );
  console.log(
    '│  EPOCH-4: All nodes submitted proofs                                                     │',
  );
  console.log(
    '│  EPOCH-5: D13→35k (Node-1)  │  D14→35k (Node-2)  │  NO PROOFS SUBMITTED               │',
  );
  console.log(
    '│  EPOCH-6: NO PROOFS SUBMITTED (finalization epoch for epoch-5)                          │',
  );
  console.log(
    '│  EPOCH-7: Current epoch (finalization epoch for epoch-6)                                │',
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
    const nodeScore4 = await contracts.randomSamplingStorage.getNodeEpochScore(
      4n,
      node.identityId,
    );
    const nodeScore5 = await contracts.randomSamplingStorage.getNodeEpochScore(
      5n,
      node.identityId,
    );

    console.log(`🚀 Node-${i + 1} (ID: ${node.identityId})`);
    console.log(
      `   💰 Total Stake: ${hre.ethers.formatUnits(totalStake, 18)} TRAC | 🎯 Operator Fee: 10%`,
    );
    console.log(
      `   📊 Scores → E2: ${nodeScore2} | E3: ${nodeScore3} | E4: ${nodeScore4} | E5: ${nodeScore5}`,
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
    StakingStorage: contracts.stakingStorage,
    DelegatorsInfo: contracts.delegatorsInfo,
    Chronos: contracts.chronos,
    RandomSampling: contracts.randomSampling,
    RandomSamplingStorage: contracts.randomSamplingStorage,
    EpochStorage: contracts.epochStorage,
    ParametersStorage: contracts.parametersStorage,
    KC: contracts.kc,
    delegators: accounts.delegators,
    nodes,
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

describe('Claim order enforcement tests', () => {
  /* fixture state visible to all tests in this describe-block */
  let env: Awaited<ReturnType<typeof buildInitialRewardsState>>;

  before(async () => {
    env = await buildInitialRewardsState();
  });

  it('D1, D3 attempt to claim epoch 3 rewards - should revert (must claim epoch 2 first)', async () => {
    const { Staking, delegators, nodes } = env;

    console.log(
      '\n⛔ TEST 1: D1, D3 attempting to claim epoch 3 - should revert',
    );

    // D1 attempts to claim epoch 3
    await expect(
      Staking.connect(delegators[0]).claimDelegatorRewards(
        nodes[0].identityId, // Node-1
        3n, // epoch 3
        delegators[0].address,
      ),
    ).to.be.revertedWith('Must claim older epochs first');

    console.log('    ✅ D1 claim for epoch 3 reverted as expected');

    // D3 attempts to claim epoch 3
    await expect(
      Staking.connect(delegators[2]).claimDelegatorRewards(
        nodes[1].identityId, // Node-2
        3n, // epoch 3
        delegators[2].address,
      ),
    ).to.be.revertedWith('Must claim older epochs first');

    console.log('    ✅ D3 claim for epoch 3 reverted as expected');
  });

  it('D1, D3 attempt to claim epoch 4 rewards - should revert (must claim epoch 2 first)', async () => {
    const { Staking, delegators, nodes } = env;

    console.log(
      '\n⛔ TEST 2: D1, D3 attempting to claim epoch 4 - should revert',
    );

    // D1 attempts to claim epoch 4
    await expect(
      Staking.connect(delegators[0]).claimDelegatorRewards(
        nodes[0].identityId, // Node-1
        4n, // epoch 4
        delegators[0].address,
      ),
    ).to.be.revertedWith('Must claim older epochs first');

    console.log('    ✅ D1 claim for epoch 4 reverted as expected');

    // D3 attempts to claim epoch 4
    await expect(
      Staking.connect(delegators[2]).claimDelegatorRewards(
        nodes[1].identityId, // Node-2
        4n, // epoch 4
        delegators[2].address,
      ),
    ).to.be.revertedWith('Must claim older epochs first');

    console.log('    ✅ D3 claim for epoch 4 reverted as expected');
  });

  it('D1, D3 attempt to claim epoch 5 rewards - should revert (must claim epoch 2 first)', async () => {
    const { Staking, delegators, nodes } = env;

    console.log(
      '\n⛔ TEST 3: D1, D3 attempting to claim epoch 5 - should revert',
    );

    // D1 attempts to claim epoch 5
    await expect(
      Staking.connect(delegators[0]).claimDelegatorRewards(
        nodes[0].identityId, // Node-1
        5n, // epoch 5
        delegators[0].address,
      ),
    ).to.be.revertedWith('Must claim older epochs first');

    console.log('    ✅ D1 claim for epoch 5 reverted as expected');

    // D3 attempts to claim epoch 5
    await expect(
      Staking.connect(delegators[2]).claimDelegatorRewards(
        nodes[1].identityId, // Node-2
        5n, // epoch 5
        delegators[2].address,
      ),
    ).to.be.revertedWith('Must claim older epochs first');

    console.log('    ✅ D3 claim for epoch 5 reverted as expected');
  });

  it('D5, D8, D10 attempt to claim epoch 2 rewards - should revert (were not delegators in that epoch)', async () => {
    const { Staking, delegators, nodes } = env;

    console.log(
      '\n⛔ TEST 4: D5, D8, D10 attempting to claim epoch 2 - should revert (not delegators then)',
    );

    // D5 attempts to claim epoch 2 (but was not delegator in epoch 2)
    await expect(
      Staking.connect(delegators[4]).claimDelegatorRewards(
        nodes[0].identityId, // Node-1
        2n, // epoch 2
        delegators[4].address,
      ),
    ).to.be.revertedWith('Epoch already claimed');

    console.log(
      '    ✅ D5 claim for epoch 2 reverted as expected (was not delegator)',
    );

    // D8 attempts to claim epoch 2 (but was not delegator in epoch 2)
    await expect(
      Staking.connect(delegators[7]).claimDelegatorRewards(
        nodes[1].identityId, // Node-2
        2n, // epoch 2
        delegators[7].address,
      ),
    ).to.be.revertedWith('Epoch already claimed');

    console.log(
      '    ✅ D8 claim for epoch 2 reverted as expected (was not delegator)',
    );

    // D10 attempts to claim epoch 2 (but was not delegator in epoch 2)
    await expect(
      Staking.connect(delegators[9]).claimDelegatorRewards(
        nodes[1].identityId, // Node-2
        2n, // epoch 2
        delegators[9].address,
      ),
    ).to.be.revertedWith('Epoch already claimed');

    console.log(
      '    ✅ D10 claim for epoch 2 reverted as expected (was not delegator)',
    );
  });

  it('D1, D3 successfully claim epoch 2 rewards - should succeed with equal rewards', async () => {
    const {
      Staking,
      StakingStorage,
      DelegatorsInfo,
      RandomSamplingStorage,
      delegators,
      nodes,
    } = env;

    console.log('\n✅ TEST 5: D1, D3 successfully claiming epoch 2 rewards');

    // Get initial state
    const d1Key = hre.ethers.keccak256(
      hre.ethers.solidityPacked(['address'], [delegators[0].address]),
    );
    const d3Key = hre.ethers.keccak256(
      hre.ethers.solidityPacked(['address'], [delegators[2].address]),
    );

    const d1StakeBaseBefore = await StakingStorage.getDelegatorStakeBase(
      nodes[0].identityId,
      d1Key,
    );
    const d3StakeBaseBefore = await StakingStorage.getDelegatorStakeBase(
      nodes[1].identityId,
      d3Key,
    );

    const d1RollingBefore = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[0].identityId,
      delegators[0].address,
    );
    const d3RollingBefore = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[1].identityId,
      delegators[2].address,
    );

    // Verify nodes have equal scores (due to identical KC setup)
    const node1Score2 = await RandomSamplingStorage.getNodeEpochScore(
      2n,
      nodes[0].identityId,
    );
    const node2Score2 = await RandomSamplingStorage.getNodeEpochScore(
      2n,
      nodes[1].identityId,
    );

    expect(node1Score2).to.equal(
      node2Score2,
      'Node-1 and Node-2 should have equal scores',
    );
    console.log(`    📊 Both nodes have equal score: ${node1Score2}`);

    // D1 claims epoch 2 rewards
    await Staking.connect(delegators[0]).claimDelegatorRewards(
      nodes[0].identityId, // Node-1
      2n, // epoch 2
      delegators[0].address,
    );

    console.log('    ✅ D1 successfully claimed epoch 2 rewards');

    // D3 claims epoch 2 rewards
    await Staking.connect(delegators[2]).claimDelegatorRewards(
      nodes[1].identityId, // Node-2
      2n, // epoch 2
      delegators[2].address,
    );

    console.log('    ✅ D3 successfully claimed epoch 2 rewards');

    // Get final state
    const d1StakeBaseAfter = await StakingStorage.getDelegatorStakeBase(
      nodes[0].identityId,
      d1Key,
    );
    const d3StakeBaseAfter = await StakingStorage.getDelegatorStakeBase(
      nodes[1].identityId,
      d3Key,
    );

    const d1RollingAfter = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[0].identityId,
      delegators[0].address,
    );
    const d3RollingAfter = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[1].identityId,
      delegators[2].address,
    );

    // Calculate rewards and stake changes
    const d1Reward = d1RollingAfter - d1RollingBefore;
    const d3Reward = d3RollingAfter - d3RollingBefore;
    const d1StakeChange = d1StakeBaseAfter - d1StakeBaseBefore;
    const d3StakeChange = d3StakeBaseAfter - d3StakeBaseBefore;

    console.log(
      `    💰 D1 rolling reward: ${hre.ethers.formatUnits(d1Reward, 18)} TRAC`,
    );
    console.log(
      `    💰 D3 rolling reward: ${hre.ethers.formatUnits(d3Reward, 18)} TRAC`,
    );

    // Verify equal rewards (since equal stakes and equal node scores)
    expect(d1Reward).to.equal(
      d3Reward,
      'D1 and D3 should receive equal rewards',
    );

    // StakeBase should not change (future epochs remain to claim)
    expect(d1StakeChange).to.equal(
      0n,
      'D1 stakeBase should not change (rolling rewards)',
    );
    expect(d3StakeChange).to.equal(
      0n,
      'D3 stakeBase should not change (rolling rewards)',
    );

    // Both should receive positive rewards
    expect(d1Reward).to.be.gt(0n, 'D1 rolling rewards should be positive');
    expect(d3Reward).to.be.gt(0n, 'D3 rolling rewards should be positive');

    console.log('    ✅ Both delegators received equal rolling rewards');
    console.log(
      '    ✅ StakeBase remained unchanged - rewards went to rolling rewards',
    );
    console.log(
      '    📝 Note: Equal stakes + equal node performance = equal rewards',
    );
  });

  it('Node scores verification - Node-1 and Node-2 should have identical scores in epoch 2', async () => {
    const { RandomSamplingStorage, nodes } = env;

    console.log('\n✅ TEST 6: Verifying equal node scores in epoch 2');

    // Get node scores for epoch 2
    const node1Score = await RandomSamplingStorage.getNodeEpochScore(
      2n,
      nodes[0].identityId,
    );
    const node2Score = await RandomSamplingStorage.getNodeEpochScore(
      2n,
      nodes[1].identityId,
    );
    const node3Score = await RandomSamplingStorage.getNodeEpochScore(
      2n,
      nodes[2].identityId,
    );
    const node4Score = await RandomSamplingStorage.getNodeEpochScore(
      2n,
      nodes[3].identityId,
    );

    // Get score per stake
    const node1ScorePerStake =
      await RandomSamplingStorage.getNodeEpochScorePerStake(
        2n,
        nodes[0].identityId,
      );
    const node2ScorePerStake =
      await RandomSamplingStorage.getNodeEpochScorePerStake(
        2n,
        nodes[1].identityId,
      );

    console.log(`    📊 Node-1 score: ${node1Score}`);
    console.log(`    📊 Node-2 score: ${node2Score}`);
    console.log(`    📊 Node-3 score: ${node3Score} (should be 0 - no stake)`);
    console.log(`    📊 Node-4 score: ${node4Score} (should be 0 - no stake)`);
    console.log(`    📈 Node-1 score per stake: ${node1ScorePerStake}`);
    console.log(`    📈 Node-2 score per stake: ${node2ScorePerStake}`);

    // Verify equal scores for nodes with stakes
    expect(node1Score).to.equal(
      node2Score,
      'Node-1 and Node-2 should have equal total scores',
    );
    expect(node1ScorePerStake).to.equal(
      node2ScorePerStake,
      'Node-1 and Node-2 should have equal score per stake',
    );

    // Verify zero scores for nodes without stakes
    expect(node3Score).to.equal(
      0n,
      'Node-3 should have zero score (no stake in epoch 2)',
    );
    expect(node4Score).to.equal(
      0n,
      'Node-4 should have zero score (no stake in epoch 2)',
    );

    // Both nodes should have positive scores
    expect(node1Score).to.be.gt(0n, 'Node-1 should have positive score');
    expect(node2Score).to.be.gt(0n, 'Node-2 should have positive score');

    console.log(
      '    ✅ Node-1 and Node-2 have identical scores and score per stake',
    );
    console.log(
      '    ✅ Node-3 and Node-4 have zero scores (no stakes in epoch 2)',
    );
    console.log(
      '    📝 Note: Equal KC setup resulted in equal node performance',
    );
  });

  it('D1, D3 claim epoch 3 rewards - rolling rewards should accumulate', async () => {
    const {
      Staking,
      DelegatorsInfo,
      RandomSamplingStorage,
      delegators,
      nodes,
    } = env;

    console.log(
      '\n✅ TEST 7: D1, D3 claiming epoch 3 rewards - rolling accumulation',
    );

    // Get rolling rewards after epoch 2 claims (from previous test)
    const d1RollingAfterEpoch2 =
      await DelegatorsInfo.getDelegatorRollingRewards(
        nodes[0].identityId,
        delegators[0].address,
      );
    const d3RollingAfterEpoch2 =
      await DelegatorsInfo.getDelegatorRollingRewards(
        nodes[1].identityId,
        delegators[2].address,
      );

    console.log(
      `    🔄 D1 rolling after epoch 2: ${hre.ethers.formatUnits(d1RollingAfterEpoch2, 18)} TRAC`,
    );
    console.log(
      `    🔄 D3 rolling after epoch 2: ${hre.ethers.formatUnits(d3RollingAfterEpoch2, 18)} TRAC`,
    );

    // Verify both have some rolling rewards from epoch 2
    expect(d1RollingAfterEpoch2).to.be.gt(
      0n,
      'D1 should have rolling rewards from epoch 2',
    );
    expect(d3RollingAfterEpoch2).to.be.gt(
      0n,
      'D3 should have rolling rewards from epoch 2',
    );

    // Check epoch 3 node scores (these will be different due to different stakes)
    const node1Score3 = await RandomSamplingStorage.getNodeEpochScore(
      3n,
      nodes[0].identityId,
    );
    const node2Score3 = await RandomSamplingStorage.getNodeEpochScore(
      3n,
      nodes[1].identityId,
    );

    console.log(`    📊 Node-1 epoch 3 score: ${node1Score3}`);
    console.log(`    📊 Node-2 epoch 3 score: ${node2Score3}`);

    // D1 claims epoch 3 rewards
    await Staking.connect(delegators[0]).claimDelegatorRewards(
      nodes[0].identityId, // Node-1
      3n, // epoch 3
      delegators[0].address,
    );

    console.log('    ✅ D1 successfully claimed epoch 3 rewards');

    // D3 claims epoch 3 rewards
    await Staking.connect(delegators[2]).claimDelegatorRewards(
      nodes[1].identityId, // Node-2
      3n, // epoch 3
      delegators[2].address,
    );

    console.log('    ✅ D3 successfully claimed epoch 3 rewards');

    // Get rolling rewards after epoch 3 claims
    const d1RollingAfterEpoch3 =
      await DelegatorsInfo.getDelegatorRollingRewards(
        nodes[0].identityId,
        delegators[0].address,
      );
    const d3RollingAfterEpoch3 =
      await DelegatorsInfo.getDelegatorRollingRewards(
        nodes[1].identityId,
        delegators[2].address,
      );

    // Calculate epoch 3 rewards
    const d1Epoch3Reward = d1RollingAfterEpoch3 - d1RollingAfterEpoch2;
    const d3Epoch3Reward = d3RollingAfterEpoch3 - d3RollingAfterEpoch2;

    console.log(
      `    💰 D1 epoch 3 reward: ${hre.ethers.formatUnits(d1Epoch3Reward, 18)} TRAC`,
    );
    console.log(
      `    💰 D3 epoch 3 reward: ${hre.ethers.formatUnits(d3Epoch3Reward, 18)} TRAC`,
    );
    console.log(
      `    🔄 D1 total rolling after epoch 3: ${hre.ethers.formatUnits(d1RollingAfterEpoch3, 18)} TRAC`,
    );
    console.log(
      `    🔄 D3 total rolling after epoch 3: ${hre.ethers.formatUnits(d3RollingAfterEpoch3, 18)} TRAC`,
    );

    // Verify rolling rewards increased (accumulated)
    expect(d1RollingAfterEpoch3).to.be.gt(
      d1RollingAfterEpoch2,
      'D1 rolling rewards should increase after epoch 3 claim',
    );
    expect(d3RollingAfterEpoch3).to.be.gt(
      d3RollingAfterEpoch2,
      'D3 rolling rewards should increase after epoch 3 claim',
    );

    // Both should receive positive epoch 3 rewards
    expect(d1Epoch3Reward).to.be.gt(
      0n,
      'D1 should receive positive epoch 3 rewards',
    );
    expect(d3Epoch3Reward).to.be.gt(
      0n,
      'D3 should receive positive epoch 3 rewards',
    );

    // Verify accumulation: total = epoch2 + epoch3
    expect(d1RollingAfterEpoch3).to.equal(
      d1RollingAfterEpoch2 + d1Epoch3Reward,
      'D1 total rolling should equal epoch 2 + epoch 3 rewards',
    );
    expect(d3RollingAfterEpoch3).to.equal(
      d3RollingAfterEpoch2 + d3Epoch3Reward,
      'D3 total rolling should equal epoch 2 + epoch 3 rewards',
    );

    console.log(
      '    ✅ Rolling rewards successfully accumulated from both epochs',
    );
    console.log('    ✅ Both delegators received positive epoch 3 rewards');
    console.log(
      '    📝 Note: Rolling rewards = Epoch 2 rewards + Epoch 3 rewards',
    );
  });

  it('D1, D3 attempt to claim epoch 5 rewards - should revert (must claim epoch 4 first)', async () => {
    const { Staking, delegators, nodes } = env;

    console.log(
      '\n⛔ TEST 8: D1, D3 attempting to claim epoch 5 - should revert (must claim epoch 4 first)',
    );

    // D1 attempts to claim epoch 5 (but hasn't claimed epoch 4 yet)
    await expect(
      Staking.connect(delegators[0]).claimDelegatorRewards(
        nodes[0].identityId, // Node-1
        5n, // epoch 5
        delegators[0].address,
      ),
    ).to.be.revertedWith('Must claim older epochs first');

    console.log(
      '    ✅ D1 claim for epoch 5 reverted as expected (must claim epoch 4 first)',
    );

    // D3 attempts to claim epoch 5 (but hasn't claimed epoch 4 yet)
    await expect(
      Staking.connect(delegators[2]).claimDelegatorRewards(
        nodes[1].identityId, // Node-2
        5n, // epoch 5
        delegators[2].address,
      ),
    ).to.be.revertedWith('Must claim older epochs first');

    console.log(
      '    ✅ D3 claim for epoch 5 reverted as expected (must claim epoch 4 first)',
    );
    console.log(
      '    📝 Note: Sequential claiming enforced - cannot skip epoch 4',
    );
  });

  it('D1, D3 claim epoch 4 rewards - should succeed with equal rewards (equal stakes + all nodes submitted proofs)', async () => {
    const {
      Staking,
      DelegatorsInfo,
      RandomSamplingStorage,
      delegators,
      nodes,
    } = env;

    console.log(
      '\n✅ TEST 9: D1, D3 claiming epoch 4 rewards - should get equal rewards',
    );

    // Get rolling rewards before epoch 4 claims (should have epoch 2 + epoch 3 rewards)
    const d1RollingBefore = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[0].identityId,
      delegators[0].address,
    );
    const d3RollingBefore = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[1].identityId,
      delegators[2].address,
    );

    console.log(
      `    🔄 D1 rolling before epoch 4: ${hre.ethers.formatUnits(d1RollingBefore, 18)} TRAC`,
    );
    console.log(
      `    🔄 D3 rolling before epoch 4: ${hre.ethers.formatUnits(d3RollingBefore, 18)} TRAC`,
    );

    // Check epoch 4 node scores (should be positive since all nodes submitted proofs)
    const node1Score4 = await RandomSamplingStorage.getNodeEpochScore(
      4n,
      nodes[0].identityId,
    );
    const node2Score4 = await RandomSamplingStorage.getNodeEpochScore(
      4n,
      nodes[1].identityId,
    );

    console.log(`    📊 Node-1 epoch 4 score: ${node1Score4}`);
    console.log(`    📊 Node-2 epoch 4 score: ${node2Score4}`);

    // Both nodes should have positive scores (all submitted proofs)
    expect(node1Score4).to.be.gt(
      0n,
      'Node-1 should have positive score in epoch 4',
    );
    expect(node2Score4).to.be.gt(
      0n,
      'Node-2 should have positive score in epoch 4',
    );

    // D1 claims epoch 4 rewards
    await Staking.connect(delegators[0]).claimDelegatorRewards(
      nodes[0].identityId, // Node-1
      4n, // epoch 4
      delegators[0].address,
    );

    console.log('    ✅ D1 successfully claimed epoch 4 rewards');

    // D3 claims epoch 4 rewards
    await Staking.connect(delegators[2]).claimDelegatorRewards(
      nodes[1].identityId, // Node-2
      4n, // epoch 4
      delegators[2].address,
    );

    console.log('    ✅ D3 successfully claimed epoch 4 rewards');

    // Get rolling rewards after epoch 4 claims
    const d1RollingAfter = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[0].identityId,
      delegators[0].address,
    );
    const d3RollingAfter = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[1].identityId,
      delegators[2].address,
    );

    // Calculate epoch 4 rewards
    const d1Epoch4Reward = d1RollingAfter - d1RollingBefore;
    const d3Epoch4Reward = d3RollingAfter - d3RollingBefore;

    console.log(
      `    💰 D1 epoch 4 reward: ${hre.ethers.formatUnits(d1Epoch4Reward, 18)} TRAC`,
    );
    console.log(
      `    💰 D3 epoch 4 reward: ${hre.ethers.formatUnits(d3Epoch4Reward, 18)} TRAC`,
    );
    console.log(
      `    🔄 D1 total rolling after epoch 4: ${hre.ethers.formatUnits(d1RollingAfter, 18)} TRAC`,
    );
    console.log(
      `    🔄 D3 total rolling after epoch 4: ${hre.ethers.formatUnits(d3RollingAfter, 18)} TRAC`,
    );

    // Verify rolling rewards increased (accumulated)
    expect(d1RollingAfter).to.be.gt(
      d1RollingBefore,
      'D1 rolling rewards should increase after epoch 4 claim',
    );
    expect(d3RollingAfter).to.be.gt(
      d3RollingBefore,
      'D3 rolling rewards should increase after epoch 4 claim',
    );

    // Both should receive positive epoch 4 rewards
    expect(d1Epoch4Reward).to.be.gt(
      0n,
      'D1 should receive positive epoch 4 rewards',
    );
    expect(d3Epoch4Reward).to.be.gt(
      0n,
      'D3 should receive positive epoch 4 rewards',
    );

    // Verify equal rewards (equal stakes in epoch 4, all nodes submitted proofs)
    expect(d1Epoch4Reward).to.equal(
      d3Epoch4Reward,
      'D1 and D3 should receive equal epoch 4 rewards (equal stakes)',
    );

    console.log(
      '    ✅ Rolling rewards successfully accumulated (epochs 2+3+4)',
    );
    console.log('    ✅ Both delegators received equal epoch 4 rewards');
    console.log(
      '    📝 Note: Equal stakes + all nodes submitted proofs = equal rewards',
    );
  });

  it('D1, D3 attempt to claim epoch 6 rewards - should revert (must claim epoch 5 first)', async () => {
    const { Staking, delegators, nodes } = env;

    console.log(
      '\n⛔ TEST 10: D1, D3 attempting to claim epoch 6 - should revert (must claim epoch 5 first)',
    );

    // D1 attempts to claim epoch 6 (but hasn't claimed epoch 5 yet)
    await expect(
      Staking.connect(delegators[0]).claimDelegatorRewards(
        nodes[0].identityId, // Node-1
        6n, // epoch 6
        delegators[0].address,
      ),
    ).to.be.revertedWith('Must claim older epochs first');

    console.log(
      '    ✅ D1 claim for epoch 6 reverted as expected (must claim epoch 5 first)',
    );

    // D3 attempts to claim epoch 6 (but hasn't claimed epoch 5 yet)
    await expect(
      Staking.connect(delegators[2]).claimDelegatorRewards(
        nodes[1].identityId, // Node-2
        6n, // epoch 6
        delegators[2].address,
      ),
    ).to.be.revertedWith('Must claim older epochs first');

    console.log(
      '    ✅ D3 claim for epoch 6 reverted as expected (must claim epoch 5 first)',
    );
    console.log(
      '    📝 Note: Sequential claiming enforced - cannot skip epoch 5',
    );
  });

  it('D1, D3 claim epoch 5 rewards - should succeed with 0 rewards (no proofs submitted)', async () => {
    const {
      Staking,
      DelegatorsInfo,
      RandomSamplingStorage,
      delegators,
      nodes,
    } = env;

    console.log(
      '\n✅ TEST 11: D1, D3 claiming epoch 5 rewards - should get 0 rewards (no proofs)',
    );

    // Get rolling rewards before epoch 5 claims (should have epoch 2+3+4 rewards)
    const d1RollingBefore = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[0].identityId,
      delegators[0].address,
    );
    const d3RollingBefore = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[1].identityId,
      delegators[2].address,
    );

    console.log(
      `    🔄 D1 rolling before epoch 5: ${hre.ethers.formatUnits(d1RollingBefore, 18)} TRAC`,
    );
    console.log(
      `    🔄 D3 rolling before epoch 5: ${hre.ethers.formatUnits(d3RollingBefore, 18)} TRAC`,
    );

    // Check epoch 5 node scores (should be 0 since no proofs were submitted)
    const node1Score5 = await RandomSamplingStorage.getNodeEpochScore(
      5n,
      nodes[0].identityId,
    );
    const node2Score5 = await RandomSamplingStorage.getNodeEpochScore(
      5n,
      nodes[1].identityId,
    );

    console.log(`    📊 Node-1 epoch 5 score: ${node1Score5} (should be 0)`);
    console.log(`    📊 Node-2 epoch 5 score: ${node2Score5} (should be 0)`);

    // Verify scores are 0 (no proofs submitted)
    expect(node1Score5).to.equal(0n, 'Node-1 should have 0 score in epoch 5');
    expect(node2Score5).to.equal(0n, 'Node-2 should have 0 score in epoch 5');

    // D1 claims epoch 5 rewards (should succeed but get 0 rewards)
    await Staking.connect(delegators[0]).claimDelegatorRewards(
      nodes[0].identityId, // Node-1
      5n, // epoch 5
      delegators[0].address,
    );

    console.log('    ✅ D1 successfully claimed epoch 5 rewards (0 TRAC)');

    // D3 claims epoch 5 rewards (should succeed but get 0 rewards)
    await Staking.connect(delegators[2]).claimDelegatorRewards(
      nodes[1].identityId, // Node-2
      5n, // epoch 5
      delegators[2].address,
    );

    console.log('    ✅ D3 successfully claimed epoch 5 rewards (0 TRAC)');

    // Get rolling rewards after epoch 5 claims
    const d1RollingAfter = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[0].identityId,
      delegators[0].address,
    );
    const d3RollingAfter = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[1].identityId,
      delegators[2].address,
    );

    // Calculate epoch 5 rewards (should be 0)
    const d1Epoch5Reward = d1RollingAfter - d1RollingBefore;
    const d3Epoch5Reward = d3RollingAfter - d3RollingBefore;

    console.log(
      `    💰 D1 epoch 5 reward: ${hre.ethers.formatUnits(d1Epoch5Reward, 18)} TRAC`,
    );
    console.log(
      `    💰 D3 epoch 5 reward: ${hre.ethers.formatUnits(d3Epoch5Reward, 18)} TRAC`,
    );
    console.log(
      `    🔄 D1 total rolling after epoch 5: ${hre.ethers.formatUnits(d1RollingAfter, 18)} TRAC`,
    );
    console.log(
      `    🔄 D3 total rolling after epoch 5: ${hre.ethers.formatUnits(d3RollingAfter, 18)} TRAC`,
    );

    // Verify rolling rewards didn't change (no rewards from epoch 5)
    expect(d1RollingAfter).to.equal(
      d1RollingBefore,
      'D1 rolling rewards should not change (no epoch 5 rewards)',
    );
    expect(d3RollingAfter).to.equal(
      d3RollingBefore,
      'D3 rolling rewards should not change (no epoch 5 rewards)',
    );

    // Verify epoch 5 rewards are 0
    expect(d1Epoch5Reward).to.equal(
      0n,
      'D1 should receive 0 rewards from epoch 5',
    );
    expect(d3Epoch5Reward).to.equal(
      0n,
      'D3 should receive 0 rewards from epoch 5',
    );

    // Verify both have same rolling rewards (should be equal after epochs 2+3+4)
    expect(d1RollingAfter).to.equal(
      d3RollingAfter,
      'D1 and D3 should have equal rolling rewards (equal stakes in all claimed epochs)',
    );

    console.log(
      '    ✅ Both delegators successfully claimed epoch 5 with 0 rewards',
    );
    console.log('    ✅ Rolling rewards remained unchanged (no new rewards)');
    console.log('    ✅ Both delegators have equal rolling rewards');
    console.log('    📝 Note: No proofs in epoch 5 = no rewards to distribute');
  });

  it('D1, D3 attempt to claim epoch 5 rewards again - should revert (already claimed)', async () => {
    const { Staking, delegators, nodes } = env;

    console.log(
      '\n⛔ TEST 12: D1, D3 attempting to claim epoch 5 again - should revert (already claimed)',
    );

    // D1 attempts to claim epoch 5 again (but already claimed it)
    await expect(
      Staking.connect(delegators[0]).claimDelegatorRewards(
        nodes[0].identityId, // Node-1
        5n, // epoch 5
        delegators[0].address,
      ),
    ).to.be.revertedWith('Epoch already claimed');

    console.log(
      '    ✅ D1 claim for epoch 5 reverted as expected (already claimed)',
    );

    // D3 attempts to claim epoch 5 again (but already claimed it)
    await expect(
      Staking.connect(delegators[2]).claimDelegatorRewards(
        nodes[1].identityId, // Node-2
        5n, // epoch 5
        delegators[2].address,
      ),
    ).to.be.revertedWith('Epoch already claimed');

    console.log(
      '    ✅ D3 claim for epoch 5 reverted as expected (already claimed)',
    );
    console.log(
      '    📝 Note: Cannot claim the same epoch twice - double claiming prevented',
    );
  });

  it('D1, D3 attempt to claim epoch 7 rewards - should revert (epoch not finalized)', async () => {
    const { Staking, delegators, nodes } = env;

    console.log(
      '\n⛔ TEST 13: D1, D3 attempting to claim epoch 7 - should revert (epoch not finalized)',
    );

    // D1 attempts to claim epoch 7 (but epoch 7 is not finalized yet)
    await expect(
      Staking.connect(delegators[0]).claimDelegatorRewards(
        nodes[0].identityId, // Node-1
        7n, // epoch 7
        delegators[0].address,
      ),
    ).to.be.revertedWith('Epoch not finalised');

    console.log(
      '    ✅ D1 claim for epoch 7 reverted as expected (epoch not finalized)',
    );

    // D3 attempts to claim epoch 7 (but epoch 7 is not finalized yet)
    await expect(
      Staking.connect(delegators[2]).claimDelegatorRewards(
        nodes[1].identityId, // Node-2
        7n, // epoch 7
        delegators[2].address,
      ),
    ).to.be.revertedWith('Epoch not finalised');

    console.log(
      '    ✅ D3 claim for epoch 7 reverted as expected (epoch not finalized)',
    );
    console.log('    📝 Note: Cannot claim rewards for non-finalized epochs');
  });

  it('D1, D3 claim epoch 6 rewards - should succeed with 0 rewards (no proofs submitted)', async () => {
    const {
      Staking,
      DelegatorsInfo,
      RandomSamplingStorage,
      delegators,
      nodes,
    } = env;

    console.log(
      '\n✅ TEST 14: D1, D3 claiming epoch 6 rewards - should get 0 rewards (no proofs)',
    );

    // Get rolling rewards before epoch 6 claims (should have epoch 2+3+4+5 rewards)
    const d1RollingBefore = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[0].identityId,
      delegators[0].address,
    );
    const d3RollingBefore = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[1].identityId,
      delegators[2].address,
    );

    console.log(
      `    🔄 D1 rolling before epoch 6: ${hre.ethers.formatUnits(d1RollingBefore, 18)} TRAC`,
    );
    console.log(
      `    🔄 D3 rolling before epoch 6: ${hre.ethers.formatUnits(d3RollingBefore, 18)} TRAC`,
    );

    // Check epoch 6 node scores (should be 0 since no proofs were submitted)
    const node1Score6 = await RandomSamplingStorage.getNodeEpochScore(
      6n,
      nodes[0].identityId,
    );
    const node2Score6 = await RandomSamplingStorage.getNodeEpochScore(
      6n,
      nodes[1].identityId,
    );

    console.log(`    📊 Node-1 epoch 6 score: ${node1Score6} (should be 0)`);
    console.log(`    📊 Node-2 epoch 6 score: ${node2Score6} (should be 0)`);

    // Verify scores are 0 (no proofs submitted)
    expect(node1Score6).to.equal(0n, 'Node-1 should have 0 score in epoch 6');
    expect(node2Score6).to.equal(0n, 'Node-2 should have 0 score in epoch 6');

    // D1 claims epoch 6 rewards (should succeed but get 0 rewards)
    await Staking.connect(delegators[0]).claimDelegatorRewards(
      nodes[0].identityId, // Node-1
      6n, // epoch 6
      delegators[0].address,
    );

    console.log('    ✅ D1 successfully claimed epoch 6 rewards (0 TRAC)');

    // D3 claims epoch 6 rewards (should succeed but get 0 rewards)
    await Staking.connect(delegators[2]).claimDelegatorRewards(
      nodes[1].identityId, // Node-2
      6n, // epoch 6
      delegators[2].address,
    );

    console.log('    ✅ D3 successfully claimed epoch 6 rewards (0 TRAC)');

    // Get rolling rewards after epoch 6 claims
    const d1RollingAfter = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[0].identityId,
      delegators[0].address,
    );
    const d3RollingAfter = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[1].identityId,
      delegators[2].address,
    );

    // Read actual values from contracts after claiming
    const d1RollingTransferred = d1RollingBefore - d1RollingAfter; // How much was transferred
    const d3RollingTransferred = d3RollingBefore - d3RollingAfter; // How much was transferred

    console.log(`    💰 D1 epoch 6 reward: 0.0 TRAC (no proofs submitted)`);
    console.log(`    💰 D3 epoch 6 reward: 0.0 TRAC (no proofs submitted)`);
    console.log(
      `    🔄 D1 rolling transferred: ${hre.ethers.formatUnits(d1RollingTransferred, 18)} TRAC → stakeBase`,
    );
    console.log(
      `    🔄 D3 rolling transferred: ${hre.ethers.formatUnits(d3RollingTransferred, 18)} TRAC → stakeBase`,
    );
    console.log(
      `    🔄 D1 total rolling after epoch 6: ${hre.ethers.formatUnits(d1RollingAfter, 18)} TRAC`,
    );
    console.log(
      `    🔄 D3 total rolling after epoch 6: ${hre.ethers.formatUnits(d3RollingAfter, 18)} TRAC`,
    );

    // Get stakeBase after epoch 6 claims to check if rolling rewards were transferred
    const d1StakeBaseAfter = await env.StakingStorage.getDelegatorStakeBase(
      nodes[0].identityId,
      hre.ethers.keccak256(
        hre.ethers.solidityPacked(['address'], [delegators[0].address]),
      ),
    );
    const d3StakeBaseAfter = await env.StakingStorage.getDelegatorStakeBase(
      nodes[1].identityId,
      hre.ethers.keccak256(
        hre.ethers.solidityPacked(['address'], [delegators[2].address]),
      ),
    );

    console.log(
      `    💎 D1 stakeBase after epoch 6: ${hre.ethers.formatUnits(d1StakeBaseAfter, 18)} TRAC`,
    );
    console.log(
      `    💎 D3 stakeBase after epoch 6: ${hre.ethers.formatUnits(d3StakeBaseAfter, 18)} TRAC`,
    );

    // Verify epoch 6 behavior - no new rewards, but rolling rewards transferred
    // Since no proofs were submitted in epoch 6, no new rewards should be generated
    // But rolling rewards should be transferred to stakeBase since this is the last claimable epoch

    // Since epoch 6 is the last claimable epoch (epoch 7 is current and not finalized),
    // rolling rewards should have been transferred to stakeBase
    expect(d1RollingAfter).to.equal(
      0n,
      'D1 rolling rewards should be 0 (transferred to stakeBase as last epoch)',
    );
    expect(d3RollingAfter).to.equal(
      0n,
      'D3 rolling rewards should be 0 (transferred to stakeBase as last epoch)',
    );

    // Verify that rolling rewards were properly transferred to stakeBase
    // Both delegators should have equal stakeBase (since they had equal stakes and equal rewards)
    expect(d1StakeBaseAfter).to.equal(
      d3StakeBaseAfter,
      'D1 and D3 should have equal stakeBase after claiming all epochs',
    );

    // Verify that stakeBase increased by the amount of rolling rewards that were transferred
    expect(d1StakeBaseAfter).to.be.gt(
      toTRAC(10_000),
      'D1 stakeBase should be greater than original 10k stake (includes transferred rewards)',
    );
    expect(d3StakeBaseAfter).to.be.gt(
      toTRAC(10_000),
      'D3 stakeBase should be greater than original 10k stake (includes transferred rewards)',
    );

    console.log(
      '    ✅ Both delegators successfully claimed epoch 6 with 0 rewards',
    );
    console.log(
      '    ✅ Rolling rewards transferred to stakeBase (last claimable epoch)',
    );
    console.log('    ✅ Both delegators have equal final stakeBase');
    console.log(
      '    📝 Note: Last epoch claim transfers rolling rewards to stakeBase',
    );
  });

  it('D1, D3 attempt to claim epoch 7 rewards again - should revert (epoch not finalized)', async () => {
    const { Staking, delegators, nodes, Chronos, EpochStorage } = env;

    console.log(
      '\n⛔ TEST 15: D1, D3 attempting to claim epoch 7 - should revert (epoch not finalized)',
    );

    // Verify current state
    const currentEpoch = await Chronos.getCurrentEpoch();
    const lastFinalizedEpoch = await EpochStorage.lastFinalizedEpoch(1);

    console.log(`    ℹ️  Current epoch: ${currentEpoch}`);
    console.log(`    ℹ️  Last finalized epoch: ${lastFinalizedEpoch}`);

    // Verify epoch 7 is current and not finalized
    expect(currentEpoch).to.equal(7n, 'Current epoch should be 7');
    expect(lastFinalizedEpoch).to.be.lt(
      7n,
      'Epoch 7 should not be finalized yet',
    );

    // D1 attempts to claim epoch 7 (but epoch 7 is current and not finalized)
    await expect(
      Staking.connect(delegators[0]).claimDelegatorRewards(
        nodes[0].identityId, // Node-1
        7n, // epoch 7
        delegators[0].address,
      ),
    ).to.be.revertedWith('Epoch not finalised');

    console.log(
      '    ✅ D1 claim for epoch 7 reverted as expected (epoch not finalized)',
    );

    // D3 attempts to claim epoch 7 (but epoch 7 is current and not finalized)
    await expect(
      Staking.connect(delegators[2]).claimDelegatorRewards(
        nodes[1].identityId, // Node-2
        7n, // epoch 7
        delegators[2].address,
      ),
    ).to.be.revertedWith('Epoch not finalised');

    console.log(
      '    ✅ D3 claim for epoch 7 reverted as expected (epoch not finalized)',
    );
    console.log(
      '    📝 Note: Cannot claim rewards for current/non-finalized epochs',
    );
    console.log(
      '    📝 Note: Epoch must be finalized before rewards can be claimed',
    );
  });
});

describe('Proportional rewards tests - Double stake = Double rewards', () => {
  /* fixture state visible to all tests in this describe-block */
  let env: Awaited<ReturnType<typeof buildInitialRewardsState>>;

  before(async () => {
    env = await buildInitialRewardsState();
  });

  it('D1, D2, D3, D4 claim epoch 2 rewards - D2 and D4 should get double rewards (double stakes)', async () => {
    const {
      Staking,
      DelegatorsInfo,
      RandomSamplingStorage,
      delegators,
      nodes,
    } = env;

    console.log(
      '\n✅ PROPORTIONAL TEST 1: Epoch 2 rewards - Double stake = Double rewards',
    );

    // Verify stakes first
    const d1Key = hre.ethers.keccak256(
      hre.ethers.solidityPacked(['address'], [delegators[0].address]),
    );
    const d2Key = hre.ethers.keccak256(
      hre.ethers.solidityPacked(['address'], [delegators[1].address]),
    );
    const d3Key = hre.ethers.keccak256(
      hre.ethers.solidityPacked(['address'], [delegators[2].address]),
    );
    const d4Key = hre.ethers.keccak256(
      hre.ethers.solidityPacked(['address'], [delegators[3].address]),
    );

    const d1Stake = await env.StakingStorage.getDelegatorStakeBase(
      nodes[0].identityId,
      d1Key,
    );
    const d2Stake = await env.StakingStorage.getDelegatorStakeBase(
      nodes[0].identityId,
      d2Key,
    );
    const d3Stake = await env.StakingStorage.getDelegatorStakeBase(
      nodes[1].identityId,
      d3Key,
    );
    const d4Stake = await env.StakingStorage.getDelegatorStakeBase(
      nodes[1].identityId,
      d4Key,
    );

    console.log(
      `    💰 D1 stake: ${hre.ethers.formatUnits(d1Stake, 18)} TRAC (Node-1)`,
    );
    console.log(
      `    💰 D2 stake: ${hre.ethers.formatUnits(d2Stake, 18)} TRAC (Node-1)`,
    );
    console.log(
      `    💰 D3 stake: ${hre.ethers.formatUnits(d3Stake, 18)} TRAC (Node-2)`,
    );
    console.log(
      `    💰 D4 stake: ${hre.ethers.formatUnits(d4Stake, 18)} TRAC (Node-2)`,
    );

    // Verify stake ratios
    expect(d2Stake).to.equal(d1Stake * 2n, 'D2 should have double D1 stake');
    expect(d4Stake).to.equal(d3Stake * 2n, 'D4 should have double D3 stake');
    expect(d1Stake).to.equal(d3Stake, 'D1 and D3 should have equal stakes');
    expect(d2Stake).to.equal(d4Stake, 'D2 and D4 should have equal stakes');

    // Verify nodes have equal scores
    const node1Score = await RandomSamplingStorage.getNodeEpochScore(
      2n,
      nodes[0].identityId,
    );
    const node2Score = await RandomSamplingStorage.getNodeEpochScore(
      2n,
      nodes[1].identityId,
    );
    expect(node1Score).to.equal(node2Score, 'Nodes should have equal scores');
    console.log(`    📊 Both nodes have equal score: ${node1Score}`);

    // Get rolling rewards before claiming
    const d1RollingBefore = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[0].identityId,
      delegators[0].address,
    );
    const d2RollingBefore = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[0].identityId,
      delegators[1].address,
    );
    const d3RollingBefore = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[1].identityId,
      delegators[2].address,
    );
    const d4RollingBefore = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[1].identityId,
      delegators[3].address,
    );

    // All should start with 0 rolling rewards
    expect(d1RollingBefore).to.equal(
      0n,
      'D1 should start with 0 rolling rewards',
    );
    expect(d2RollingBefore).to.equal(
      0n,
      'D2 should start with 0 rolling rewards',
    );
    expect(d3RollingBefore).to.equal(
      0n,
      'D3 should start with 0 rolling rewards',
    );
    expect(d4RollingBefore).to.equal(
      0n,
      'D4 should start with 0 rolling rewards',
    );

    // Claim epoch 2 rewards for all delegators
    await Staking.connect(delegators[0]).claimDelegatorRewards(
      nodes[0].identityId,
      2n,
      delegators[0].address,
    );
    await Staking.connect(delegators[1]).claimDelegatorRewards(
      nodes[0].identityId,
      2n,
      delegators[1].address,
    );
    await Staking.connect(delegators[2]).claimDelegatorRewards(
      nodes[1].identityId,
      2n,
      delegators[2].address,
    );
    await Staking.connect(delegators[3]).claimDelegatorRewards(
      nodes[1].identityId,
      2n,
      delegators[3].address,
    );

    console.log('    ✅ All delegators successfully claimed epoch 2 rewards');

    // Get rolling rewards after claiming
    const d1RollingAfter = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[0].identityId,
      delegators[0].address,
    );
    const d2RollingAfter = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[0].identityId,
      delegators[1].address,
    );
    const d3RollingAfter = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[1].identityId,
      delegators[2].address,
    );
    const d4RollingAfter = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[1].identityId,
      delegators[3].address,
    );

    // Calculate epoch 2 rewards
    const d1Reward = d1RollingAfter - d1RollingBefore;
    const d2Reward = d2RollingAfter - d2RollingBefore;
    const d3Reward = d3RollingAfter - d3RollingBefore;
    const d4Reward = d4RollingAfter - d4RollingBefore;

    console.log(
      `    💰 D1 epoch 2 reward: ${hre.ethers.formatUnits(d1Reward, 18)} TRAC`,
    );
    console.log(
      `    💰 D2 epoch 2 reward: ${hre.ethers.formatUnits(d2Reward, 18)} TRAC`,
    );
    console.log(
      `    💰 D3 epoch 2 reward: ${hre.ethers.formatUnits(d3Reward, 18)} TRAC`,
    );
    console.log(
      `    💰 D4 epoch 2 reward: ${hre.ethers.formatUnits(d4Reward, 18)} TRAC`,
    );

    // Verify proportional rewards (allow small rounding differences)
    const d2ToD1Ratio = Number(d2Reward) / Number(d1Reward);
    const d4ToD3Ratio = Number(d4Reward) / Number(d3Reward);

    expect(d2ToD1Ratio).to.be.closeTo(
      2.0,
      0.001,
      'D2 should get approximately double D1 rewards',
    );
    expect(d4ToD3Ratio).to.be.closeTo(
      2.0,
      0.001,
      'D4 should get approximately double D3 rewards',
    );
    expect(d1Reward).to.equal(
      d3Reward,
      'D1 and D3 should get equal rewards (equal stakes)',
    );
    expect(d2Reward).to.equal(
      d4Reward,
      'D2 and D4 should get equal rewards (equal stakes)',
    );

    // All rewards should be positive
    expect(d1Reward).to.be.gt(0n, 'D1 should get positive rewards');
    expect(d2Reward).to.be.gt(0n, 'D2 should get positive rewards');
    expect(d3Reward).to.be.gt(0n, 'D3 should get positive rewards');
    expect(d4Reward).to.be.gt(0n, 'D4 should get positive rewards');

    console.log('    ✅ PROPORTIONAL REWARDS VERIFIED:');
    console.log(
      `    📈 D2 reward / D1 reward = ${Number(d2Reward) / Number(d1Reward)} (should be 2.0)`,
    );
    console.log(
      `    📈 D4 reward / D3 reward = ${Number(d4Reward) / Number(d3Reward)} (should be 2.0)`,
    );
    console.log(
      '    📝 Note: Double stake = Double rewards confirmed for epoch 2',
    );
  });

  it('D1, D2, D3, D4 claim epoch 3 rewards - D2 and D4 should get proportionally more rewards', async () => {
    const {
      Staking,
      DelegatorsInfo,
      RandomSamplingStorage,
      delegators,
      nodes,
    } = env;

    console.log(
      '\n✅ PROPORTIONAL TEST 2: Epoch 3 rewards - Proportional to stakes',
    );

    // Get rolling rewards before epoch 3 claims
    const d1RollingBefore = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[0].identityId,
      delegators[0].address,
    );
    const d2RollingBefore = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[0].identityId,
      delegators[1].address,
    );
    const d3RollingBefore = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[1].identityId,
      delegators[2].address,
    );
    const d4RollingBefore = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[1].identityId,
      delegators[3].address,
    );

    console.log(
      `    🔄 D1 rolling before epoch 3: ${hre.ethers.formatUnits(d1RollingBefore, 18)} TRAC`,
    );
    console.log(
      `    🔄 D2 rolling before epoch 3: ${hre.ethers.formatUnits(d2RollingBefore, 18)} TRAC`,
    );
    console.log(
      `    🔄 D3 rolling before epoch 3: ${hre.ethers.formatUnits(d3RollingBefore, 18)} TRAC`,
    );
    console.log(
      `    🔄 D4 rolling before epoch 3: ${hre.ethers.formatUnits(d4RollingBefore, 18)} TRAC`,
    );

    // Verify epoch 3 node scores
    const node1Score3 = await RandomSamplingStorage.getNodeEpochScore(
      3n,
      nodes[0].identityId,
    );
    const node2Score3 = await RandomSamplingStorage.getNodeEpochScore(
      3n,
      nodes[1].identityId,
    );
    console.log(`    📊 Node-1 epoch 3 score: ${node1Score3}`);
    console.log(`    📊 Node-2 epoch 3 score: ${node2Score3}`);

    // Claim epoch 3 rewards for all delegators
    await Staking.connect(delegators[0]).claimDelegatorRewards(
      nodes[0].identityId,
      3n,
      delegators[0].address,
    );
    await Staking.connect(delegators[1]).claimDelegatorRewards(
      nodes[0].identityId,
      3n,
      delegators[1].address,
    );
    await Staking.connect(delegators[2]).claimDelegatorRewards(
      nodes[1].identityId,
      3n,
      delegators[2].address,
    );
    await Staking.connect(delegators[3]).claimDelegatorRewards(
      nodes[1].identityId,
      3n,
      delegators[3].address,
    );

    console.log('    ✅ All delegators successfully claimed epoch 3 rewards');

    // Get rolling rewards after epoch 3 claims
    const d1RollingAfter = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[0].identityId,
      delegators[0].address,
    );
    const d2RollingAfter = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[0].identityId,
      delegators[1].address,
    );
    const d3RollingAfter = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[1].identityId,
      delegators[2].address,
    );
    const d4RollingAfter = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[1].identityId,
      delegators[3].address,
    );

    // Calculate epoch 3 rewards
    const d1Epoch3Reward = d1RollingAfter - d1RollingBefore;
    const d2Epoch3Reward = d2RollingAfter - d2RollingBefore;
    const d3Epoch3Reward = d3RollingAfter - d3RollingBefore;
    const d4Epoch3Reward = d4RollingAfter - d4RollingBefore;

    console.log(
      `    💰 D1 epoch 3 reward: ${hre.ethers.formatUnits(d1Epoch3Reward, 18)} TRAC`,
    );
    console.log(
      `    💰 D2 epoch 3 reward: ${hre.ethers.formatUnits(d2Epoch3Reward, 18)} TRAC`,
    );
    console.log(
      `    💰 D3 epoch 3 reward: ${hre.ethers.formatUnits(d3Epoch3Reward, 18)} TRAC`,
    );
    console.log(
      `    💰 D4 epoch 3 reward: ${hre.ethers.formatUnits(d4Epoch3Reward, 18)} TRAC`,
    );

    // Verify proportional rewards (allow small rounding differences)
    const d2ToD1Epoch3Ratio = Number(d2Epoch3Reward) / Number(d1Epoch3Reward);
    const d4ToD3Epoch3Ratio = Number(d4Epoch3Reward) / Number(d3Epoch3Reward);

    expect(d2ToD1Epoch3Ratio).to.be.closeTo(
      2.0,
      0.001,
      'D2 should get approximately double D1 epoch 3 rewards',
    );
    expect(d4ToD3Epoch3Ratio).to.be.closeTo(
      2.0,
      0.001,
      'D4 should get approximately double D3 epoch 3 rewards',
    );
    expect(d1Epoch3Reward).to.equal(
      d3Epoch3Reward,
      'D1 and D3 should get equal epoch 3 rewards',
    );
    expect(d2Epoch3Reward).to.equal(
      d4Epoch3Reward,
      'D2 and D4 should get equal epoch 3 rewards',
    );

    // All rewards should be positive
    expect(d1Epoch3Reward).to.be.gt(
      0n,
      'D1 should get positive epoch 3 rewards',
    );
    expect(d2Epoch3Reward).to.be.gt(
      0n,
      'D2 should get positive epoch 3 rewards',
    );
    expect(d3Epoch3Reward).to.be.gt(
      0n,
      'D3 should get positive epoch 3 rewards',
    );
    expect(d4Epoch3Reward).to.be.gt(
      0n,
      'D4 should get positive epoch 3 rewards',
    );

    // Verify total rolling rewards also maintain proportionality (allow small rounding differences)
    const d2ToD1TotalRatio = Number(d2RollingAfter) / Number(d1RollingAfter);
    const d4ToD3TotalRatio = Number(d4RollingAfter) / Number(d3RollingAfter);

    expect(d2ToD1TotalRatio).to.be.closeTo(
      2.0,
      0.001,
      'D2 total rolling should be approximately double D1 total rolling',
    );
    expect(d4ToD3TotalRatio).to.be.closeTo(
      2.0,
      0.001,
      'D4 total rolling should be approximately double D3 total rolling',
    );

    console.log('    ✅ PROPORTIONAL REWARDS VERIFIED FOR EPOCH 3:');
    console.log(
      `    📈 D2 epoch 3 reward / D1 epoch 3 reward = ${Number(d2Epoch3Reward) / Number(d1Epoch3Reward)} (should be 2.0)`,
    );
    console.log(
      `    📈 D4 epoch 3 reward / D3 epoch 3 reward = ${Number(d4Epoch3Reward) / Number(d3Epoch3Reward)} (should be 2.0)`,
    );
    console.log(
      `    🔄 D2 total rolling / D1 total rolling = ${Number(d2RollingAfter) / Number(d1RollingAfter)} (should be 2.0)`,
    );
    console.log(
      '    📝 Note: Proportional rewards maintained across multiple epochs',
    );
  });

  it('D1, D2, D3, D4 claim epoch 4 rewards - Proportional rewards continue', async () => {
    const { Staking, DelegatorsInfo, delegators, nodes } = env;

    console.log(
      '\n✅ PROPORTIONAL TEST 3: Epoch 4 rewards - Proportional rewards continue',
    );

    // Get rolling rewards before epoch 4 claims
    const d1RollingBefore = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[0].identityId,
      delegators[0].address,
    );
    const d2RollingBefore = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[0].identityId,
      delegators[1].address,
    );
    const d3RollingBefore = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[1].identityId,
      delegators[2].address,
    );
    const d4RollingBefore = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[1].identityId,
      delegators[3].address,
    );

    // Claim epoch 4 rewards for all delegators
    await Staking.connect(delegators[0]).claimDelegatorRewards(
      nodes[0].identityId,
      4n,
      delegators[0].address,
    );
    await Staking.connect(delegators[1]).claimDelegatorRewards(
      nodes[0].identityId,
      4n,
      delegators[1].address,
    );
    await Staking.connect(delegators[2]).claimDelegatorRewards(
      nodes[1].identityId,
      4n,
      delegators[2].address,
    );
    await Staking.connect(delegators[3]).claimDelegatorRewards(
      nodes[1].identityId,
      4n,
      delegators[3].address,
    );

    console.log('    ✅ All delegators successfully claimed epoch 4 rewards');

    // Get rolling rewards after epoch 4 claims
    const d1RollingAfter = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[0].identityId,
      delegators[0].address,
    );
    const d2RollingAfter = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[0].identityId,
      delegators[1].address,
    );
    const d3RollingAfter = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[1].identityId,
      delegators[2].address,
    );
    const d4RollingAfter = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[1].identityId,
      delegators[3].address,
    );

    // Calculate epoch 4 rewards
    const d1Epoch4Reward = d1RollingAfter - d1RollingBefore;
    const d2Epoch4Reward = d2RollingAfter - d2RollingBefore;
    const d3Epoch4Reward = d3RollingAfter - d3RollingBefore;
    const d4Epoch4Reward = d4RollingAfter - d4RollingBefore;

    console.log(
      `    💰 D1 epoch 4 reward: ${hre.ethers.formatUnits(d1Epoch4Reward, 18)} TRAC`,
    );
    console.log(
      `    💰 D2 epoch 4 reward: ${hre.ethers.formatUnits(d2Epoch4Reward, 18)} TRAC`,
    );
    console.log(
      `    💰 D3 epoch 4 reward: ${hre.ethers.formatUnits(d3Epoch4Reward, 18)} TRAC`,
    );
    console.log(
      `    💰 D4 epoch 4 reward: ${hre.ethers.formatUnits(d4Epoch4Reward, 18)} TRAC`,
    );

    // Verify proportional rewards continue (allow small rounding differences)
    const d2ToD1Epoch4Ratio = Number(d2Epoch4Reward) / Number(d1Epoch4Reward);
    const d4ToD3Epoch4Ratio = Number(d4Epoch4Reward) / Number(d3Epoch4Reward);

    expect(d2ToD1Epoch4Ratio).to.be.closeTo(
      2.0,
      0.001,
      'D2 should get approximately double D1 epoch 4 rewards',
    );
    expect(d4ToD3Epoch4Ratio).to.be.closeTo(
      2.0,
      0.001,
      'D4 should get approximately double D3 epoch 4 rewards',
    );
    expect(d1Epoch4Reward).to.equal(
      d3Epoch4Reward,
      'D1 and D3 should get equal epoch 4 rewards',
    );
    expect(d2Epoch4Reward).to.equal(
      d4Epoch4Reward,
      'D2 and D4 should get equal epoch 4 rewards',
    );

    // Verify total rolling rewards maintain proportionality (allow small rounding differences)
    const d2ToD1TotalRatio4 = Number(d2RollingAfter) / Number(d1RollingAfter);
    const d4ToD3TotalRatio4 = Number(d4RollingAfter) / Number(d3RollingAfter);

    expect(d2ToD1TotalRatio4).to.be.closeTo(
      2.0,
      0.001,
      'D2 total rolling should be approximately double D1 total rolling',
    );
    expect(d4ToD3TotalRatio4).to.be.closeTo(
      2.0,
      0.001,
      'D4 total rolling should be approximately double D3 total rolling',
    );

    console.log('    ✅ PROPORTIONAL REWARDS VERIFIED FOR EPOCH 4');
    console.log(
      '    📝 Note: Proportional rewards consistently maintained across epochs 2, 3, and 4',
    );
  });

  it('D1, D2, D3, D4 claim epoch 5 rewards - Should get 0 rewards (no proofs) but maintain proportionality', async () => {
    const { Staking, DelegatorsInfo, delegators, nodes } = env;

    console.log(
      '\n✅ PROPORTIONAL TEST 4: Epoch 5 rewards - 0 rewards but proportionality maintained',
    );

    // Get rolling rewards before epoch 5 claims
    const d1RollingBefore = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[0].identityId,
      delegators[0].address,
    );
    const d2RollingBefore = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[0].identityId,
      delegators[1].address,
    );
    const d3RollingBefore = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[1].identityId,
      delegators[2].address,
    );
    const d4RollingBefore = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[1].identityId,
      delegators[3].address,
    );

    // Verify proportional rolling rewards before epoch 5 (allow small rounding differences)
    const d2ToD1BeforeRatio = Number(d2RollingBefore) / Number(d1RollingBefore);
    const d4ToD3BeforeRatio = Number(d4RollingBefore) / Number(d3RollingBefore);

    expect(d2ToD1BeforeRatio).to.be.closeTo(
      2.0,
      0.001,
      'D2 should have approximately double D1 rolling rewards before epoch 5',
    );
    expect(d4ToD3BeforeRatio).to.be.closeTo(
      2.0,
      0.001,
      'D4 should have approximately double D3 rolling rewards before epoch 5',
    );

    // Claim epoch 5 rewards for all delegators (should be 0)
    await Staking.connect(delegators[0]).claimDelegatorRewards(
      nodes[0].identityId,
      5n,
      delegators[0].address,
    );
    await Staking.connect(delegators[1]).claimDelegatorRewards(
      nodes[0].identityId,
      5n,
      delegators[1].address,
    );
    await Staking.connect(delegators[2]).claimDelegatorRewards(
      nodes[1].identityId,
      5n,
      delegators[2].address,
    );
    await Staking.connect(delegators[3]).claimDelegatorRewards(
      nodes[1].identityId,
      5n,
      delegators[3].address,
    );

    console.log(
      '    ✅ All delegators successfully claimed epoch 5 rewards (0 TRAC each)',
    );

    // Get rolling rewards after epoch 5 claims
    const d1RollingAfter = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[0].identityId,
      delegators[0].address,
    );
    const d2RollingAfter = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[0].identityId,
      delegators[1].address,
    );
    const d3RollingAfter = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[1].identityId,
      delegators[2].address,
    );
    const d4RollingAfter = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[1].identityId,
      delegators[3].address,
    );

    // Verify no change in rolling rewards (no rewards from epoch 5)
    expect(d1RollingAfter).to.equal(
      d1RollingBefore,
      'D1 rolling rewards should not change',
    );
    expect(d2RollingAfter).to.equal(
      d2RollingBefore,
      'D2 rolling rewards should not change',
    );
    expect(d3RollingAfter).to.equal(
      d3RollingBefore,
      'D3 rolling rewards should not change',
    );
    expect(d4RollingAfter).to.equal(
      d4RollingBefore,
      'D4 rolling rewards should not change',
    );

    // Verify proportionality is still maintained (allow small rounding differences)
    const d2ToD1AfterRatio = Number(d2RollingAfter) / Number(d1RollingAfter);
    const d4ToD3AfterRatio = Number(d4RollingAfter) / Number(d3RollingAfter);

    expect(d2ToD1AfterRatio).to.be.closeTo(
      2.0,
      0.001,
      'D2 should still have approximately double D1 rolling rewards',
    );
    expect(d4ToD3AfterRatio).to.be.closeTo(
      2.0,
      0.001,
      'D4 should still have approximately double D3 rolling rewards',
    );

    console.log(
      `    💰 All delegators got 0 TRAC from epoch 5 (no proofs submitted)`,
    );
    console.log(
      `    🔄 D1 total rolling: ${hre.ethers.formatUnits(d1RollingAfter, 18)} TRAC`,
    );
    console.log(
      `    🔄 D2 total rolling: ${hre.ethers.formatUnits(d2RollingAfter, 18)} TRAC`,
    );
    console.log(
      `    🔄 D3 total rolling: ${hre.ethers.formatUnits(d3RollingAfter, 18)} TRAC`,
    );
    console.log(
      `    🔄 D4 total rolling: ${hre.ethers.formatUnits(d4RollingAfter, 18)} TRAC`,
    );
    console.log('    ✅ PROPORTIONALITY MAINTAINED: D2/D1 = D4/D3 = 2.0');
    console.log(
      "    📝 Note: Zero rewards don't break proportional relationships",
    );
  });

  it('D1, D2, D3, D4 claim epoch 6 rewards - Final claim transfers rolling rewards to stakeBase proportionally', async () => {
    const { Staking, StakingStorage, DelegatorsInfo, delegators, nodes } = env;

    console.log(
      '\n✅ PROPORTIONAL TEST 5: Epoch 6 final claim - Proportional transfer to stakeBase',
    );

    // Get states before epoch 6 claims
    const d1Key = hre.ethers.keccak256(
      hre.ethers.solidityPacked(['address'], [delegators[0].address]),
    );
    const d2Key = hre.ethers.keccak256(
      hre.ethers.solidityPacked(['address'], [delegators[1].address]),
    );
    const d3Key = hre.ethers.keccak256(
      hre.ethers.solidityPacked(['address'], [delegators[2].address]),
    );
    const d4Key = hre.ethers.keccak256(
      hre.ethers.solidityPacked(['address'], [delegators[3].address]),
    );

    const d1StakeBaseBefore = await StakingStorage.getDelegatorStakeBase(
      nodes[0].identityId,
      d1Key,
    );
    const d2StakeBaseBefore = await StakingStorage.getDelegatorStakeBase(
      nodes[0].identityId,
      d2Key,
    );
    const d3StakeBaseBefore = await StakingStorage.getDelegatorStakeBase(
      nodes[1].identityId,
      d3Key,
    );
    const d4StakeBaseBefore = await StakingStorage.getDelegatorStakeBase(
      nodes[1].identityId,
      d4Key,
    );

    const d1RollingBefore = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[0].identityId,
      delegators[0].address,
    );
    const d2RollingBefore = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[0].identityId,
      delegators[1].address,
    );
    const d3RollingBefore = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[1].identityId,
      delegators[2].address,
    );
    const d4RollingBefore = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[1].identityId,
      delegators[3].address,
    );

    console.log(
      `    💎 D1 stakeBase before: ${hre.ethers.formatUnits(d1StakeBaseBefore, 18)} TRAC`,
    );
    console.log(
      `    💎 D2 stakeBase before: ${hre.ethers.formatUnits(d2StakeBaseBefore, 18)} TRAC`,
    );
    console.log(
      `    💎 D3 stakeBase before: ${hre.ethers.formatUnits(d3StakeBaseBefore, 18)} TRAC`,
    );
    console.log(
      `    💎 D4 stakeBase before: ${hre.ethers.formatUnits(d4StakeBaseBefore, 18)} TRAC`,
    );
    console.log(
      `    🔄 D1 rolling before: ${hre.ethers.formatUnits(d1RollingBefore, 18)} TRAC`,
    );
    console.log(
      `    🔄 D2 rolling before: ${hre.ethers.formatUnits(d2RollingBefore, 18)} TRAC`,
    );
    console.log(
      `    🔄 D3 rolling before: ${hre.ethers.formatUnits(d3RollingBefore, 18)} TRAC`,
    );
    console.log(
      `    🔄 D4 rolling before: ${hre.ethers.formatUnits(d4RollingBefore, 18)} TRAC`,
    );

    // Verify proportional rolling rewards before final claim (allow small rounding differences)
    const d2ToD1BeforeFinalRatio =
      Number(d2RollingBefore) / Number(d1RollingBefore);
    const d4ToD3BeforeFinalRatio =
      Number(d4RollingBefore) / Number(d3RollingBefore);

    expect(d2ToD1BeforeFinalRatio).to.be.closeTo(
      2.0,
      0.001,
      'D2 should have approximately double D1 rolling rewards',
    );
    expect(d4ToD3BeforeFinalRatio).to.be.closeTo(
      2.0,
      0.001,
      'D4 should have approximately double D3 rolling rewards',
    );

    // Claim epoch 6 rewards for all delegators (final claim - should transfer to stakeBase)
    await Staking.connect(delegators[0]).claimDelegatorRewards(
      nodes[0].identityId,
      6n,
      delegators[0].address,
    );
    await Staking.connect(delegators[1]).claimDelegatorRewards(
      nodes[0].identityId,
      6n,
      delegators[1].address,
    );
    await Staking.connect(delegators[2]).claimDelegatorRewards(
      nodes[1].identityId,
      6n,
      delegators[2].address,
    );
    await Staking.connect(delegators[3]).claimDelegatorRewards(
      nodes[1].identityId,
      6n,
      delegators[3].address,
    );

    console.log(
      '    ✅ All delegators successfully claimed epoch 6 rewards (final claim)',
    );

    // Get states after epoch 6 claims
    const d1StakeBaseAfter = await StakingStorage.getDelegatorStakeBase(
      nodes[0].identityId,
      d1Key,
    );
    const d2StakeBaseAfter = await StakingStorage.getDelegatorStakeBase(
      nodes[0].identityId,
      d2Key,
    );
    const d3StakeBaseAfter = await StakingStorage.getDelegatorStakeBase(
      nodes[1].identityId,
      d3Key,
    );
    const d4StakeBaseAfter = await StakingStorage.getDelegatorStakeBase(
      nodes[1].identityId,
      d4Key,
    );

    const d1RollingAfter = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[0].identityId,
      delegators[0].address,
    );
    const d2RollingAfter = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[0].identityId,
      delegators[1].address,
    );
    const d3RollingAfter = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[1].identityId,
      delegators[2].address,
    );
    const d4RollingAfter = await DelegatorsInfo.getDelegatorRollingRewards(
      nodes[1].identityId,
      delegators[3].address,
    );

    console.log(
      `    💎 D1 stakeBase after: ${hre.ethers.formatUnits(d1StakeBaseAfter, 18)} TRAC`,
    );
    console.log(
      `    💎 D2 stakeBase after: ${hre.ethers.formatUnits(d2StakeBaseAfter, 18)} TRAC`,
    );
    console.log(
      `    💎 D3 stakeBase after: ${hre.ethers.formatUnits(d3StakeBaseAfter, 18)} TRAC`,
    );
    console.log(
      `    💎 D4 stakeBase after: ${hre.ethers.formatUnits(d4StakeBaseAfter, 18)} TRAC`,
    );

    // Verify rolling rewards were transferred to stakeBase
    expect(d1RollingAfter).to.equal(
      0n,
      'D1 rolling rewards should be 0 after final claim',
    );
    expect(d2RollingAfter).to.equal(
      0n,
      'D2 rolling rewards should be 0 after final claim',
    );
    expect(d3RollingAfter).to.equal(
      0n,
      'D3 rolling rewards should be 0 after final claim',
    );
    expect(d4RollingAfter).to.equal(
      0n,
      'D4 rolling rewards should be 0 after final claim',
    );

    // Calculate total rewards transferred
    const d1TotalRewards = d1StakeBaseAfter - d1StakeBaseBefore;
    const d2TotalRewards = d2StakeBaseAfter - d2StakeBaseBefore;
    const d3TotalRewards = d3StakeBaseAfter - d3StakeBaseBefore;
    const d4TotalRewards = d4StakeBaseAfter - d4StakeBaseBefore;

    console.log(
      `    🎁 D1 total rewards transferred: ${hre.ethers.formatUnits(d1TotalRewards, 18)} TRAC`,
    );
    console.log(
      `    🎁 D2 total rewards transferred: ${hre.ethers.formatUnits(d2TotalRewards, 18)} TRAC`,
    );
    console.log(
      `    🎁 D3 total rewards transferred: ${hre.ethers.formatUnits(d3TotalRewards, 18)} TRAC`,
    );
    console.log(
      `    🎁 D4 total rewards transferred: ${hre.ethers.formatUnits(d4TotalRewards, 18)} TRAC`,
    );

    // Verify proportional final rewards (allow small rounding differences)
    const d2ToD1FinalRewardsRatio =
      Number(d2TotalRewards) / Number(d1TotalRewards);
    const d4ToD3FinalRewardsRatio =
      Number(d4TotalRewards) / Number(d3TotalRewards);

    expect(d2ToD1FinalRewardsRatio).to.be.closeTo(
      2.0,
      0.001,
      'D2 should get approximately double D1 total rewards',
    );
    expect(d4ToD3FinalRewardsRatio).to.be.closeTo(
      2.0,
      0.001,
      'D4 should get approximately double D3 total rewards',
    );
    expect(d1TotalRewards).to.equal(
      d3TotalRewards,
      'D1 and D3 should get equal total rewards',
    );
    expect(d2TotalRewards).to.equal(
      d4TotalRewards,
      'D2 and D4 should get equal total rewards',
    );

    // Verify final stakeBase proportions
    const d1FinalStake = d1StakeBaseAfter;
    const d2FinalStake = d2StakeBaseAfter;
    const d3FinalStake = d3StakeBaseAfter;
    const d4FinalStake = d4StakeBaseAfter;

    // Since D2 started with 2x D1 stake and got 2x rewards, final ratio should be maintained
    // But exact 2x ratio might not hold due to rounding, so we check approximate ratios
    const d2ToD1Ratio = Number(d2FinalStake) / Number(d1FinalStake);
    const d4ToD3Ratio = Number(d4FinalStake) / Number(d3FinalStake);

    console.log(
      `    📊 Final D2/D1 stakeBase ratio: ${d2ToD1Ratio.toFixed(6)}`,
    );
    console.log(
      `    📊 Final D4/D3 stakeBase ratio: ${d4ToD3Ratio.toFixed(6)}`,
    );

    // Ratios should be close to 2.0 but might have small deviations due to rounding
    expect(d2ToD1Ratio).to.be.closeTo(
      2.0,
      0.01,
      'D2/D1 final stakeBase ratio should be close to 2.0',
    );
    expect(d4ToD3Ratio).to.be.closeTo(
      2.0,
      0.01,
      'D4/D3 final stakeBase ratio should be close to 2.0',
    );

    console.log('    ✅ PROPORTIONAL REWARDS SYSTEM VERIFIED:');
    console.log(
      '    📈 Double stake consistently resulted in double rewards across all epochs',
    );
    console.log('    💰 Final stakeBase maintains proportional relationships');
    console.log('    🎯 Reward system is fair and predictable');
    console.log(
      '    📝 Note: Proportional rewards successfully transferred to permanent stakeBase',
    );
  });
});

describe('Withdrawal request tests after further epochs', () => {
  let env: Awaited<ReturnType<typeof buildInitialRewardsState>>;
  let Staking: Staking,
    Chronos: Chronos,
    EpochStorage: EpochStorage,
    RandomSampling: RandomSampling,
    KC: KnowledgeCollection,
    Token: Token,
    RandomSamplingStorage: RandomSamplingStorage,
    StakingStorage: StakingStorage,
    ParametersStorage: ParametersStorage;
  let accounts: any, nodes: any[], delegators: SignerWithAddress[];
  let node1Id: number, node2Id: number, node3Id: number, node4Id: number;
  let chunkSize: number;
  let merkleRoot: string;

  before(async () => {
    env = await buildInitialRewardsState();
    // Unpack env
    ({
      Staking,
      Chronos,
      EpochStorage,
      RandomSampling,
      KC,
      Token,
      RandomSamplingStorage,
      StakingStorage,
      ParametersStorage,
      accounts,
      nodes,
      delegators,
    } = env);
    node1Id = nodes[0].identityId;
    node2Id = nodes[1].identityId;
    node3Id = nodes[2].identityId;
    node4Id = nodes[3].identityId;
    chunkSize = Number(await RandomSamplingStorage.CHUNK_BYTE_SIZE());
    // @ts-expect-error – dynamic CJS import of assertion-tools
    const { kcTools } = await import('assertion-tools');
    merkleRoot = kcTools.calculateMerkleRoot(quads, 32);

    // Initial state: current epoch is 7, last finalized is 6.

    // --- Epoch 7 ---
    console.log('\n⏳ Advancing through epoch 7 with proofs...');
    await advanceToNextProofingPeriod({ randomSampling: RandomSampling });
    for (const [, node] of nodes.entries()) {
      await submitProofAndLogScore(
        node.identityId,
        { operational: node.operational, admin: node.admin },
        {
          randomSampling: RandomSampling,
          randomSamplingStorage: RandomSamplingStorage,
        },
        7n,
      );
    }
    await time.increase((await Chronos.timeUntilNextEpoch()) + 1n); // Move to epoch 8

    // --- Epoch 8 ---
    console.log('\n⏳ Advancing through epoch 8 with proofs...');
    await createKnowledgeCollection(
      accounts.kcCreator,
      accounts.node1,
      node1Id,
      [accounts.node2, accounts.node3, accounts.node4],
      [node2Id, node3Id, node4Id],
      { KnowledgeCollection: KC, Token },
      merkleRoot,
      'epoch-8-kc',
      10,
      chunkSize * 10,
      1,
      toTRAC(1000),
    );
    await advanceToNextProofingPeriod({ randomSampling: RandomSampling });
    for (const [, node] of nodes.entries()) {
      await submitProofAndLogScore(
        node.identityId,
        { operational: node.operational, admin: node.admin },
        {
          randomSampling: RandomSampling,
          randomSamplingStorage: RandomSamplingStorage,
        },
        8n,
      );
    }
    await time.increase((await Chronos.timeUntilNextEpoch()) + 1n); // Move to epoch 9

    // --- Epoch 9 (No proofs) ---
    console.log('\n⏳ Advancing through epoch 9 without proofs...');
    await createKnowledgeCollection(
      accounts.kcCreator,
      accounts.node2,
      node2Id,
      [accounts.node1, accounts.node3, accounts.node4],
      [node1Id, node3Id, node4Id],
      { KnowledgeCollection: KC, Token },
      merkleRoot,
      'epoch-9-kc',
      10,
      chunkSize * 10,
      1,
      toTRAC(1000),
    );
    console.log(
      `\n✅ Initial setup complete. Current epoch: ${await Chronos.getCurrentEpoch()}, Last finalized: ${await EpochStorage.lastFinalizedEpoch(1)}`,
    );
  });

  it('D1 withdrawal request flow: must claim all reward epochs (2-8)', async () => {
    const d1 = delegators[0];
    const d1Address = d1.address;
    const node1 = nodes[0];

    console.log(
      `\n🔒 TEST D1: Starting in Epoch ${await Chronos.getCurrentEpoch()}. Last Finalized: ${await EpochStorage.lastFinalizedEpoch(
        1,
      )}`,
    );

    console.log(
      '🔒 TEST D1: Claiming all epochs except 7 & 8, then attempting withdrawal...',
    );
    for (const epoch of [2n, 3n, 4n, 5n, 6n]) {
      await Staking.connect(d1).claimDelegatorRewards(
        node1.identityId,
        epoch,
        d1Address,
      );
    }
    console.log('  ✅ D1 claimed epochs 2-6.');
    await expect(
      Staking.connect(d1).requestWithdrawal(node1.identityId, toTRAC(10000)),
    ).to.be.revertedWith(
      'Must claim all previous epoch rewards before changing stake',
    );
    console.log('  ❌ D1 withdrawal failed as expected (epoch 7 not claimed).');

    console.log(
      '\n🔒 TEST D1: Claiming epoch 7, then attempting withdrawal...',
    );
    await Staking.connect(d1).claimDelegatorRewards(
      node1.identityId,
      7n,
      d1Address,
    );
    console.log('  ✅ D1 claimed epoch 7.');
    await expect(
      Staking.connect(d1).requestWithdrawal(node1.identityId, toTRAC(10000)),
    ).to.be.revertedWith(
      'Must claim the previous epoch rewards before changing stake',
    );
    console.log('  ❌ D1 withdrawal failed as expected (epoch 8 not claimed).');

    console.log(
      '\n🔒 TEST D1: Claiming epoch 8, then attempting withdrawal...',
    );
    await Staking.connect(d1).claimDelegatorRewards(
      node1.identityId,
      8n,
      d1Address,
    );
    console.log('  ✅ D1 claimed epoch 8.');

    const d1Key = hre.ethers.keccak256(
      hre.ethers.solidityPacked(['address'], [d1.address]),
    );
    const d1StakeBaseBefore = await StakingStorage.getDelegatorStakeBase(
      node1.identityId,
      d1Key,
    );
    const d1WithdrawalAmount = toTRAC(10000);

    await expect(
      Staking.connect(d1).requestWithdrawal(
        node1.identityId,
        d1WithdrawalAmount,
      ),
    ).to.not.be.reverted;
    console.log('  ✅ D1 withdrawal succeeded as expected.');

    const d1StakeBaseAfter = await StakingStorage.getDelegatorStakeBase(
      node1.identityId,
      d1Key,
    );
    expect(d1StakeBaseBefore - d1StakeBaseAfter).to.equal(d1WithdrawalAmount);
    console.log(
      `  ✅ D1 stakeBase correctly reduced by ${hre.ethers.formatUnits(d1WithdrawalAmount, 18)} TRAC.`,
    );
  });

  it('D2 withdrawal request flow: must claim reward epochs (2-8), can skip no-reward epoch (9)', async () => {
    const d2 = delegators[1];
    const d2Address = d2.address;
    const node1 = nodes[0];

    console.log(
      `\n⏳ TEST D2: Starting in Epoch ${await Chronos.getCurrentEpoch()}. Advancing to Epoch 10 and finalizing epoch 9...`,
    );
    await time.increase((await Chronos.timeUntilNextEpoch()) + 1n); // Move to epoch 10
    // Create a KC in epoch 10 to trigger finalization of epoch 9
    await createKnowledgeCollection(
      accounts.kcCreator,
      accounts.node3, // any node
      node3Id,
      [accounts.node1, accounts.node2, accounts.node4],
      [node1Id, node2Id, node4Id],
      { KnowledgeCollection: KC, Token },
      merkleRoot,
      'finalize-epoch-9',
      1,
      chunkSize,
      1,
      toTRAC(1),
    );
    console.log(
      `✅ TEST D2: Now in Epoch ${await Chronos.getCurrentEpoch()}. Last Finalized: ${await EpochStorage.lastFinalizedEpoch(
        1,
      )}`,
    );

    console.log(
      '🔒 TEST D2: Claiming all epochs except 8 & 9, then attempting withdrawal...',
    );
    for (const epoch of [2n, 3n, 4n, 5n, 6n, 7n]) {
      await Staking.connect(d2).claimDelegatorRewards(
        node1.identityId,
        epoch,
        d2Address,
      );
    }
    console.log('  ✅ D2 claimed epochs 2-7.');
    await expect(
      Staking.connect(d2).requestWithdrawal(node1.identityId, toTRAC(20000)),
    ).to.be.revertedWith(
      'Must claim all previous epoch rewards before changing stake',
    );
    console.log('  ❌ D2 withdrawal failed as expected (epoch 8 not claimed).');

    console.log(
      '\n🔒 TEST D2: Claiming epoch 8, then attempting withdrawal...',
    );
    await Staking.connect(d2).claimDelegatorRewards(
      node1.identityId,
      8n,
      d2Address,
    );
    console.log('  ✅ D2 claimed epoch 8.');

    const d2Key = hre.ethers.keccak256(
      hre.ethers.solidityPacked(['address'], [d2.address]),
    );
    const d2StakeBaseBefore = await StakingStorage.getDelegatorStakeBase(
      node1.identityId,
      d2Key,
    );
    const d2WithdrawalAmount = toTRAC(20000);

    await expect(
      Staking.connect(d2).requestWithdrawal(
        node1.identityId,
        d2WithdrawalAmount,
      ),
    ).to.not.be.reverted;
    console.log(
      '  ✅ D2 withdrawal succeeded as expected (epoch 9 had no rewards and could be skipped for withdrawal).',
    );

    const d2StakeBaseAfter = await StakingStorage.getDelegatorStakeBase(
      node1.identityId,
      d2Key,
    );
    expect(d2StakeBaseBefore - d2StakeBaseAfter).to.equal(d2WithdrawalAmount);
    console.log(
      `  ✅ D2 stakeBase correctly reduced by ${hre.ethers.formatUnits(d2WithdrawalAmount, 18)} TRAC.`,
    );

    console.log(
      '  ❌ Attempting to finalize D2 withdrawal immediately (should fail)...',
    );
    await expect(
      Staking.connect(d2).finalizeWithdrawal(node1.identityId),
    ).to.be.revertedWithCustomError(Staking, 'WithdrawalPeriodPending');
    console.log('  ✅ Reverted as expected (delay not passed).');
  });

  it('D1 withdrawal cancellation flow', async () => {
    // This test continues from the state left by previous tests
    const d1 = delegators[0];
    const node1 = nodes[0];

    console.log(
      '\n🔒 TEST D1 Cancel: Setting up epoch 10 with rewards for Node-1...',
    );
    await createKnowledgeCollection(
      accounts.kcCreator,
      accounts.node1,
      node1Id,
      [accounts.node2, accounts.node3, accounts.node4],
      [node2Id, node3Id, node4Id],
      { KnowledgeCollection: KC, Token },
      merkleRoot,
      'epoch-10-kc',
      10,
      chunkSize * 10,
      1,
      toTRAC(1000),
    );
    await advanceToNextProofingPeriod({ randomSampling: RandomSampling });
    await submitProofAndLogScore(
      node1.identityId,
      {
        operational: accounts.node1.operational,
        admin: accounts.node1.admin,
      },
      {
        randomSampling: RandomSampling,
        randomSamplingStorage: RandomSamplingStorage,
      },
      10n,
    );

    console.log('  ⏳ Advancing to Epoch 11 and finalizing Epoch 10...');
    await time.increase((await Chronos.timeUntilNextEpoch()) + 1n); // Move to epoch 11
    // Create a KC in epoch 11 to trigger finalization of epoch 10
    await createKnowledgeCollection(
      accounts.kcCreator,
      accounts.node4, // any node
      node4Id,
      [accounts.node1, accounts.node2, accounts.node3],
      [node1Id, node2Id, node3Id],
      { KnowledgeCollection: KC, Token },
      merkleRoot,
      'finalize-epoch-10',
      1,
      chunkSize,
      1,
      toTRAC(1),
    );
    console.log(
      `  ✅ Now in Epoch ${await Chronos.getCurrentEpoch()}, Last Finalized: ${await EpochStorage.lastFinalizedEpoch(1)}.`,
    );

    console.log(
      '  Attempting to cancel withdrawal before claiming epoch 10...',
    );
    await expect(
      Staking.connect(d1).cancelWithdrawal(node1.identityId),
    ).to.be.revertedWith(
      'Must claim all previous epoch rewards before changing stake',
    );
    console.log('  ✅ Reverted as expected.');

    console.log('  Claiming epoch 9 (no rewards) and 10 for D1...');
    await Staking.connect(d1).claimDelegatorRewards(
      node1.identityId,
      9n,
      d1.address,
    );
    console.log('  ✅ Claimed epoch 9 successfully.');
    await Staking.connect(d1).claimDelegatorRewards(
      node1.identityId,
      10n,
      d1.address,
    );
    console.log('  ✅ Claimed epoch 10 successfully.');

    console.log('  Attempting to cancel withdrawal again...');
    const d1Key = hre.ethers.keccak256(
      hre.ethers.solidityPacked(['address'], [d1.address]),
    );
    const stakeBaseBeforeCancel = await StakingStorage.getDelegatorStakeBase(
      node1.identityId,
      d1Key,
    );
    const { 0: withdrawalAmount } =
      await StakingStorage.getDelegatorWithdrawalRequest(
        node1.identityId,
        d1Key,
      );

    expect(withdrawalAmount).to.be.gt(0, 'Withdrawal request should exist');

    await expect(Staking.connect(d1).cancelWithdrawal(node1.identityId)).to.not
      .be.reverted;
    console.log('  ✅ Withdrawal cancelled successfully.');

    const stakeBaseAfterCancel = await StakingStorage.getDelegatorStakeBase(
      node1.identityId,
      d1Key,
    );
    expect(stakeBaseAfterCancel).to.equal(
      stakeBaseBeforeCancel + withdrawalAmount,
    );
    console.log(
      `  ✅ Stake base correctly restored by ${hre.ethers.formatUnits(withdrawalAmount, 18)} TRAC.`,
    );

    const { 0: finalWithdrawalAmount } =
      await StakingStorage.getDelegatorWithdrawalRequest(
        node1.identityId,
        d1Key,
      );
    expect(finalWithdrawalAmount).to.equal(
      0,
      'Withdrawal request should be deleted',
    );
  });

  it('D2 finalizes withdrawal after delay', async () => {
    const d2 = delegators[1];
    const node1 = nodes[0];
    const d2Key = hre.ethers.keccak256(
      hre.ethers.solidityPacked(['address'], [d2.address]),
    );

    console.log(
      '\n🔒 TEST Finalize: Advancing time beyond withdrawal delay...',
    );
    const delay = await ParametersStorage.stakeWithdrawalDelay();
    await time.increase(delay + 1n);
    console.log(`  ✅ Time advanced by ${delay + 1n} seconds.`);

    const { 0: withdrawalAmount } =
      await StakingStorage.getDelegatorWithdrawalRequest(
        node1.identityId,
        d2Key,
      );
    expect(withdrawalAmount).to.be.gt(0, 'D2 should have a pending withdrawal');

    const balanceBefore = await Token.balanceOf(d2.address);
    console.log(
      `  D2 wallet balance before finalization: ${hre.ethers.formatUnits(balanceBefore, 18)} TRAC.`,
    );

    console.log('  Attempting to finalize withdrawal...');
    await expect(Staking.connect(d2).finalizeWithdrawal(node1.identityId)).to
      .not.be.reverted;
    console.log('  ✅ D2 withdrawal finalized successfully.');

    const balanceAfter = await Token.balanceOf(d2.address);
    console.log(
      `  D2 wallet balance after finalization: ${hre.ethers.formatUnits(balanceAfter, 18)} TRAC.`,
    );
    expect(balanceAfter - balanceBefore).to.equal(withdrawalAmount);
    console.log(
      `  ✅ D2 wallet balance increased by ${hre.ethers.formatUnits(withdrawalAmount, 18)} TRAC.`,
    );

    const { 0: finalWithdrawalAmountAfter } =
      await StakingStorage.getDelegatorWithdrawalRequest(
        node1.identityId,
        d2Key,
      );
    expect(finalWithdrawalAmountAfter).to.equal(
      0,
      'Withdrawal request should be deleted after finalization',
    );
    console.log('  ✅ Withdrawal request removed from storage.');
  });
});

describe('Operator fee withdrawal tests', () => {
  let env: Awaited<ReturnType<typeof buildInitialRewardsState>>;
  let Staking: Staking,
    StakingStorage: StakingStorage,
    Token: Token,
    ParametersStorage: ParametersStorage;
  let delegators: SignerWithAddress[], nodes: any[];

  before(async () => {
    env = await buildInitialRewardsState();
    // Unpack env
    ({ Staking, StakingStorage, Token, ParametersStorage, delegators, nodes } =
      env);

    console.log('\n🎯 OPERATOR FEE WITHDRAWAL TESTS - Simple flow test');

    // D1 claims epochs 2,3 for Node-1
    console.log('  📍 D1 claiming epochs 2,3 for Node-1...');
    await Staking.connect(delegators[0]).claimDelegatorRewards(
      nodes[0].identityId,
      2n,
      delegators[0].address,
    );
    await Staking.connect(delegators[0]).claimDelegatorRewards(
      nodes[0].identityId,
      3n,
      delegators[0].address,
    );

    // D2 claims epochs 2,3,4 for Node-1
    console.log('  📍 D2 claiming epochs 2,3,4 for Node-1...');
    await Staking.connect(delegators[1]).claimDelegatorRewards(
      nodes[0].identityId,
      2n,
      delegators[1].address,
    );
    await Staking.connect(delegators[1]).claimDelegatorRewards(
      nodes[0].identityId,
      3n,
      delegators[1].address,
    );
    await Staking.connect(delegators[1]).claimDelegatorRewards(
      nodes[0].identityId,
      4n,
      delegators[1].address,
    );

    // D3 claims epochs 2,3 for Node-2
    console.log('  📍 D3 claiming epochs 2,3 for Node-2...');
    await Staking.connect(delegators[2]).claimDelegatorRewards(
      nodes[1].identityId,
      2n,
      delegators[2].address,
    );
    await Staking.connect(delegators[2]).claimDelegatorRewards(
      nodes[1].identityId,
      3n,
      delegators[2].address,
    );

    // D4 claims epochs 2,3,4 for Node-2
    console.log('  📍 D4 claiming epochs 2,3,4 for Node-2...');
    await Staking.connect(delegators[3]).claimDelegatorRewards(
      nodes[1].identityId,
      2n,
      delegators[3].address,
    );
    await Staking.connect(delegators[3]).claimDelegatorRewards(
      nodes[1].identityId,
      3n,
      delegators[3].address,
    );
    await Staking.connect(delegators[3]).claimDelegatorRewards(
      nodes[1].identityId,
      4n,
      delegators[3].address,
    );

    console.log('  ✅ Claims completed');
  });

  it('Both nodes request operator fee withdrawal - amounts should be equal', async () => {
    console.log(
      '\n💰 Checking operator fee balances and requesting withdrawals',
    );

    // Check operator fee balances
    const node1FeeBalance = await StakingStorage.getOperatorFeeBalance(
      nodes[0].identityId,
    );
    const node2FeeBalance = await StakingStorage.getOperatorFeeBalance(
      nodes[1].identityId,
    );

    console.log(
      `  💎 Node-1 operator fee balance: ${hre.ethers.formatUnits(node1FeeBalance, 18)} TRAC`,
    );
    console.log(
      `  💎 Node-2 operator fee balance: ${hre.ethers.formatUnits(node2FeeBalance, 18)} TRAC`,
    );

    // Both nodes should have positive and equal operator fees (since they're identical)
    expect(node1FeeBalance).to.be.gt(0n, 'Node-1 should have operator fees');
    expect(node2FeeBalance).to.be.gt(0n, 'Node-2 should have operator fees');
    expect(node1FeeBalance).to.equal(
      node2FeeBalance,
      'Node-1 and Node-2 should have equal operator fees',
    );

    // Request full withdrawal for both nodes
    console.log('  🔄 Requesting full withdrawal for both nodes...');

    await Staking.connect(nodes[0].admin).requestOperatorFeeWithdrawal(
      nodes[0].identityId,
      node1FeeBalance,
    );

    await Staking.connect(nodes[1].admin).requestOperatorFeeWithdrawal(
      nodes[1].identityId,
      node2FeeBalance,
    );

    // Verify withdrawal requests
    const [node1RequestAmount] =
      await StakingStorage.getOperatorFeeWithdrawalRequest(nodes[0].identityId);
    const [node2RequestAmount] =
      await StakingStorage.getOperatorFeeWithdrawalRequest(nodes[1].identityId);

    expect(node1RequestAmount).to.equal(
      node1FeeBalance,
      'Node-1 withdrawal request should match balance',
    );
    expect(node2RequestAmount).to.equal(
      node2FeeBalance,
      'Node-2 withdrawal request should match balance',
    );
    expect(node1RequestAmount).to.equal(
      node2RequestAmount,
      'Both withdrawal requests should be equal',
    );

    console.log('  ✅ Both nodes have equal withdrawal requests');
  });

  it('Node-1 finalizes withdrawal, Node-2 cancels - verify wallet and state changes', async () => {
    console.log('\n🔄 Node-1 finalize vs Node-2 cancel');

    // Advance time to pass withdrawal delay
    const delay = await ParametersStorage.stakeWithdrawalDelay();
    await time.increase(delay + 1n);
    console.log(`  ⏰ Advanced time by ${delay + 1n} seconds`);

    // Get wallet balances before
    const node1WalletBefore = await Token.balanceOf(nodes[0].admin.address);
    const node2WalletBefore = await Token.balanceOf(nodes[1].admin.address);

    console.log(
      `  💳 Node-1 admin wallet before: ${hre.ethers.formatUnits(node1WalletBefore, 18)} TRAC`,
    );
    console.log(
      `  💳 Node-2 admin wallet before: ${hre.ethers.formatUnits(node2WalletBefore, 18)} TRAC`,
    );

    // Get withdrawal amounts
    const [node1WithdrawalAmount] =
      await StakingStorage.getOperatorFeeWithdrawalRequest(nodes[0].identityId);
    const [node2WithdrawalAmount] =
      await StakingStorage.getOperatorFeeWithdrawalRequest(nodes[1].identityId);

    // Node-1 finalizes withdrawal
    console.log('  ✅ Node-1 finalizing withdrawal...');
    await Staking.connect(nodes[0].admin).finalizeOperatorFeeWithdrawal(
      nodes[0].identityId,
    );

    // Node-2 cancels withdrawal
    console.log('  ❌ Node-2 canceling withdrawal...');
    await Staking.connect(nodes[1].admin).cancelOperatorFeeWithdrawal(
      nodes[1].identityId,
    );

    // Check wallet balances after
    const node1WalletAfter = await Token.balanceOf(nodes[0].admin.address);
    const node2WalletAfter = await Token.balanceOf(nodes[1].admin.address);

    console.log(
      `  💳 Node-1 admin wallet after: ${hre.ethers.formatUnits(node1WalletAfter, 18)} TRAC`,
    );
    console.log(
      `  💳 Node-2 admin wallet after: ${hre.ethers.formatUnits(node2WalletAfter, 18)} TRAC`,
    );

    // Verify Node-1 received tokens
    expect(node1WalletAfter - node1WalletBefore).to.equal(
      node1WithdrawalAmount,
      'Node-1 admin should receive withdrawal amount',
    );

    // Verify Node-2 wallet didn't change
    expect(node2WalletAfter).to.equal(
      node2WalletBefore,
      'Node-2 admin wallet should not change',
    );

    // Check operator fee balances after
    const node1FeeBalanceAfter = await StakingStorage.getOperatorFeeBalance(
      nodes[0].identityId,
    );
    const node2FeeBalanceAfter = await StakingStorage.getOperatorFeeBalance(
      nodes[1].identityId,
    );

    console.log(
      `  💎 Node-1 operator fee balance after: ${hre.ethers.formatUnits(node1FeeBalanceAfter, 18)} TRAC`,
    );
    console.log(
      `  💎 Node-2 operator fee balance after: ${hre.ethers.formatUnits(node2FeeBalanceAfter, 18)} TRAC`,
    );

    // Node-1 should have 0 operator fees (finalized)
    expect(node1FeeBalanceAfter).to.equal(
      0n,
      'Node-1 should have 0 operator fees after finalization',
    );

    // Node-2 should have restored operator fees (cancelled)
    expect(node2FeeBalanceAfter).to.equal(
      node2WithdrawalAmount,
      'Node-2 should have restored operator fees after cancellation',
    );

    // Verify withdrawal requests are cleared
    const [node1FinalRequest] =
      await StakingStorage.getOperatorFeeWithdrawalRequest(nodes[0].identityId);
    const [node2FinalRequest] =
      await StakingStorage.getOperatorFeeWithdrawalRequest(nodes[1].identityId);

    expect(node1FinalRequest).to.equal(
      0n,
      'Node-1 withdrawal request should be cleared',
    );
    expect(node2FinalRequest).to.equal(
      0n,
      'Node-2 withdrawal request should be cleared',
    );

    console.log('  ✅ Finalize/cancel flows completed successfully');
    console.log('  📝 Node-1: Received tokens, fees cleared');
    console.log('  📝 Node-2: No tokens, fees restored');
  });
});
