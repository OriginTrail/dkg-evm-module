import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { time } from '@nomicfoundation/hardhat-network-helpers';
// @ts-expect-error: No type definitions available for assertion-tools
import { kcTools } from 'assertion-tools';
import { expect } from 'chai';
import hre, { ethers } from 'hardhat';

import {
  Hub,
  Token,
  Chronos,
  StakingStorage,
  RandomSamplingStorage,
  ParametersStorage,
  ProfileStorage,
  EpochStorage,
  DelegatorsInfo,
  Ask,
  Staking,
  RandomSampling,
  Profile,
  KnowledgeCollection,
  AskStorage,
} from '../../typechain';
import { createKnowledgeCollection } from '../helpers/kc-helpers';
import { createProfile } from '../helpers/profile-helpers';

// Sample data for KC
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
  // Add more quads to ensure we have enough chunks
  ...Array(1000).fill(
    '<urn:fake:quad> <urn:fake:predicate> <urn:fake:object> .',
  ),
];
const merkleRoot = kcTools.calculateMerkleRoot(quads, 32);

const toTRAC = (x: string | number) => ethers.parseUnits(x.toString(), 18);

// ================================================================================================================
// HELPER FUNCTIONS: Extract common functionality for better readability and reusability
// ================================================================================================================

type TestContracts = {
  hub: Hub;
  token: Token;
  chronos: Chronos;
  stakingStorage: StakingStorage;
  randomSamplingStorage: RandomSamplingStorage;
  parametersStorage: ParametersStorage;
  profileStorage: ProfileStorage;
  epochStorage: EpochStorage;
  delegatorsInfo: DelegatorsInfo;
  staking: Staking;
  profile: Profile;
  randomSampling: RandomSampling;
  kc: KnowledgeCollection;
  askStorage: AskStorage;
  ask: Ask;
};

type TestAccounts = {
  owner: SignerWithAddress;
  node1: { operational: SignerWithAddress; admin: SignerWithAddress };
  node2: { operational: SignerWithAddress; admin: SignerWithAddress };
  delegator1: SignerWithAddress;
  delegator2: SignerWithAddress;
  delegator3: SignerWithAddress;
  kcCreator: SignerWithAddress;
  receiver1: { operational: SignerWithAddress; admin: SignerWithAddress };
  receiver2: { operational: SignerWithAddress; admin: SignerWithAddress };
  receiver3: { operational: SignerWithAddress; admin: SignerWithAddress };
};

/**
 * Calculate expected node score manually to verify contract calculation
 * This implements the same logic as RandomSampling.calculateNodeScore()
 */
async function calculateExpectedNodeScore(
  nodeId: bigint,
  contracts: TestContracts,
): Promise<bigint> {
  const SCALE18 = ethers.parseUnits('1', 18);

  // 1. Node stake factor calculation
  const maximumStake = await contracts.parametersStorage.maximumStake();
  let nodeStake = await contracts.stakingStorage.getNodeStake(nodeId);
  nodeStake = nodeStake > maximumStake ? maximumStake : nodeStake;

  const stakeRatio18 = (nodeStake * SCALE18) / maximumStake;
  const nodeStakeFactor18 = (2n * stakeRatio18 * stakeRatio18) / SCALE18;

  // 2. Node ask factor calculation
  const nodeAsk18 = (await contracts.profileStorage.getAsk(nodeId)) * SCALE18;
  const [askLowerBound18, askUpperBound18] =
    await contracts.askStorage.getAskBounds();

  let nodeAskFactor18 = 0n;
  if (
    askUpperBound18 > askLowerBound18 &&
    nodeAsk18 >= askLowerBound18 &&
    nodeAsk18 <= askUpperBound18
  ) {
    const askDiffRatio18 =
      ((askUpperBound18 - nodeAsk18) * SCALE18) /
      (askUpperBound18 - askLowerBound18);
    nodeAskFactor18 = (stakeRatio18 * askDiffRatio18 ** 2n) / SCALE18 ** 2n;
  }

  // 3. Node publishing factor calculation
  const nodePub =
    await contracts.epochStorage.getNodeCurrentEpochProducedKnowledgeValue(
      nodeId,
    );
  const maxNodePub =
    await contracts.epochStorage.getCurrentEpochNodeMaxProducedKnowledgeValue();

  let nodePublishingFactor18 = 0n;
  if (maxNodePub > 0n) {
    const pubRatio18 = (nodePub * SCALE18) / maxNodePub;
    nodePublishingFactor18 = (nodeStakeFactor18 * pubRatio18) / SCALE18;
  }

  return nodeStakeFactor18 + nodeAskFactor18 + nodePublishingFactor18;
}

/**
 * Calculate expected delegator score earned during a period
 */
// TODO: Does this make sense?
function calculateExpectedDelegatorScore(
  delegatorStake: bigint,
  nodeScorePerStake: bigint,
  delegatorLastSettledNodeScorePerStake: bigint,
): bigint {
  const diff = nodeScorePerStake - delegatorLastSettledNodeScorePerStake;
  const SCALE18 = ethers.parseUnits('1', 18);
  return (delegatorStake * diff) / SCALE18;
}

/**
 * Submit a proof for a node and verify the score calculation
 */
async function submitProofAndVerifyScore(
  nodeId: bigint,
  node: { operational: SignerWithAddress; admin: SignerWithAddress },
  contracts: TestContracts,
  epoch: bigint,
  expectedTotalStake: bigint,
): Promise<{ nodeScore: bigint; nodeScorePerStake: bigint }> {
  console.log(`    📋 Submitting proof for node ${nodeId}...`);

  // Get scores before proof submission
  const nodeScoreBeforeProofSubmission =
    await contracts.randomSamplingStorage.getNodeEpochScore(epoch, nodeId);
  const nodeScorePerStakeBeforeProofSubmission =
    await contracts.randomSamplingStorage.getNodeEpochScorePerStake(
      epoch,
      nodeId,
    );

  // Create challenge
  await contracts.randomSampling.connect(node.operational).createChallenge();
  const challenge =
    await contracts.randomSamplingStorage.getNodeChallenge(nodeId);

  // Generate and submit proof
  const chunks = kcTools.splitIntoChunks(quads, 32);
  const chunkId = Number(challenge[1]);
  const { proof } = kcTools.calculateMerkleProof(quads, 32, chunkId);
  await contracts.randomSampling
    .connect(node.operational)
    .submitProof(chunks[chunkId], proof);

  // Get actual score from contract
  const nodeScoreAfterProofSubmission =
    await contracts.randomSamplingStorage.getNodeEpochScore(epoch, nodeId);
  const nodeScorePerStake =
    await contracts.randomSamplingStorage.getNodeEpochScorePerStake(
      epoch,
      nodeId,
    );

  // Calculate expected scores
  const nodeScoreIncrement = await calculateExpectedNodeScore(
    nodeId,
    contracts,
  );
  const expectedNodeScore = nodeScoreBeforeProofSubmission + nodeScoreIncrement;
  console.log(
    `    ✅ Node score: expected ${expectedNodeScore}, actual ${nodeScoreAfterProofSubmission}`,
  );
  // Verify scores match
  expect(nodeScoreAfterProofSubmission).to.be.gt(
    0,
    'Node score should be positive',
  );
  expect(nodeScoreAfterProofSubmission).to.be.equal(expectedNodeScore);

  const nodeScorePerStakeIncrement =
    (nodeScoreIncrement * ethers.parseUnits('1', 18)) / expectedTotalStake;
  const expectedNodeScorePerStake =
    nodeScorePerStakeBeforeProofSubmission + nodeScorePerStakeIncrement;
  console.log(
    `    ✅ Node score per stake: expected ${expectedNodeScorePerStake}, actual ${nodeScorePerStake}`,
  );
  expect(nodeScorePerStake).to.be.gt(
    0,
    'Node score per stake should be positive',
  );
  expect(nodeScorePerStake).to.be.equal(expectedNodeScorePerStake);

  return {
    nodeScore: nodeScoreAfterProofSubmission,
    nodeScorePerStake: nodeScorePerStake,
  };
}

