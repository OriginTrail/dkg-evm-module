import { expect } from 'chai';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import hre, { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
// @ts-expect-error: No type definitions available for assertion-tools
import { kcTools } from 'assertion-tools';

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
  ShardingTable,
  ShardingTableStorage,
  IdentityStorage,
  Profile,
  KnowledgeCollection,
  ParanetKnowledgeMinersRegistry,
  ParanetKnowledgeCollectionsRegistry,
  ParanetsRegistry,
  KnowledgeCollectionStorage,
} from '../../typechain';
import { createProfile } from '../helpers/profile-helpers';
import { createKnowledgeCollection } from '../helpers/kc-helpers';

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

describe(`Full complex scenario`, function () {
  it('Should execute the full staking -> proof -> claim -> withdrawal -> redelegate scenario', async function () {
    // ================================================================================================================
    // SETUP
    // ================================================================================================================
    await hre.deployments.fixture(); // Deploy all contracts

    const accounts = await hre.ethers.getSigners();
    const owner = accounts[0];
    const node1Op = accounts[1];
    const node2Op = accounts[2];
    const delegator1 = accounts[3];
    const delegator2 = accounts[4];
    const delegator3 = accounts[5];
    const receiver1Op = accounts[6];
    const receiver2Op = accounts[7];
    const receiver3Op = accounts[8];

    const hub = await hre.ethers.getContract<Hub>('Hub');
    const token = await hre.ethers.getContract<Token>('Token');
    const chronos = await hre.ethers.getContract<Chronos>('Chronos');
    const stakingStorage =
      await hre.ethers.getContract<StakingStorage>('StakingStorage');
    const epochStorage =
      await hre.ethers.getContract<EpochStorage>('EpochStorageV8');
    const parametersStorage =
      await hre.ethers.getContract<ParametersStorage>('ParametersStorage');
    const staking = await hre.ethers.getContract<Staking>('Staking');
    const profile = await hre.ethers.getContract<Profile>('Profile');
    const randomSampling =
      await hre.ethers.getContract<RandomSampling>('RandomSampling');
    const randomSamplingStorage =
      await hre.ethers.getContract<RandomSamplingStorage>(
        'RandomSamplingStorage',
      );
    const kc = await hre.ethers.getContract<KnowledgeCollection>(
      'KnowledgeCollection',
    );

    await hub.setContractAddress('HubOwner', owner.address);
    for (const delegator of [delegator1, delegator2, delegator3]) {
      await token.mint(delegator.address, toTRAC(100_000));
    }
    await token.mint(owner.address, toTRAC(1_000_000));
    await token.mint(node1Op.address, toTRAC(1_000_000));

    const { identityId: node1Id } = await createProfile(profile, {
      operational: node1Op,
      admin: owner,
    });
    const { identityId: node2Id } = await createProfile(profile, {
      operational: node2Op,
      admin: owner,
    });
    await parametersStorage.setMinimumStake(toTRAC(100));

    // Jump to the start of the next clean epoch to begin the scenario
    const timeUntilNextEpoch = await chronos.timeUntilNextEpoch();
    await time.increase(timeUntilNextEpoch + 1n); // +1 second to be safe
    const epoch1 = await chronos.getCurrentEpoch();

    // ================================================================================================================
    // STEPS 1-3: Delegators stake on Node 1
    // ================================================================================================================
    await token
      .connect(node1Op)
      .approve(await staking.getAddress(), toTRAC(100));
    await staking.connect(node1Op).stake(node1Id, toTRAC(100));

    for (const [delegator, amount] of [
      [delegator1, '10000'],
      [delegator2, '20000'],
      [delegator3, '30000'],
    ] as const) {
      await token
        .connect(delegator)
        .approve(await staking.getAddress(), toTRAC(amount));
      await staking.connect(delegator).stake(node1Id, toTRAC(amount));
    }
    expect(await stakingStorage.getNodeStake(node1Id)).to.equal(toTRAC(60100));

    // ================================================================================================================
    // Create a KC to generate rewards
    // ================================================================================================================
    const receivingNodes = [
      { operational: receiver1Op, admin: owner },
      { operational: receiver2Op, admin: owner },
      { operational: receiver3Op, admin: owner },
    ];
    const receivingNodesIdentityIds = [];
    for (const recNode of receivingNodes) {
      const { identityId } = await createProfile(profile, recNode);
      receivingNodesIdentityIds.push(identityId);
    }
    await createKnowledgeCollection(
      owner,
      { operational: node1Op, admin: owner },
      Number(node1Id),
      receivingNodes,
      receivingNodesIdentityIds,
      { KnowledgeCollection: kc, Token: token },
      merkleRoot,
      'test-op-id',
      10,
      1000,
      10, // long duration
      toTRAC(1000), // high fee for rewards
    );

    // ================================================================================================================
    // STEP 4 & 6: Node 1 submits two proofs in Epoch 1
    // ================================================================================================================
    // Update proof period before creating challenge
    await randomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();

    // Proof 1
    await randomSampling.connect(node1Op).createChallenge();
    let challenge = await randomSamplingStorage.getNodeChallenge(node1Id);
    console.log(challenge);
    let chunks = kcTools.splitIntoChunks(quads, 32);
    const chunkId = Number(challenge[1]); // chunkId is at index 1
    const { proof } = kcTools.calculateMerkleProof(quads, 32, chunkId);
    await randomSampling.connect(node1Op).submitProof(chunks[chunkId], proof);
    const scoreAfter1 = await randomSamplingStorage.getNodeEpochScore(
      epoch1,
      node1Id,
    );
    expect(scoreAfter1).to.be.gt(0);

    // Advance proofing period
    const proofingPeriod =
      await randomSamplingStorage.getActiveProofingPeriodDurationInBlocks();
    for (let i = 0; i < Number(proofingPeriod); i++) {
      await time.increase(1);
    }

    // ================================================================================================================
    // STEP 5: Delegator 1 adds more stake
    // ================================================================================================================
    await token
      .connect(delegator1)
      .approve(await staking.getAddress(), toTRAC('10000'));
    await staking.connect(delegator1).stake(node1Id, toTRAC('10000'));
    expect(await stakingStorage.getNodeStake(node1Id)).to.equal(toTRAC(70100));

    // Advance proofing period before creating a new challenge by mining blocks
    const proofingPeriod2 =
      await randomSamplingStorage.getActiveProofingPeriodDurationInBlocks();
    for (let i = 0; i < Number(proofingPeriod2); i++) {
      await hre.network.provider.send('evm_mine');
    }

    // Proof 2
    await randomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
    await randomSampling.connect(node1Op).createChallenge();
    challenge = await randomSamplingStorage.getNodeChallenge(node1Id);
    chunks = kcTools.splitIntoChunks(quads, 32);
    const chunkId2 = Number(challenge[1]); // chunkId is at index 1
    const { proof: proof2 } = kcTools.calculateMerkleProof(quads, 32, chunkId2);
    await randomSampling.connect(node1Op).submitProof(chunks[chunkId2], proof2);
    const scoreAfter2 = await randomSamplingStorage.getNodeEpochScore(
      epoch1,
      node1Id,
    );
    expect(scoreAfter2).to.be.gt(scoreAfter1);

    // ================================================================================================================
    // STEP 7, 8, 9: Advance epoch, claim rewards
    // ================================================================================================================
    const epochLength = await chronos.epochLength();
    await time.increase(epochLength * 2n); // Advance to epoch 3 to finalize epoch 1
    const epoch2 = epoch1 + 1n;

    await createKnowledgeCollection(
      owner,
      { operational: node1Op, admin: owner },
      Number(node1Id),
      [],
      [],
      { KnowledgeCollection: kc, Token: token },
      merkleRoot,
      'dummy-op-id-2',
    );
    expect(await epochStorage.lastFinalizedEpoch(1)).to.be.gte(epoch1);

    // D1 & D2 claim epoch 1 rewards
    await staking
      .connect(delegator1)
      .claimDelegatorRewards(node1Id, epoch1, delegator1.address);
    await staking
      .connect(delegator2)
      .claimDelegatorRewards(node1Id, epoch1, delegator2.address);

    // D3 tries withdrawal -> should revert
    await expect(
      staking.connect(delegator3).requestWithdrawal(node1Id, toTRAC('5000')),
    ).to.be.revertedWith(
      'Must claim all previous epoch rewards before changing stake',
    );

    // ================================================================================================================
    // STEP 10-15: Subsequent epoch operations
    // ================================================================================================================
    // Proof in epoch 2
    await randomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
    await randomSampling.connect(node1Op).createChallenge();
    challenge = await randomSamplingStorage.getNodeChallenge(node1Id);
    chunks = kcTools.splitIntoChunks(quads, 32);
    const chunkId3 = Number(challenge[1]); // chunkId is at index 1
    const { proof: proof3 } = kcTools.calculateMerkleProof(quads, 32, chunkId3);
    await randomSampling.connect(node1Op).submitProof(chunks[chunkId3], proof3);

    // D2 requests withdrawal
    await staking
      .connect(delegator2)
      .requestWithdrawal(node1Id, toTRAC('10000'));

    // Advance, finalize, claim, withdraw
    await time.increase(epochLength * 2n); // Advance to epoch 5 to finalize epoch 2 & 3
    const epoch3 = epoch2 + 1n;

    await createKnowledgeCollection(
      owner,
      { operational: node1Op, admin: owner },
      Number(node1Id),
      [],
      [],
      { KnowledgeCollection: kc, Token: token },
      merkleRoot,
      'dummy-op-id-3',
    );

    await staking
      .connect(delegator1)
      .claimDelegatorRewards(node1Id, epoch2, delegator1.address);
    await staking
      .connect(delegator2)
      .claimDelegatorRewards(node1Id, epoch2, delegator2.address);

    await time.increase(await parametersStorage.stakeWithdrawalDelay());
    const d2BalanceBefore = await token.balanceOf(delegator2.address);
    await staking.connect(delegator2).finalizeWithdrawal(node1Id);
    const d2BalanceAfter = await token.balanceOf(delegator2.address);
    expect(d2BalanceAfter).to.be.closeTo(d2BalanceBefore + toTRAC('10000'), 1);

    // ================================================================================================================
    // STEP 16-23: Multi-epoch claims, withdrawal, redelegation
    // ================================================================================================================

    // D3 tries to stake -> reverts (unclaimed E1, E2)
    await expect(
      staking.connect(delegator3).stake(node1Id, toTRAC('5000')),
    ).to.be.revertedWith(
      'Must claim all previous epoch rewards before changing stake',
    );

    // D3 claims for E1, then E2 (E1 already claimed, but claim is idempotent)
    await staking
      .connect(delegator3)
      .claimDelegatorRewards(node1Id, epoch1, delegator3.address);
    await staking
      .connect(delegator3)
      .claimDelegatorRewards(node1Id, epoch2, delegator3.address);

    // D3 requests & finalizes withdrawal
    await staking
      .connect(delegator3)
      .requestWithdrawal(node1Id, toTRAC('5000'));
    await time.increase(await parametersStorage.stakeWithdrawalDelay());
    await staking.connect(delegator3).finalizeWithdrawal(node1Id);

    // D1 redelegates 5k from Node1 to Node2
    await staking
      .connect(delegator1)
      .claimDelegatorRewards(node1Id, epoch3, delegator1.address);
    await staking
      .connect(delegator1)
      .redelegate(node1Id, BigInt(node2Id), toTRAC('5000'));

    // D1 tries to stake on Node1 in new epoch without claiming -> revert
    await time.increase(epochLength); // Enter new epoch
    const epoch4 = await chronos.getCurrentEpoch();
    await expect(
      staking.connect(delegator1).stake(node1Id, toTRAC('1000')),
    ).to.be.revertedWith(
      'Must claim all previous epoch rewards before changing stake',
    );
  });
});
