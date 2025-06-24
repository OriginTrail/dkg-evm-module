// test/rewards.initial-state.spec.ts
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { time } from '@nomicfoundation/hardhat-network-helpers';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { kcTools } = require('assertion-tools') as any;
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
} from '../../typechain';
import { createKnowledgeCollection } from '../helpers/kc-helpers';
import { createProfile } from '../helpers/profile-helpers';

/* ────────────────────────── helpers ────────────────────────── */

const toTRAC = (x: number) => hre.ethers.parseEther(x.toString());

// Sample data for KC
const quads = [
  '<urn:us-cities:info:new-york> <http://schema.org/area> "468.9 sq mi" .',
  '<urn:us-cities:info:new-york> <http://schema.org/name> "New York" .',
  '<urn:us-cities:info:new-york> <http://schema.org/population> "8,336,817" .',
  '<urn:us-cities:info:new-york> <http://schema.org/state> "New York" .',
  '<urn:us-cities:info:new-york> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://schema.org/City> .',
  // Add more quads to ensure we have enough chunks
  ...Array(100).fill(
    '<urn:fake:quad> <urn:fake:predicate> <urn:fake:object> .',
  ),
];

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
  let challenge =
    await contracts.randomSamplingStorage.getNodeChallenge(nodeId);

  // It can happen that challenge is not immediately available
  while (challenge[1] === 0n) {
    await hre.network.provider.send('evm_mine');
    challenge = await contracts.randomSamplingStorage.getNodeChallenge(nodeId);
  }

  // Calculate merkle proof for the challenge
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
  };

  // Get chunk size to avoid division by zero in challenge generation
  const chunkSize = Number(
    await contracts.randomSamplingStorage.CHUNK_BYTE_SIZE(),
  );

  const accounts = {
    owner: signers[0],
    // Main node for testing
    node1: { operational: signers[1], admin: signers[2] },
    // Additional nodes just to satisfy KC signature requirements (won't be used for staking)
    node2: { operational: signers[5], admin: signers[6] },
    node3: { operational: signers[7], admin: signers[8] },
    // Only 2 delegators
    delegators: signers.slice(3, 5),
    missingDelegator: signers[10],
    dummyAccount: signers[11],
    stakingStorageDummy: signers[12],
    delegatorsInfoDummy: signers[13],
    kcCreator: signers[9],
  };

  await contracts.hub.setContractAddress('HubOwner', accounts.owner.address);

  // Initialize ask system to prevent division by zero
  await contracts.parametersStorage.setMinimumStake(toTRAC(100));
  await contracts.parametersStorage
    .connect(accounts.owner)
    .setOperatorFeeUpdateDelay(0);

  // Mint tokens for delegators and KC creator
  for (const delegator of accounts.delegators) {
    await contracts.token.mint(delegator.address, toTRAC(1_000_000));
  }
  await contracts.token.mint(
    accounts.missingDelegator.address,
    toTRAC(1_000_000),
  );
  await contracts.token.mint(accounts.kcCreator.address, toTRAC(1_000_000));

  // Create node profiles (main node + 2 additional for KC requirements)
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

  // Set operator fee to 10% for main node
  await contracts.profile
    .connect(accounts.node1.admin)
    .updateOperatorFee(node1Id, 1000);

  // Initialize ask system for all nodes (required for KC creation)
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
  await contracts.ask.connect(accounts.owner).recalculateActiveSet();

  const node = {
    identityId: node1Id,
    operational: accounts.node1.operational,
    admin: accounts.node1.admin,
  };

  // Jump to epoch 1
  if ((await contracts.chronos.getCurrentEpoch()) < 1n) {
    const timeUntilNextEpoch = await contracts.chronos.timeUntilNextEpoch();
    await time.increase(timeUntilNextEpoch + 1n);
  }

  // Make sure we're in epoch 1
  while ((await contracts.chronos.getCurrentEpoch()) < 1n) {
    await time.increase((await contracts.chronos.timeUntilNextEpoch()) + 1n);
  }

  console.log('📅 We are in EPOCH 1 - ready to start');

  // Create reward pool for EPOCH 1
  const kcTokenAmount = toTRAC(1000);
  const numberOfEpochs = 3;
  const merkleRoot = kcTools.calculateMerkleRoot(quads, 32);

  // Create receiving nodes for KC (need at least 3 for signature requirement)
  const receivingNodes = [
    { operational: accounts.node1.operational, admin: accounts.node1.admin },
    { operational: accounts.node2.operational, admin: accounts.node2.admin },
    { operational: accounts.node3.operational, admin: accounts.node3.admin },
  ];
  const receivingNodesIds = [node1Id, node2Id, node3Id];

  await createKnowledgeCollection(
    accounts.kcCreator,
    node,
    node.identityId,
    receivingNodes,
    receivingNodesIds,
    { KnowledgeCollection: contracts.kc, Token: contracts.token },
    merkleRoot,
    'epoch-1-kc',
    5,
    chunkSize * 10,
    numberOfEpochs,
    kcTokenAmount,
  );

  // EPOCH 1 STAKES: 2 delegators with 200k TRAC each
  console.log(
    '\n╔══════════════════════════════════════════════════════════════════════════════════╗',
  );
  console.log(
    '║                              EPOCH-1 STAKING                                    ║',
  );
  console.log(
    '╠══════════════════════════════════════════════════════════════════════════════════╣',
  );

  // Delegator 1 stakes 200k TRAC
  await contracts.token
    .connect(accounts.delegators[0])
    .approve(await contracts.staking.getAddress(), toTRAC(50_000));
  await contracts.staking
    .connect(accounts.delegators[0])
    .stake(node1Id, toTRAC(50_000));
  console.log(
    '║  📍 D1  →  50,000 TRAC  →  Node-1                                               ║',
  );

  // Delegator 2 stakes 200k TRAC
  await contracts.token
    .connect(accounts.delegators[1])
    .approve(await contracts.staking.getAddress(), toTRAC(50_000));
  await contracts.staking
    .connect(accounts.delegators[1])
    .stake(node1Id, toTRAC(50_000));
  console.log(
    '║  📍 D2  →  50,000 TRAC  →  Node-1                                               ║',
  );
  console.log(
    '╚══════════════════════════════════════════════════════════════════════════════════╝',
  );

  // Manually set node total stake to 150k to simulate a missing delegator
  const stakingAddress = await contracts.staking.getAddress();
  await contracts.hub
    .connect(accounts.owner)
    .setContractAddress('Staking', accounts.dummyAccount.address);
  await contracts.stakingStorage
    .connect(accounts.dummyAccount)
    .setNodeStake(node1Id, toTRAC(150_000));
  await contracts.hub
    .connect(accounts.owner)
    .setContractAddress('Staking', stakingAddress);

  // Submit proof in EPOCH 1
  await advanceToNextProofingPeriod(contracts);

  console.log('\n🔬 EPOCH-1 PROOF SUBMITTED:');
  const nodeProof = await submitProofAndLogScore(
    node1Id,
    accounts.node1,
    contracts,
    1n,
  );
  console.log(
    `   ✅ Node-1: Score ${nodeProof.scoreBefore} → ${nodeProof.scoreAfter} (gain: ${nodeProof.scoreAfter - nodeProof.scoreBefore})`,
  );

  // → Move to EPOCH 2
  await time.increase((await contracts.chronos.timeUntilNextEpoch()) + 1n);

  // Create another KC to finalize epoch 1
  await createKnowledgeCollection(
    accounts.kcCreator,
    node,
    node.identityId,
    receivingNodes,
    receivingNodesIds,
    { KnowledgeCollection: contracts.kc, Token: contracts.token },
    kcTools.calculateMerkleRoot(quads, 32),
    'finalize-epoch-1',
    5,
    chunkSize * 10,
    1,
    toTRAC(100),
  );

  console.log('\n📝 EPOCH-2: System ready for testing');

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

  const totalStake = await contracts.stakingStorage.getNodeStake(
    node.identityId,
  );
  const nodeScore = await contracts.randomSamplingStorage.getNodeEpochScore(
    1n,
    node.identityId,
  );

  console.log(`🚀 Node-1 (ID: ${node.identityId}) - MAIN TESTING NODE`);
  console.log(
    `   💰 Total Stake: ${hre.ethers.formatUnits(totalStake, 18)} TRAC | 🎯 Operator Fee: 10%`,
  );
  console.log(`   📊 Score → E1: ${nodeScore}`);
  console.log(
    `📝 Note: Node-2 (ID: ${node2Id}) and Node-3 (ID: ${node3Id}) exist only for KC signature requirements`,
  );

  const delegatorStakes = [];
  for (let d = 0; d < accounts.delegators.length; d++) {
    const key = hre.ethers.keccak256(
      hre.ethers.solidityPacked(['address'], [accounts.delegators[d].address]),
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

  console.log(
    '═══════════════════════════════════════════════════════════════════════════════════════════════\n',
  );

  // Return environment for tests
  return {
    Hub: contracts.hub,
    Token: contracts.token,
    Profile: contracts.profile,
    ProfileStorage: contracts.profileStorage,
    Staking: contracts.staking,
    StakingStorage: contracts.stakingStorage,
    DelegatorsInfo: contracts.delegatorsInfo,
    Chronos: contracts.chronos,
    RandomSamplingStorage: contracts.randomSamplingStorage,
    EpochStorage: contracts.epochStorage,
    KC: contracts.kc,
    delegators: accounts.delegators,
    missingDelegator: accounts.missingDelegator,
    dummyAccount: accounts.dummyAccount,
    stakingStorageDummy: accounts.stakingStorageDummy,
    delegatorsInfoDummy: accounts.delegatorsInfoDummy,
    node,
    accounts,
  };
}

/* ───────────────────────────── tests ───────────────────────── */

describe('Staking Migration Test', () => {
  it('should setup initial state with Node 1 and 2 delegators', async () => {
    const setup = await buildInitialRewardsState();

    // Verify we're at least in epoch 2 (might be 3 due to proof timing)
    const currentEpoch = await setup.Chronos.getCurrentEpoch();
    expect(currentEpoch).to.be.greaterThanOrEqual(2n);

    // Verify node exists and has stakes
    const totalStake = await setup.StakingStorage.getNodeStake(
      setup.node.identityId,
    );
    expect(totalStake).to.equal(hre.ethers.parseEther('150000')); // 150k TRAC

    // Verify node has score from EPOCH 1
    const nodeScore = await setup.RandomSamplingStorage.getNodeEpochScore(
      1n,
      setup.node.identityId,
    );
    expect(nodeScore).to.be.greaterThan(0);

    console.log('✅ Setup completed successfully!');
    console.log(`   📅 Current Epoch: ${currentEpoch}`);
    console.log(
      `   💰 Total Stake: ${hre.ethers.formatEther(totalStake)} TRAC`,
    );
    console.log(`   📊 Node Score (E1): ${nodeScore}`);
  });

  it('should correctly distribute rewards to a late-migrated delegator', async () => {
    const setup = await buildInitialRewardsState();
    const {
      Staking,
      StakingStorage,
      DelegatorsInfo,
      Hub: hub,
      node,
      delegators,
      missingDelegator,
      stakingStorageDummy,
      delegatorsInfoDummy,
      accounts,
    } = setup;

    // D1 and D2 claim rewards for epoch 1
    await Staking.connect(delegators[0]).claimDelegatorRewards(
      node.identityId,
      1,
      delegators[0].address,
    );
    await Staking.connect(delegators[1]).claimDelegatorRewards(
      node.identityId,
      1,
      delegators[1].address,
    );

    // Manually add the missing delegator
    const stakingStorageAddress = await StakingStorage.getAddress();
    const delegatorsInfoAddress = await DelegatorsInfo.getAddress();
    await hub
      .connect(accounts.owner)
      .setContractAddress('StakingStorage', stakingStorageDummy.address);
    await hub
      .connect(accounts.owner)
      .setContractAddress('DelegatorsInfo', delegatorsInfoDummy.address);

    const d3Key = hre.ethers.keccak256(
      hre.ethers.solidityPacked(['address'], [missingDelegator.address]),
    );

    await StakingStorage.connect(stakingStorageDummy).setDelegatorStakeBase(
      node.identityId,
      d3Key,
      toTRAC(50_000),
    );
    await DelegatorsInfo.connect(delegatorsInfoDummy).addDelegator(
      node.identityId,
      missingDelegator.address,
    );

    await hub
      .connect(accounts.owner)
      .setContractAddress('StakingStorage', stakingStorageAddress);
    await hub
      .connect(accounts.owner)
      .setContractAddress('DelegatorsInfo', delegatorsInfoAddress);

    // Debug reward pool and scores before claiming
    const epochPool = await setup.EpochStorage.getEpochPool(1, 1);
    const nodeScore = await setup.RandomSamplingStorage.getNodeEpochScore(
      1,
      node.identityId,
    );
    const allNodesScore =
      await setup.RandomSamplingStorage.getAllNodesEpochScore(1);

    console.log(`\n🔍 DEBUG BEFORE CLAIMS:`);
    console.log(`   Epoch 1 Pool: ${hre.ethers.formatEther(epochPool)} TRAC`);
    console.log(`   Node Score: ${nodeScore}`);
    console.log(`   All Nodes Score: ${allNodesScore}`);

    // Check delegator scores
    const d1DebugKey = hre.ethers.keccak256(
      hre.ethers.solidityPacked(['address'], [delegators[0].address]),
    );
    const d2DebugKey = hre.ethers.keccak256(
      hre.ethers.solidityPacked(['address'], [delegators[1].address]),
    );
    const d3DebugKey = hre.ethers.keccak256(
      hre.ethers.solidityPacked(['address'], [missingDelegator.address]),
    );

    const d1Score =
      await setup.RandomSamplingStorage.getEpochNodeDelegatorScore(
        1,
        node.identityId,
        d1DebugKey,
      );
    const d2Score =
      await setup.RandomSamplingStorage.getEpochNodeDelegatorScore(
        1,
        node.identityId,
        d2DebugKey,
      );
    const d3Score =
      await setup.RandomSamplingStorage.getEpochNodeDelegatorScore(
        1,
        node.identityId,
        d3DebugKey,
      );

    console.log(`   D1 Score: ${d1Score}`);
    console.log(`   D2 Score: ${d2Score}`);
    console.log(`   D3 Score: ${d3Score}`);

    // D3 claims rewards for epoch 1
    await Staking.connect(missingDelegator).claimDelegatorRewards(
      node.identityId,
      1,
      missingDelegator.address,
    );

    // Check both rolling rewards and stake base changes
    const d1RollingRewards = await DelegatorsInfo.getDelegatorRollingRewards(
      node.identityId,
      delegators[0].address,
    );
    const d2RollingRewards = await DelegatorsInfo.getDelegatorRollingRewards(
      node.identityId,
      delegators[1].address,
    );
    const d3RollingRewards = await DelegatorsInfo.getDelegatorRollingRewards(
      node.identityId,
      missingDelegator.address,
    );

    // Check stake base (rewards might be auto-restaked)
    const d1Key = hre.ethers.keccak256(
      hre.ethers.solidityPacked(['address'], [delegators[0].address]),
    );
    const d2Key = hre.ethers.keccak256(
      hre.ethers.solidityPacked(['address'], [delegators[1].address]),
    );

    const d1StakeAfter = await StakingStorage.getDelegatorStakeBase(
      node.identityId,
      d1Key,
    );
    const d2StakeAfter = await StakingStorage.getDelegatorStakeBase(
      node.identityId,
      d2Key,
    );
    const d3StakeAfter = await StakingStorage.getDelegatorStakeBase(
      node.identityId,
      d3Key,
    );

    console.log(`\n💰 REWARDS SUMMARY:`);
    console.log(
      `D1 Rolling Rewards: ${hre.ethers.formatEther(d1RollingRewards)} TRAC`,
    );
    console.log(
      `D2 Rolling Rewards: ${hre.ethers.formatEther(d2RollingRewards)} TRAC`,
    );
    console.log(
      `D3 (migrated) Rolling Rewards: ${hre.ethers.formatEther(d3RollingRewards)} TRAC`,
    );
    console.log(`D1 Stake After: ${hre.ethers.formatEther(d1StakeAfter)} TRAC`);
    console.log(`D2 Stake After: ${hre.ethers.formatEther(d2StakeAfter)} TRAC`);
    console.log(`D3 Stake After: ${hre.ethers.formatEther(d3StakeAfter)} TRAC`);

    // Calculate actual rewards (stake increase from original 50k)
    const d1Rewards = d1StakeAfter - toTRAC(50_000);
    const d2Rewards = d2StakeAfter - toTRAC(50_000);
    const d3Rewards = d3StakeAfter - toTRAC(50_000);

    console.log(`\n✅ MIGRATION TEST SUCCESS:`);
    console.log(`   D1 Rewards: ${hre.ethers.formatEther(d1Rewards)} TRAC`);
    console.log(`   D2 Rewards: ${hre.ethers.formatEther(d2Rewards)} TRAC`);
    console.log(
      `   D3 (Migrated) Rewards: ${hre.ethers.formatEther(d3Rewards)} TRAC`,
    );
    console.log(
      `   📝 All delegators received equal rewards despite D3 being added post-epoch!`,
    );

    // Assert that all delegators received equal rewards
    expect(d1Rewards).to.be.gt(0, 'D1 should receive rewards');
    expect(d1Rewards).to.equal(
      d2Rewards,
      'D1 and D2 should receive equal rewards',
    );
    expect(d1Rewards).to.equal(
      d3Rewards,
      'D3 should receive same rewards as D1/D2 despite being migrated late',
    );
  });
});