/**
 * Advance to next proofing period by mining blocks
 */
async function advanceToNextProofingPeriod(
  contracts: TestContracts,
): Promise<void> {
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

/**
 * Setup initial test environment with accounts and contracts
 */
async function setupTestEnvironment(): Promise<{
  accounts: TestAccounts;
  contracts: TestContracts;
  nodeIds: { node1Id: bigint; node2Id: bigint };
}> {
  await hre.deployments.fixture();

  const signers = await hre.ethers.getSigners();
  const accounts: TestAccounts = {
    owner: signers[0],
    node1: { operational: signers[1], admin: signers[2] },
    node2: { operational: signers[3], admin: signers[4] },
    delegator1: signers[5],
    delegator2: signers[6],
    delegator3: signers[7],
    kcCreator: signers[8],
    receiver1: { operational: signers[9], admin: signers[10] },
    receiver2: { operational: signers[11], admin: signers[12] },
    receiver3: { operational: signers[13], admin: signers[14] },
  };

  const contracts: TestContracts = {
    hub: await hre.ethers.getContract<Hub>('Hub'),
    token: await hre.ethers.getContract<Token>('Token'),
    chronos: await hre.ethers.getContract<Chronos>('Chronos'),
    stakingStorage:
      await hre.ethers.getContract<StakingStorage>('StakingStorage'),
    randomSamplingStorage: await hre.ethers.getContract<RandomSamplingStorage>(
      'RandomSamplingStorage',
    ),
    parametersStorage:
      await hre.ethers.getContract<ParametersStorage>('ParametersStorage'),
    profileStorage:
      await hre.ethers.getContract<ProfileStorage>('ProfileStorage'),
    epochStorage: await hre.ethers.getContract<EpochStorage>('EpochStorageV8'),
    delegatorsInfo:
      await hre.ethers.getContract<DelegatorsInfo>('DelegatorsInfo'),
    staking: await hre.ethers.getContract<Staking>('Staking'),
    profile: await hre.ethers.getContract<Profile>('Profile'),
    randomSampling:
      await hre.ethers.getContract<RandomSampling>('RandomSampling'),
    kc: await hre.ethers.getContract<KnowledgeCollection>(
      'KnowledgeCollection',
    ),
    askStorage: await hre.ethers.getContract<AskStorage>('AskStorage'),
    ask: await hre.ethers.getContract<Ask>('Ask'),
  };

  await contracts.hub.setContractAddress('HubOwner', accounts.owner.address);
  const DECIMALS = await contracts.token.decimals();

  // Mint tokens for all participants
  for (const delegator of [
    accounts.delegator1,
    accounts.delegator2,
    accounts.delegator3,
  ]) {
    await contracts.token.mint(delegator.address, toTRAC(100_000));
  }
  const d2Balance = await contracts.token.balanceOf(
    accounts.delegator2.address,
  );
  /* console.log(
    `\n💰💰💰 INITIAL BALANCE 💰💰💰 Delegator2 balance after minting: ${ethers.formatUnits(
      d2Balance,
      await contracts.token.decimals(),
    )} TRAC\n`,
  ); */
  await contracts.token.mint(accounts.owner.address, toTRAC(1_000_000));
  await contracts.token.mint(
    accounts.node1.operational.address,
    toTRAC(1_000_000),
  );
  await contracts.token.mint(accounts.kcCreator.address, toTRAC(1_000_000));

  await contracts.parametersStorage
    .connect(accounts.owner) // HubOwner
    .setOperatorFeeUpdateDelay(0);

  // Create node profiles
  const { identityId: node1Id } = await createProfile(
    contracts.profile,
    accounts.node1,
  );
  const { identityId: node2Id } = await createProfile(
    contracts.profile,
    accounts.node2,
  );

  await contracts.profile
    .connect(accounts.node1.admin)
    .updateOperatorFee(node1Id, 0); // 0 %
  await contracts.profile
    .connect(accounts.node2.admin)
    .updateOperatorFee(node2Id, 0); // 0 %

  // Initialize ask system (required to prevent division by zero in RandomSampling)
  await contracts.parametersStorage.setMinimumStake(toTRAC(100));

  // Set operator fee to 0% for testing purposes

  // TODO: is this needed?
  // await contracts.token
  //   .connect(accounts.node1.operational)
  //   .approve(await contracts.staking.getAddress(), toTRAC(100));
  // await contracts.staking
  //   .connect(accounts.node1.operational)
  //   .stake(node1Id, toTRAC(100));

  // const nodeAsk = ethers.parseUnits('0.2', 18);
  // await contracts.profile
  //   .connect(accounts.node1.operational)
  //   .updateAsk(node1Id, nodeAsk);
  // await contracts.ask.connect(accounts.owner).recalculateActiveSet();

  // Jump to clean epoch start
  const timeUntilNextEpoch = await contracts.chronos.timeUntilNextEpoch();
  await time.increase(timeUntilNextEpoch + 1n);

  return {
    accounts,
    contracts,
    nodeIds: { node1Id: BigInt(node1Id), node2Id: BigInt(node2Id) },
  };
}

describe(`Full complex scenario`, function () {
  let accounts: TestAccounts;
  let contracts: TestContracts;
  let nodeIds: { node1Id: bigint; node2Id: bigint };
  let node1Id: bigint;
  let d1Key: string, d2Key: string, d3Key: string;
  let epoch1: bigint;
  let receivingNodes: {
    operational: SignerWithAddress;
    admin: SignerWithAddress;
  }[];
  let receivingNodesIdentityIds: number[];
  let TOKEN_DECIMALS = 18;

  it('Should execute steps 1-7 with detailed score calculations and verification', async function () {
    // ================================================================================================================
    // SETUP: Initialize test environment
    // ================================================================================================================
    const setup = await setupTestEnvironment();
    accounts = setup.accounts;
    contracts = setup.contracts;
    nodeIds = setup.nodeIds;
    node1Id = nodeIds.node1Id;

    TOKEN_DECIMALS = Number(await contracts.token.decimals());

    epoch1 = await contracts.chronos.getCurrentEpoch();
    console.log(`\n🏁 Starting test in epoch ${epoch1}`);

    // Create delegator keys for state verification
    d1Key = ethers.keccak256(
      ethers.solidityPacked(['address'], [accounts.delegator1.address]),
    );
    d2Key = ethers.keccak256(
      ethers.solidityPacked(['address'], [accounts.delegator2.address]),
    );
    d3Key = ethers.keccak256(
      ethers.solidityPacked(['address'], [accounts.delegator3.address]),
    );

    // ================================================================================================================
    // SETUP: Create Knowledge Collection for reward pool
    // ================================================================================================================
    console.log(`\n📚 Creating Knowledge Collection for reward pool...`);

    receivingNodes = [
      accounts.receiver1,
      accounts.receiver2,
      accounts.receiver3,
    ];
    receivingNodesIdentityIds = [];
    for (const recNode of receivingNodes) {
      const { identityId } = await createProfile(contracts.profile, recNode);
      receivingNodesIdentityIds.push(Number(identityId));
    }

    const kcTokenAmount = toTRAC(48_000);
    await createKnowledgeCollection(
      accounts.kcCreator,
      accounts.node1,
      Number(node1Id),
      receivingNodes,
      receivingNodesIdentityIds,
      { KnowledgeCollection: contracts.kc, Token: contracts.token },
      merkleRoot,
      'test-op-id',
      10,
      1000,
      10,
      kcTokenAmount,
    );

    // ================================================================================================================
    // STEP 1: Delegator1 stakes 10,000 TRAC
    // ================================================================================================================
    console.log(`\n📊 STEP 1: Delegator1 stakes 10,000 TRAC`);

    await contracts.token
      .connect(accounts.delegator1)
      .approve(await contracts.staking.getAddress(), toTRAC(10_000));
    await contracts.staking
      .connect(accounts.delegator1)
      .stake(node1Id, toTRAC(10_000));

    // Verify state
    const totalStakeAfterStep1 =
      await contracts.stakingStorage.getNodeStake(node1Id);
    console.log(
      `    ✅ Node1 total stake: ${ethers.formatUnits(totalStakeAfterStep1, 18)} TRAC`,
    );
    expect(totalStakeAfterStep1).to.equal(toTRAC(10_000));

    // ================================================================================================================
    // STEP 2: Delegator2 stakes 20,000 TRAC
    // ================================================================================================================
    console.log(`\n📊 STEP 2: Delegator2 stakes 20,000 TRAC`);

    await contracts.token
      .connect(accounts.delegator2)
      .approve(await contracts.staking.getAddress(), toTRAC(20_000));
    await contracts.staking
      .connect(accounts.delegator2)
      .stake(node1Id, toTRAC(20_000));

    const totalStakeAfterStep2 =
      await contracts.stakingStorage.getNodeStake(node1Id);
    console.log(
      `    ✅ Node1 total stake: ${ethers.formatUnits(totalStakeAfterStep2, 18)} TRAC`,
    );
    expect(totalStakeAfterStep2).to.equal(toTRAC(30_000));

    // ================================================================================================================
    // STEP 3: Delegator3 stakes 30,000 TRAC
    // ================================================================================================================
    console.log(`\n📊 STEP 3: Delegator3 stakes 30,000 TRAC`);

    await contracts.token
      .connect(accounts.delegator3)
      .approve(await contracts.staking.getAddress(), toTRAC(30_000));
    await contracts.staking
      .connect(accounts.delegator3)
      .stake(node1Id, toTRAC(30_000));

    const totalStakeAfterStep3 =
      await contracts.stakingStorage.getNodeStake(node1Id);
    console.log(
      `    ✅ Node1 total stake: ${ethers.formatUnits(totalStakeAfterStep3, 18)} TRAC`,
    );
    expect(totalStakeAfterStep3).to.equal(toTRAC(60_000));

    // ================================================================================================================
    // STEP 4: Node1 submits first proof with score verification
    // ================================================================================================================
    console.log(`\n🔬 STEP 4: Node1 submits first proof`);

    await contracts.randomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
    const {
      nodeScore: scoreAfter1,
      nodeScorePerStake: nodeScorePerStakeAfter1,
    } = await submitProofAndVerifyScore(
      node1Id,
      accounts.node1,
      contracts,
      epoch1,
      totalStakeAfterStep3,
    );

    // ================================================================================================================
    // STEP 5: Delegator1 stakes additional 10,000 TRAC with score settlement verification
    // ================================================================================================================
    console.log(`\n📊 STEP 5: Delegator1 stakes additional 10,000 TRAC`);

    // Get delegator1's score before staking
    const d1ScoreBeforeStake =
      await contracts.randomSamplingStorage.getEpochNodeDelegatorScore(
        epoch1,
        node1Id,
        d1Key,
      );

    // Get delegator1's last settled node score per stake
    const d1LastSettledNodeScorePerStake =
      await contracts.randomSamplingStorage.getDelegatorLastSettledNodeEpochScorePerStake(
        epoch1,
        node1Id,
        d1Key,
      );

    // Stake additional 10,000 TRAC
    await contracts.token
      .connect(accounts.delegator1)
      .approve(await contracts.staking.getAddress(), toTRAC(10_000));
    await contracts.staking
      .connect(accounts.delegator1)
      .stake(node1Id, toTRAC(10_000));

    // Verify node1's total stake
    const totalStakeAfterStep5 =
      await contracts.stakingStorage.getNodeStake(node1Id);
    console.log(
      `    ✅ Node1 total stake: ${ethers.formatUnits(totalStakeAfterStep5, 18)} TRAC`,
    );
    expect(totalStakeAfterStep5).to.equal(toTRAC(70_000));

    // Verify delegator1's score settlement from first proof period
    const d1ScoreAfterStake =
      await contracts.randomSamplingStorage.getEpochNodeDelegatorScore(
        epoch1,
        node1Id,
        d1Key,
      );
    const expectedD1ScoreIncrement = calculateExpectedDelegatorScore(
      toTRAC(10_000),
      nodeScorePerStakeAfter1,
      d1LastSettledNodeScorePerStake,
    );
    const expectedD1Score = d1ScoreBeforeStake + expectedD1ScoreIncrement;

    console.log(`    🧮 Delegator1 score settlement verification:`);
    console.log(
      `    ✅ Expected: ${expectedD1Score}, Actual: ${d1ScoreAfterStake}`,
    );
    expect(d1ScoreAfterStake).to.equal(
      expectedD1Score,
      'Delegator1 score settlement mismatch',
    );

    // ================================================================================================================
    // STEP 6: Node1 submits second proof
    // ================================================================================================================
    console.log(`\n🔬 STEP 6: Node1 submits second proof`);

    await advanceToNextProofingPeriod(contracts);
    const {
      nodeScore: scoreAfter2,
      nodeScorePerStake: nodeScorePerStakeAfter2,
    } = await submitProofAndVerifyScore(
      node1Id,
      accounts.node1,
      contracts,
      epoch1,
      totalStakeAfterStep5,
    );

    expect(scoreAfter2).to.be.gt(
      scoreAfter1,
      'Second proof should increase total score',
    );
    expect(nodeScorePerStakeAfter2).to.be.gt(
      nodeScorePerStakeAfter1,
      'Score per stake should increase',
    );

    // ================================================================================================================
    // ADVANCE TO NEXT EPOCH AND FINALIZE
    // ================================================================================================================
    console.log(`\n⏭️ Advancing to next epoch and finalizing...`);

    const timeUntilNextEpoch = await contracts.chronos.timeUntilNextEpoch();
    await time.increase(timeUntilNextEpoch + 1n);
    const epoch2 = await contracts.chronos.getCurrentEpoch();
    console.log(`    ✅ Advanced to epoch ${epoch2}`);

    // Create another KC to trigger epoch finalization
    await createKnowledgeCollection(
      accounts.kcCreator,
      accounts.node1,
      Number(node1Id),
      receivingNodes,
      receivingNodesIdentityIds,
      { KnowledgeCollection: contracts.kc, Token: contracts.token },
      merkleRoot,
      'dummy-op-id-2',
    );

    expect(await contracts.epochStorage.lastFinalizedEpoch(1)).to.be.gte(
      epoch1,
    );
    console.log(`    ✅ Epoch ${epoch1} finalized`);

    // ================================================================================================================
    // STEP 7: Delegator1 claims rewards with detailed verification
    // ================================================================================================================
    console.log(`\n💰 STEP 7: Delegator1 claims rewards for epoch ${epoch1}`);

    const d1StakeBaseBefore =
      await contracts.stakingStorage.getDelegatorStakeBase(node1Id, d1Key);

    // Get node score
    const nodeFinalScore =
      await contracts.randomSamplingStorage.getNodeEpochScore(epoch1, node1Id);
    const netNodeRewards = await contracts.staking.getNetNodeRewards(
      node1Id,
      epoch1,
    );

    console.log(`    🧮 Reward calculation verification:`);
    console.log(`    📊 Node1 final score: ${nodeFinalScore}`);
    console.log(
      `    💎 Net delegator rewards: ${ethers.formatUnits(netNodeRewards, 18)} TRAC`,
    );

    // Claim rewards
    await contracts.staking
      .connect(accounts.delegator1)
      .claimDelegatorRewards(node1Id, epoch1, accounts.delegator1.address);

    const d1FinalScore =
      await contracts.randomSamplingStorage.getEpochNodeDelegatorScore(
        epoch1,
        node1Id,
        d1Key,
      );

    // Calculate expected reward: (delegator_score / node_score) * available_rewards
    const expectedReward = (d1FinalScore * netNodeRewards) / nodeFinalScore;

    console.log(`    📊 Delegator1 final score: ${d1FinalScore}`);
    console.log(
      `    💰 Expected reward: ${ethers.formatUnits(expectedReward, 18)} TRAC`,
    );

    const d1StakeBaseAfter =
      await contracts.stakingStorage.getDelegatorStakeBase(node1Id, d1Key);
    const d1LastClaimedEpoch =
      await contracts.delegatorsInfo.getLastClaimedEpoch(
        node1Id,
        accounts.delegator1.address,
      );

    // Verify reward was auto-staked (since gap is only 1 epoch)
    const actualReward = d1StakeBaseAfter - d1StakeBaseBefore;
    console.log(
      `    ✅ Actual reward: ${ethers.formatUnits(actualReward, 18)} TRAC`,
    );

    // TODO: Fix manual reward calculation - delegator accumulates score across multiple proof periods
    // The actual reward is higher because delegator1 earned score in both periods:
    // Period 1: 10k stake * score_per_stake_1
    // Period 2: 20k stake * (score_per_stake_2 - score_per_stake_1)
    console.log(
      `    📝 Note: Manual calculation needs to account for multi-period accumulation`,
    );
    expect(actualReward).to.be.gt(0, 'Reward should be positive');
    expect(d1LastClaimedEpoch).to.equal(
      epoch1,
      'Last claimed epoch not updated',
    );
    expect(actualReward).to.equal(expectedReward);

    // Verify other delegators haven't claimed yet
    expect(
      await contracts.delegatorsInfo.getLastClaimedEpoch(
        node1Id,
        accounts.delegator2.address,
      ),
    ).to.equal(epoch1 - 1n);
    expect(
      await contracts.delegatorsInfo.getLastClaimedEpoch(
        node1Id,
        accounts.delegator3.address,
      ),
    ).to.equal(epoch1 - 1n);

    // ================================================================================================================
    // FINAL VERIFICATION: Test completed successfully
    // ================================================================================================================
    console.log(
      `\n✨ STEPS 1-7 COMPLETED SUCCESSFULLY WITH FULL VERIFICATION ✨`,
    );
    console.log(
      `📈 Final Node1 total stake: ${ethers.formatUnits(await contracts.stakingStorage.getNodeStake(node1Id), 18)} TRAC`,
    );
    console.log(
      `👤 Final Delegator1 stake: ${ethers.formatUnits(await contracts.stakingStorage.getDelegatorStakeBase(node1Id, d1Key), 18)} TRAC`,
    );
    console.log(
      `👤 Final Delegator2 stake: ${ethers.formatUnits(await contracts.stakingStorage.getDelegatorStakeBase(node1Id, d2Key), 18)} TRAC`,
    );
    console.log(
      `👤 Final Delegator3 stake: ${ethers.formatUnits(await contracts.stakingStorage.getDelegatorStakeBase(node1Id, d3Key), 18)} TRAC`,
    );

    // Key verifications completed:
    // ✅ 1. Delegators can stake on a node
    // ✅ 2. Node can submit proofs and accumulate score (with manual verification)
    // ✅ 3. Delegator scores are properly settled when additional stakes are made (with manual verification)
    // ✅ 4. Epochs can be finalized
    // ✅ 5. Delegators can claim rewards based on their proportional score (with manual verification)
    // ✅ 6. Rewards are auto-staked when epoch gap ≤ 1
    // ✅ 7. All score calculations match manual computations
  });

  /******************************************************************************************
   *  Steps 8 → 14 (continues from the chain state left after Step 7)                       *
   ******************************************************************************************/

  it('Should execute steps 8-14 with detailed score calculations and verification', async function () {
    /* Epoch markers */
    const currentEpoch = await contracts.chronos.getCurrentEpoch(); // == 2
    const previousEpoch = currentEpoch - 1n; // == 1

    /**********************************************************************
     * STEP 8 – Delegator2 claims rewards for previousEpoch               *
     **********************************************************************/
    console.log(
      `\n💰 STEP 8: Delegator2 claims rewards for epoch ${previousEpoch}`,
    );

    const d2BaseBefore = await contracts.stakingStorage.getDelegatorStakeBase(
      node1Id,
      d2Key,
    );

    const nodeScorePrev =
      await contracts.randomSamplingStorage.getNodeEpochScore(
        previousEpoch,
        node1Id,
      );
    const netRewardsPrev = await contracts.staking.getNetNodeRewards(
      node1Id,
      previousEpoch,
    );

    await contracts.staking
      .connect(accounts.delegator2)
      .claimDelegatorRewards(
        node1Id,
        previousEpoch,
        accounts.delegator2.address,
      );

    const d2ScorePrev =
      await contracts.randomSamplingStorage.getEpochNodeDelegatorScore(
        previousEpoch,
        node1Id,
        d2Key,
      );
    const d2ExpectedReward = (d2ScorePrev * netRewardsPrev) / nodeScorePrev;

    const d2BaseAfter = await contracts.stakingStorage.getDelegatorStakeBase(
      node1Id,
      d2Key,
    );
    const d2ActualReward = d2BaseAfter - d2BaseBefore;

    console.log(
      `    ✅ D2 staked reward ${ethers.formatUnits(d2ActualReward, 18)} TRAC (expected ${ethers.formatUnits(
        d2ExpectedReward,
        18,
      )})`,
    );
    expect(d2ActualReward).to.equal(d2ExpectedReward);

    /**********************************************************************
     * STEP 9 – Delegator3 attempts withdrawal before claim → revert       *
     **********************************************************************/
    console.log('\n⛔  STEP 9: Delegator3 withdrawal should revert');

    await expect(
      contracts.staking
        .connect(accounts.delegator3)
        .requestWithdrawal(node1Id, ethers.parseUnits('5000', 18)),
    ).to.be.revertedWith(
      'Must claim the previous epoch rewards before changing stake',
    );
    console.log('    ✅ revert received as expected');

    /**********************************************************************
     * STEP 10 – Node1 submits first proof in currentEpoch                *
     **********************************************************************/
    console.log(
      `\n🔬 STEP 10: Node1 submits first proof in epoch ${currentEpoch}`,
    );

    /* move to the next proof-period so the challenge is fresh */
    await advanceToNextProofingPeriod(contracts);

    /* --- BEFORE snapshot ------------------------------------------------ */
    const stakeBeforeProof =
      await contracts.stakingStorage.getNodeStake(node1Id);
    const scoreBeforeProof =
      await contracts.randomSamplingStorage.getNodeEpochScore(
        currentEpoch,
        node1Id,
      );
    const perStakeBefore =
      await contracts.randomSamplingStorage.getNodeEpochScorePerStake(
        currentEpoch,
        node1Id,
      );

    console.log(
      `    ℹ️  before-proof: score=${scoreBeforeProof}, perStake=${perStakeBefore}, stake=${ethers.formatUnits(stakeBeforeProof, 18)} TRAC`,
    );

    /* --- Submit proof & verify internal math --------------------------- */
    await submitProofAndVerifyScore(
      node1Id,
      accounts.node1,
      contracts,
      currentEpoch,
      stakeBeforeProof,
    );

    /* --- AFTER snapshot ------------------------------------------------- */
    const scoreAfterProof =
      await contracts.randomSamplingStorage.getNodeEpochScore(
        currentEpoch,
        node1Id,
      );
    const perStakeAfter =
      await contracts.randomSamplingStorage.getNodeEpochScorePerStake(
        currentEpoch,
        node1Id,
      );

    /* --- Assertions ----------------------------------------------------- */
    expect(scoreAfterProof).to.be.gt(
      scoreBeforeProof,
      'Node epoch score must increase after proof',
    );
    expect(perStakeAfter).to.be.gt(
      perStakeBefore,
      'Score-per-stake must increase after proof',
    );

    console.log(
      `    ✅ score: ${scoreBeforeProof} → ${scoreAfterProof}; ` +
        `perStake: ${perStakeBefore} → ${perStakeAfter}`,
    );

    /**********************************************************************
     * STEP 11 – Delegator 2 requests withdrawal of 10 000 TRAC            *
     **********************************************************************/
    console.log('\n📤 STEP 11: Delegator2 requests withdrawal of 10 000 TRAC');

    /* ---------- BEFORE snapshot -------------------------------------- */
    const d2StakeBaseBefore =
      await contracts.stakingStorage.getDelegatorStakeBase(node1Id, d2Key);
    const nodeStakeBefore =
      await contracts.stakingStorage.getNodeStake(node1Id);

    const scorePerStakeCur =
      await contracts.randomSamplingStorage.getNodeEpochScorePerStake(
        currentEpoch,
        node1Id,
      );
    const d2LastSettledBefore =
      await contracts.randomSamplingStorage.getDelegatorLastSettledNodeEpochScorePerStake(
        currentEpoch,
        node1Id,
        d2Key,
      );
    const d2ScoreBefore =
      await contracts.randomSamplingStorage.getEpochNodeDelegatorScore(
        currentEpoch,
        node1Id,
        d2Key,
      );

    /* how much score should be settled by _prepareForStakeChange() */
    const expectedScoreIncrement = calculateExpectedDelegatorScore(
      d2StakeBaseBefore, // stake before withdrawal
      scorePerStakeCur,
      d2LastSettledBefore,
    );

    /* ---------- perform withdrawal request --------------------------- */
    await contracts.staking
      .connect(accounts.delegator2)
      .requestWithdrawal(node1Id, ethers.parseUnits('10000', 18));

    /* ---------- AFTER snapshot --------------------------------------- */
    const d2StakeBaseAfter =
      await contracts.stakingStorage.getDelegatorStakeBase(node1Id, d2Key);
    const nodeStakeAfter = await contracts.stakingStorage.getNodeStake(node1Id);

    const d2ScoreAfter =
      await contracts.randomSamplingStorage.getEpochNodeDelegatorScore(
        currentEpoch,
        node1Id,
        d2Key,
      );
    const d2LastSettledAfter =
      await contracts.randomSamplingStorage.getDelegatorLastSettledNodeEpochScorePerStake(
        currentEpoch,
        node1Id,
        d2Key,
      );

    const [withdrawAmount] =
      await contracts.stakingStorage.getDelegatorWithdrawalRequest(
        node1Id,
        d2Key,
      );

    /* ---------- Assertions ------------------------------------------- */
    expect(withdrawAmount).to.equal(
      ethers.parseUnits('10000', 18),
      'withdrawal request amount',
    );
    expect(nodeStakeAfter).to.equal(
      nodeStakeBefore - ethers.parseUnits('10000', 18),
      'node total stake should fall by 10 000 TRAC',
    );
    expect(d2StakeBaseAfter).to.equal(
      d2StakeBaseBefore - ethers.parseUnits('10000', 18),
      'delegator base stake should fall by 10 000 TRAC',
    );
    expect(d2ScoreAfter).to.equal(
      d2ScoreBefore + expectedScoreIncrement,
      'delegator score must be lazily settled before stake change',
    );
    expect(d2LastSettledAfter).to.equal(
      scorePerStakeCur,
      'lastSettled index must be bumped to current nodeScorePerStake',
    );

    console.log(
      `    ✅ withdrawal request stored (${ethers.formatUnits(withdrawAmount, 18)} TRAC)`,
    );
    console.log(
      `    ✅ node stake ${ethers.formatUnits(nodeStakeBefore, 18)} → ${ethers.formatUnits(nodeStakeAfter, 18)} TRAC`,
    );
    console.log(
      `    ✅ D2 stakeBase ${ethers.formatUnits(d2StakeBaseBefore, 18)} → ${ethers.formatUnits(d2StakeBaseAfter, 18)} TRAC`,
    );
    console.log(
      `    ✅ D2 epoch-score ${d2ScoreBefore} → ${d2ScoreAfter} (settled +${expectedScoreIncrement})`,
    );

    /**********************************************************************
     * STEP 12 – Node1 submits **second** proof in currentEpoch            *
     **********************************************************************/
    console.log(
      `\n🔬 STEP 12: Node1 submits second proof in epoch ${currentEpoch}`,
    );

    /* ---------------------------------------------------------------
     * 1️⃣  Shift to new proof-period so challenge is valid
     * ------------------------------------------------------------- */
    await advanceToNextProofingPeriod(contracts);

    /* ---------------------------------------------------------------
     * 2️⃣  BEFORE snapshot
     * ------------------------------------------------------------- */
    const nodeStakeBefore12 =
      await contracts.stakingStorage.getNodeStake(node1Id); // ≈ 62 100 TRAC
    const nodeScoreBefore12 =
      await contracts.randomSamplingStorage.getNodeEpochScore(
        currentEpoch,
        node1Id,
      );
    const perStakeBefore12 =
      await contracts.randomSamplingStorage.getNodeEpochScorePerStake(
        currentEpoch,
        node1Id,
      );
    const allNodesScoreBefore12 =
      await contracts.randomSamplingStorage.getAllNodesEpochScore(currentEpoch);

    console.log(
      `    ℹ️  before-proof: nodeScore=${nodeScoreBefore12}, perStake=${perStakeBefore12}, ` +
        `allNodes=${allNodesScoreBefore12}, stake=${ethers.formatUnits(nodeStakeBefore12, 18)} TRAC`,
    );

    /* ---------------------------------------------------------------
     * 3️⃣  Perform proof + builtin math-check
     * ------------------------------------------------------------- */
    await submitProofAndVerifyScore(
      node1Id,
      accounts.node1,
      contracts,
      currentEpoch,
      nodeStakeBefore12,
    );

    /* ---------------------------------------------------------------
     * 4️⃣  AFTER snapshot
     * ------------------------------------------------------------- */
    const nodeStakeAfter12 =
      await contracts.stakingStorage.getNodeStake(node1Id);
    const nodeScoreAfter12 =
      await contracts.randomSamplingStorage.getNodeEpochScore(
        currentEpoch,
        node1Id,
      );
    const perStakeAfter12 =
      await contracts.randomSamplingStorage.getNodeEpochScorePerStake(
        currentEpoch,
        node1Id,
      );
    const allNodesScoreAfter12 =
      await contracts.randomSamplingStorage.getAllNodesEpochScore(currentEpoch);

    /* ---------------------------------------------------------------
     * 5️⃣  Assertions – strict before/after checks
     * ------------------------------------------------------------- */
    expect(nodeStakeAfter12).to.equal(
      nodeStakeBefore12,
      'Node stake must not change when only submitting a proof',
    );

    expect(nodeScoreAfter12).to.be.gt(
      nodeScoreBefore12,
      'Node epoch score must increase after second proof',
    );

    expect(perStakeAfter12).to.be.gt(
      perStakeBefore12,
      'Score-per-stake must increase after second proof',
    );

    expect(allNodesScoreAfter12).to.be.gt(
      allNodesScoreBefore12,
      'Global all-nodes score must increase after proof',
    );

    console.log(
      `    ✅ nodeScore:     ${nodeScoreBefore12} → ${nodeScoreAfter12}\n` +
        `    ✅ scorePerStake: ${perStakeBefore12} → ${perStakeAfter12}\n`,
    );

    /**********************************************************************
     * STEP 13 – Delegator 1 claims rewards for epoch `claimEpoch`
     *          (diagram "Delegator1 claims reward for epoch 2")
     **********************************************************************/

    console.log('\n💰 STEP 13: Delegator1 claims rewards for previous epoch');

    /* ---------------------------------------------------------------
     * 1️⃣  Finalise currentEpoch so rewards become claimable
     *     – we need to be in epoch 3 and claim for epoch 2
     * ------------------------------------------------------------- */
    const timeUntilNextEpoch = await contracts.chronos.timeUntilNextEpoch();
    await time.increase(timeUntilNextEpoch + 1n);

    const epochAfterFinalize = await contracts.chronos.getCurrentEpoch(); // == currentEpoch + 1
    const claimEpoch = epochAfterFinalize - 1n; // epoch we are claiming for

    /* one more dummy KC → triggers epoch finalisation */
    await createKnowledgeCollection(
      accounts.kcCreator,
      accounts.node1,
      Number(node1Id),
      receivingNodes,
      receivingNodesIdentityIds,
      { KnowledgeCollection: contracts.kc, Token: contracts.token },
      merkleRoot,
      'finalise-epoch',
      10, // holders
      1_000, // chunks
      10, // replicas
      toTRAC(50_000), // <-- epoch fee identical to the diagram
    );

    /* epoch really finalised? */
    expect(await contracts.epochStorage.lastFinalizedEpoch(1)).to.be.gte(
      claimEpoch,
      'Epoch must be finalised before claiming',
    );

    /* ---------------------------------------------------------------
     * 2️⃣  BEFORE snapshot – **manual** reward calculation
     * ------------------------------------------------------------- */
    const SCALE18 = ethers.parseUnits('1', 18);

    const d1BaseBefore = await contracts.stakingStorage.getDelegatorStakeBase(
      node1Id,
      d1Key,
    );
    const nodeScore18 = await contracts.randomSamplingStorage.getNodeEpochScore(
      claimEpoch,
      node1Id,
    );
    const perStake36 =
      await contracts.randomSamplingStorage.getNodeEpochScorePerStake(
        claimEpoch,
        node1Id,
      );
    const d1LastSettled36 =
      await contracts.randomSamplingStorage.getDelegatorLastSettledNodeEpochScorePerStake(
        claimEpoch,
        node1Id,
        d1Key,
      );
    const d1StoredScore18 =
      await contracts.randomSamplingStorage.getEpochNodeDelegatorScore(
        claimEpoch,
        node1Id,
        d1Key,
      );

    /* "lazy-settle" delta that _will_ be written inside claim() */
    const d1SettleDiff36 = perStake36 - d1LastSettled36;
    const earnedScore18 = (BigInt(d1BaseBefore) * d1SettleDiff36) / SCALE18;

    /* total score that delegator should have after settle */
    const d1TotalScore18 = d1StoredScore18 + earnedScore18;

    /* net pool for delegators that epoch */
    const netDelegatorRewards13 = await contracts.staking.getNetNodeRewards(
      node1Id,
      claimEpoch,
    );

    /* expected TRAC reward (18 decimals) */
    const expectedReward13 =
      nodeScore18 === 0n
        ? 0n
        : (d1TotalScore18 * netDelegatorRewards13) / nodeScore18;

    console.log(
      `    ℹ️  claimEpoch=${claimEpoch}  nodeScore=${nodeScore18}  ` +
        `d1Score(before)=${d1StoredScore18}  earned=${earnedScore18}  ` +
        `pool=${ethers.formatUnits(netDelegatorRewards13, 18)} TRAC`,
    );
    console.log(
      `    🔢 nodeScore        = ${nodeScore18}`,
      `\n    🔢 d1StoredScore   = ${d1StoredScore18}`,
      `\n    🔢 d1EarnedScore   = ${earnedScore18}`,
    );

    /* ---------------------------------------------------------------
     * 3️⃣  Perform claim
     * ------------------------------------------------------------- */
    await contracts.staking
      .connect(accounts.delegator1)
      .claimDelegatorRewards(node1Id, claimEpoch, accounts.delegator1.address);

    /* ---------------------------------------------------------------
     * 4️⃣  AFTER snapshot
     * ------------------------------------------------------------- */
    const d1BaseAfter = await contracts.stakingStorage.getDelegatorStakeBase(
      node1Id,
      d1Key,
    );
    const nodeStakeAfter13 =
      await contracts.stakingStorage.getNodeStake(node1Id);
    const d1LastClaimed13 = await contracts.delegatorsInfo.getLastClaimedEpoch(
      node1Id,
      accounts.delegator1.address,
    );

    /* ---------------------------------------------------------------
     * 5️⃣  Assertions
     * ------------------------------------------------------------- */
    const actualReward13 = d1BaseAfter - d1BaseBefore;

    expect(actualReward13, 'restaked reward amount').to.equal(expectedReward13);
    expect(d1LastClaimed13, 'lastClaimedEpoch update').to.equal(claimEpoch);
    expect(nodeStakeAfter13).to.equal(
      nodeStakeAfter12 + actualReward13,
      'node total stake must include newly auto-staked reward',
    );
    console.log(
      `    🧮 EXPECTED reward  = ${ethers.formatUnits(expectedReward13, 18)} TRAC`,
      `\n    ✅ ACTUAL reward    = ${ethers.formatUnits(actualReward13, 18)} TRAC`,
    );

    /* nice console output */
    console.log(
      `    ✅ D1 reward ${ethers.formatUnits(actualReward13, 18)} TRAC ` +
        `staked → new base ${ethers.formatUnits(d1BaseAfter, 18)} TRAC`,
    );
    console.log(`    ✅ lastClaimedEpoch set to ${d1LastClaimed13}\n`);

    /**********************************************************************
     * STEP 14 – Delegator 2 claims rewards for epoch `claimEpoch` (= 2)
     **********************************************************************/

    console.log(
      '\n💰 STEP 14: Delegator2 claims rewards for epoch',
      claimEpoch,
    );

    /* ---------------------------------------------------------------
     * 1️⃣  Pre-claim snapshot
     * ------------------------------------------------------------- */
    const d2BaseBefore14 = await contracts.stakingStorage.getDelegatorStakeBase(
      node1Id,
      d2Key,
    );
    const d2LastClaimed14 = await contracts.delegatorsInfo.getLastClaimedEpoch(
      node1Id,
      accounts.delegator2.address,
    );

    // Must be claiming the next unclaimed epoch (1 → 2)
    expect(d2LastClaimed14).to.equal(
      claimEpoch - 1n,
      'Delegator2 is not claiming the oldest pending epoch',
    );

    /* ---------------------------------------------------------------
     * 2️⃣  Manual reward calculation
     * ------------------------------------------------------------- */
    const nodeScoreClaim =
      await contracts.randomSamplingStorage.getNodeEpochScore(
        claimEpoch,
        node1Id,
      );
    const perStakeClaim =
      await contracts.randomSamplingStorage.getNodeEpochScorePerStake(
        claimEpoch,
        node1Id,
      );
    const d2LastSettledClaim =
      await contracts.randomSamplingStorage.getDelegatorLastSettledNodeEpochScorePerStake(
        claimEpoch,
        node1Id,
        d2Key,
      );
    const d2StoredScore =
      await contracts.randomSamplingStorage.getEpochNodeDelegatorScore(
        claimEpoch,
        node1Id,
        d2Key,
      );

    // Lazy-settle part to be added inside claim()
    const d2SettleDiff36 = perStakeClaim - d2LastSettledClaim;
    const d2EarnedScore = (d2BaseBefore14 * d2SettleDiff36) / SCALE18;
    const d2TotalScore18 = d2StoredScore + d2EarnedScore;

    const netDelegatorRewards14 = await contracts.staking.getNetNodeRewards(
      node1Id,
      claimEpoch,
    );

    const expectedReward14 =
      nodeScoreClaim === 0n
        ? 0n
        : (d2TotalScore18 * netDelegatorRewards14) / nodeScoreClaim;

    console.log(
      `    🔢 nodeScore        = ${nodeScoreClaim}`,
      `\n    🔢 d2StoredScore   = ${d2StoredScore}`,
      `\n    🔢 d2EarnedScore   = ${d2EarnedScore}`,
      `pool=${ethers.formatUnits(netDelegatorRewards14, 18)} TRAC`,
    );

    /* ---------------------------------------------------------------
     * 3️⃣  Claim transaction
     * ------------------------------------------------------------- */
    await contracts.staking
      .connect(accounts.delegator2)
      .claimDelegatorRewards(node1Id, claimEpoch, accounts.delegator2.address);

    /* ---------------------------------------------------------------
     * 4️⃣  Post-claim snapshot
     * ------------------------------------------------------------- */
    const d2BaseAfter14 = await contracts.stakingStorage.getDelegatorStakeBase(
      node1Id,
      d2Key,
    );
    const d2LastClaimedAfter =
      await contracts.delegatorsInfo.getLastClaimedEpoch(
        node1Id,
        accounts.delegator2.address,
      );
    const actualReward14 = d2BaseAfter14 - d2BaseBefore14;

    console.log(
      `    🧮 EXPECTED reward  = ${ethers.formatUnits(expectedReward14, 18)} TRAC`,
      `\n    ✅ ACTUAL reward    = ${ethers.formatUnits(actualReward14, 18)} TRAC`,
    );

    /* ---------------------------------------------------------------
     * 5️⃣  Assertions
     * ------------------------------------------------------------- */
    expect(actualReward14, 'staked reward mismatch').to.equal(expectedReward14);
    expect(d2LastClaimedAfter, 'lastClaimedEpoch not updated').to.equal(
      claimEpoch,
    );

    // Node stake should grow by the auto-staked reward
    const nodeStakeAfter14 =
      await contracts.stakingStorage.getNodeStake(node1Id);
    expect(nodeStakeAfter14).to.equal(
      nodeStakeAfter13 + actualReward14,
      'Node total stake did not include Delegator2 reward',
    );

    // Pending withdrawal request must stay untouched
    const [withdrawPending] =
      await contracts.stakingStorage.getDelegatorWithdrawalRequest(
        node1Id,
        d2Key,
      );
    expect(withdrawPending).to.equal(
      ethers.parseUnits('10000', 18),
      'Withdrawal request amount changed after claim',
    );

    console.log(
      `    ✅ D2 reward ${ethers.formatUnits(actualReward14, 18)} TRAC ` +
        `auto-staked → new base ${ethers.formatUnits(d2BaseAfter14, 18)} TRAC`,
    );
    console.log(`    ✅ lastClaimedEpoch set to ${d2LastClaimedAfter}\n`);
    console.log('\n✨ Steps 8-14 completed – ready for next tests ✨\n');
  });

  /******************************************************************************************
   *  Steps 15 – 23 (continue from the chain-state left after Step 14)                       *
   ******************************************************************************************/
  it('Should execute steps 15-23 with detailed score calculations and verification', async function () {
    /* helpers already in scope from previous tests */
    const toTRAC18 = (x: number | string) =>
      ethers.parseUnits(x.toString(), 18);

    const TEN_K = ethers.parseUnits('10000', TOKEN_DECIMALS);

    /**********************************************************************
     * STEP 15 – Delegator 2 finalises withdrawal of 10 000 TRAC
     **********************************************************************/
    console.log('\n📤 STEP 15: Delegator2 finalises withdrawal of 10 000 TRAC');

    /* 1️⃣  Make sure the request exists and the delay has passed */
    const [pending, , releaseTs] =
      await contracts.stakingStorage.getDelegatorWithdrawalRequest(
        node1Id,
        d2Key,
      );

    expect(pending, 'pending amount mismatch').to.equal(TEN_K);

    const now = BigInt(await time.latest());
    if (now < releaseTs) await time.increase(releaseTs - now + 1n);

    /* 2️⃣  Snapshot BEFORE */
    const balBefore = await contracts.token.balanceOf(accounts.delegator2);
    const nodeStakeBefore =
      await contracts.stakingStorage.getNodeStake(node1Id);

    console.log(
      `    🪙 Wallet BEFORE: ${ethers.formatUnits(balBefore, TOKEN_DECIMALS)} TRAC`,
    );

    /* 3️⃣  Finalise */
    await contracts.staking
      .connect(accounts.delegator2)
      .finalizeWithdrawal(node1Id);

    /* 4️⃣  Snapshot AFTER */
    const balAfter = await contracts.token.balanceOf(accounts.delegator2);
    const nodeStakeAfter = await contracts.stakingStorage.getNodeStake(node1Id);
    const [reqAfter] =
      await contracts.stakingStorage.getDelegatorWithdrawalRequest(
        node1Id,
        d2Key,
      );

    /* 5️⃣  Assertions */
    expect(balAfter - balBefore, 'wallet diff').to.equal(TEN_K); // ← BigInt diff
    expect(nodeStakeAfter, 'node stake already reduced in step 11').to.equal(
      nodeStakeBefore,
    );
    expect(reqAfter, 'withdrawal request should be cleared').to.equal(0n);

    console.log(
      `    🪙 Wallet AFTER : ${ethers.formatUnits(balAfter, TOKEN_DECIMALS)} TRAC`,
      `\n    ✅ 10 000 TRAC transferred successfully`,
    );

    /**********************************************************************
     * STEP 16 – Delegator 3 tries to stake extra 5 000 TRAC (must revert) *
     **********************************************************************/
    console.log(
      '\n⛔  STEP 16: Delegator3 attempts to stake 5 000 TRAC – should revert',
    );

    await contracts.token
      .connect(accounts.delegator3)
      .approve(await contracts.staking.getAddress(), toTRAC18(5_000));

    await expect(
      contracts.staking
        .connect(accounts.delegator3)
        .stake(node1Id, toTRAC18(5_000)),
    ).to.be.revertedWith(
      'Must claim all previous epoch rewards before changing stake',
    );

    console.log(
      '    ✅ Revert received as expected – Delegator3 must claim epochs 1 & 2 first',
    );

    /**********************************************************************
     * STEP 17 – Delegator 3 claims rewards for epoch 1
     **********************************************************************/
    console.log('\n💰 STEP 17: Delegator3 claims rewards for epoch 1');

    const claimEpoch17 = 2n; // == 1

    const SCALE18 = ethers.parseUnits('1', 18);

    /* ── 1. Preconditions ────────────────────────────────────────────── */
    const lastClaimedBefore =
      await contracts.delegatorsInfo.getLastClaimedEpoch(
        node1Id,
        accounts.delegator3.address,
      );

    /**
     * 0  – sentinel “never claimed”  (default)
     * n–1 – standard “oldest un-claimed epoch”
     */
    expect(
      lastClaimedBefore === 0n || lastClaimedBefore === claimEpoch17 - 1n,
      'Delegator-3 must claim the oldest pending epoch first',
    ).to.be.true;

    /* ── 2. Manual reward calculation (for assertions) ───────────────── */
    const stakeBaseBefore =
      await contracts.stakingStorage.getDelegatorStakeBase(node1Id, d3Key);

    const nodeScore17 = await contracts.randomSamplingStorage.getNodeEpochScore(
      claimEpoch17,
      node1Id,
    );
    const perStake17 =
      await contracts.randomSamplingStorage.getNodeEpochScorePerStake(
        claimEpoch17,
        node1Id,
      );

    const lastSettled17 =
      await contracts.randomSamplingStorage.getDelegatorLastSettledNodeEpochScorePerStake(
        claimEpoch17,
        node1Id,
        d3Key,
      );
    const storedScore17 =
      await contracts.randomSamplingStorage.getEpochNodeDelegatorScore(
        claimEpoch17,
        node1Id,
        d3Key,
      );

    const earnedScore17 =
      (stakeBaseBefore * (perStake17 - lastSettled17)) / SCALE18;
    const totalScore17 = storedScore17 + earnedScore17;

    const rewardsPool17 = await contracts.staking.getNetNodeRewards(
      node1Id,
      claimEpoch17,
    );

    const expectedReward17 =
      nodeScore17 === 0n ? 0n : (totalScore17 * rewardsPool17) / nodeScore17;

    /* ── 3. Claim transaction ────────────────────────────────────────── */
    await contracts.staking
      .connect(accounts.delegator3)
      .claimDelegatorRewards(
        node1Id,
        claimEpoch17,
        accounts.delegator3.address,
      );

    /* ── 4. Post-claim checks ────────────────────────────────────────── */
    const stakeBaseAfter = await contracts.stakingStorage.getDelegatorStakeBase(
      node1Id,
      d3Key,
    ); // must stay 30 000
    const rollingRewards =
      await contracts.delegatorsInfo.getDelegatorRollingRewards(
        node1Id,
        accounts.delegator3.address,
      );
    const lastClaimedAfter = await contracts.delegatorsInfo.getLastClaimedEpoch(
      node1Id,
      accounts.delegator3.address,
    );

    expect(
      stakeBaseAfter,
      'stakeBase unchanged while older epochs remain',
    ).to.equal(stakeBaseBefore);
    expect(rollingRewards, 'rollingRewards incorrect').to.equal(
      expectedReward17,
    );
    expect(lastClaimedAfter, 'lastClaimedEpoch not updated').to.equal(
      claimEpoch17,
    );

    console.log(
      `    ✅ rollingRewards = ${ethers.formatUnits(rollingRewards, 18)} TRAC`,
      `\n    ✅ lastClaimedEpoch = ${lastClaimedAfter}\n`,
    );
  });
});
