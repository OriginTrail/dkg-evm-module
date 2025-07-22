import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre from 'hardhat';
import { ethers } from 'ethers';

import { Hub, Token, Profile, Staking, StakingStorage } from '../../typechain';
import { createProfile } from '../helpers/profile-helpers';
import { NodeAccounts } from '../helpers/types';

const toTRAC = (x: string | number) => ethers.parseUnits(x.toString(), 18);

describe('@integration DelegatorRewardsMigrator – full scenario', () => {
  /* -------------------------------------------------------------------------- */
  /*                             Fixture deployment                             */
  /* -------------------------------------------------------------------------- */

  async function deployFixture() {
    await hre.deployments.fixture([
      'Hub',
      'Token',
      'Profile',
      'ProfileStorage',
      'Ask',
      'AskStorage',
      'Staking',
      'StakingStorage',
      'ParametersStorage',
      'DelegatorsInfo',
      'Chronos',
      'RandomSamplingStorage',
      'RandomSampling',
      'ShardingTable',
      'ShardingTableStorage',
    ]);

    const accounts = await hre.ethers.getSigners();
    const hub = await hre.ethers.getContract<Hub>('Hub');
    await hub.setContractAddress('HubOwner', accounts[0].address);

    const token = await hre.ethers.getContract<Token>('Token');
    const profile = await hre.ethers.getContract<Profile>('Profile');
    const staking = await hre.ethers.getContract<Staking>('Staking');
    const stakingStorage =
      await hre.ethers.getContract<StakingStorage>('StakingStorage');

    // -------------------------------- nodes ---------------------------------
    const node1Acc: NodeAccounts = {
      admin: accounts[1],
      operational: accounts[2],
    };
    const node2Acc: NodeAccounts = {
      admin: accounts[3],
      operational: accounts[4],
    };

    const { identityId: node1Id } = await createProfile(profile, node1Acc);
    const { identityId: node2Id } = await createProfile(profile, node2Acc);

    // set ask (required by staking rules)
    await profile.connect(node1Acc.admin).updateAsk(node1Id, 100n);
    await profile.connect(node2Acc.admin).updateAsk(node2Id, 150n);

    // ----------------------------- delegators --------------------------------
    const delegators = accounts.slice(5, 13); // 8 delegators
    const delegatorInfo: Array<{
      addr: string;
      nodeId: number;
      stake: bigint;
    }> = [];

    // first 4 delegators stake on node1, next 4 on node2
    for (let i = 0; i < delegators.length; i++) {
      const delegator = delegators[i];
      const nodeId = i < 4 ? node1Id : node2Id;
      const stakeTRAC = 60_000 + i * 1000; // slightly different stake per delegator
      const stake = toTRAC(stakeTRAC);

      await token.mint(delegator.address, stake);
      await token.connect(delegator).approve(staking.getAddress(), stake);
      console.log(
        `Initial stake: Delegator ${delegator.address} staking ${ethers.formatUnits(stake, 18)} TRAC on node ${nodeId}`,
      );
      await staking.connect(delegator).stake(nodeId, stake);

      delegatorInfo.push({ addr: delegator.address, nodeId, stake });
    }

    // ---------------- Rewards storage & migrator ---------------------------
    const RSFactory = await hre.ethers.getContractFactory(
      'V8_1_1_Rewards_Migrator_Storage',
    );
    const rewardsStorage = await RSFactory.deploy(await hub.getAddress());
    await hub.setContractAddress(
      'V8_1_1_Rewards_Migrator_Storage',
      rewardsStorage.getAddress(),
    );

    const MigrFactory = await hre.ethers.getContractFactory(
      'DelegatorRewardsMigrator',
    );
    const migrator = await MigrFactory.deploy(await hub.getAddress());
    await hub.setContractAddress(
      'DelegatorRewardsMigrator',
      migrator.getAddress(),
    );

    const initData = migrator.interface.encodeFunctionData('initialize');
    await hub.forwardCall(await migrator.getAddress(), initData);

    // ----------------- populate rewards (individual & batch) ---------------
    // node1: individual setter
    for (let i = 0; i < 4; i++) {
      const info = delegatorInfo[i];
      await rewardsStorage.setDelegatorReward(
        info.nodeId,
        info.addr,
        toTRAC(5_000),
      );
    }

    // node2: batch setter
    const node2Delegators = delegatorInfo.slice(4);
    const addresses = node2Delegators.map((d) => d.addr);
    const amounts = node2Delegators.map(() => toTRAC(7_500));
    await rewardsStorage.setDelegatorsRewards(node2Id, addresses, amounts);

    return {
      accounts,
      hub,
      token,
      staking,
      stakingStorage,
      rewardsStorage,
      migrator,
      node1Id,
      node2Id,
      delegatorInfo,
    } as const;
  }

  /* -------------------------------------------------------------------------- */
  /*                               Happy-path test                              */
  /* -------------------------------------------------------------------------- */

  it('delegators restake rewards and node stake increases accordingly', async () => {
    const { stakingStorage, migrator, rewardsStorage, delegatorInfo } =
      await loadFixture(deployFixture);

    // snapshot initial node stakes
    const initialNodeStake: Record<number, bigint> = {} as any;
    for (const d of delegatorInfo) {
      if (initialNodeStake[d.nodeId] === undefined) {
        initialNodeStake[d.nodeId] = await stakingStorage.getNodeStake(
          d.nodeId,
        );
      }
    }

    // each delegator restakes reward
    for (const d of delegatorInfo) {
      const before = await stakingStorage.getDelegatorStakeBase(
        d.nodeId,
        hre.ethers.keccak256(hre.ethers.solidityPacked(['address'], [d.addr])),
      );

      await migrator.increaseDelegatorStakeBase(d.nodeId, d.addr);

      const after = await stakingStorage.getDelegatorStakeBase(
        d.nodeId,
        hre.ethers.keccak256(hre.ethers.solidityPacked(['address'], [d.addr])),
      );
      console.log(
        `Delegator ${d.addr} node ${d.nodeId} stake before ${ethers.formatUnits(before, 18)} TRAC -> after ${ethers.formatUnits(after, 18)} TRAC`,
      );
      const [, claimed] = await rewardsStorage.getReward(d.nodeId, d.addr);
      expect(claimed).to.be.true;
    }

    // verify node stakes increased by total rewards
    const totalRewardsPerNode: Record<number, bigint> = {} as any;
    delegatorInfo.forEach((d, idx) => {
      const reward = idx < 4 ? toTRAC(5_000) : toTRAC(7_500);
      totalRewardsPerNode[d.nodeId] =
        (totalRewardsPerNode[d.nodeId] || 0n) + reward;
    });

    for (const nodeIdStr of Object.keys(totalRewardsPerNode)) {
      const nodeId = Number(nodeIdStr);
      const finalStake = await stakingStorage.getNodeStake(nodeId);
      expect(finalStake).to.equal(
        initialNodeStake[nodeId] + totalRewardsPerNode[nodeId],
      );
    }
  });

  /* -------------------------------------------------------------------------- */
  /*                           Negative / edge-cases                            */
  /* -------------------------------------------------------------------------- */

  it('reverts on second restake attempt', async () => {
    const { migrator, delegatorInfo } = await loadFixture(deployFixture);
    const d = delegatorInfo[0];
    await migrator.increaseDelegatorStakeBase(d.nodeId, d.addr);
    await expect(
      migrator.increaseDelegatorStakeBase(d.nodeId, d.addr),
    ).to.be.revertedWith('Already claimed');
  });

  it('reverts when delegator has no reward entry', async () => {
    const { migrator, node1Id, accounts } = await loadFixture(deployFixture);
    await expect(
      migrator.increaseDelegatorStakeBase(node1Id, accounts[15].address),
    ).to.be.revertedWith('No reward');
  });
});
