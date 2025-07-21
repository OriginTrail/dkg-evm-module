import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre from 'hardhat';

import type { Hub } from '../../typechain';

/**
 * Integration-level test for DelegatorRewardsMigrator.
 * Exercises full happy-path plus a couple of failure cases.
 */

describe('@integration DelegatorRewardsMigrator', () => {
  let accounts: SignerWithAddress[];
  let hub: Hub;
  let rewardsStorage: any;
  let stakingStorage: any;
  let migrator: any;

  async function deployFixture() {
    // Deploy core storages & helpers via existing tags
    await hre.deployments.fixture([
      'Hub',
      'StakingStorage',
      'ParametersStorage',
      'ShardingTableStorage',
      'ShardingTable',
      'Ask',
      'DelegatorsInfo',
      'RandomSampling',
      'RandomSamplingStorage',
      'Chronos',
    ]);

    accounts = await hre.ethers.getSigners();
    hub = await hre.ethers.getContract<Hub>('Hub');
    await hub.setContractAddress('HubOwner', accounts[0].address);

    // Deploy reward storage and register
    const RSFactory = await hre.ethers.getContractFactory(
      'V8_1_1_Rewards_Migrator_Storage',
    );
    rewardsStorage = await RSFactory.deploy(await hub.getAddress());
    await hub.setContractAddress(
      'V8_1_1_Rewards_Migrator_Storage',
      rewardsStorage.getAddress(),
    );

    // Grab already deployed storages we care about
    stakingStorage = await hre.ethers.getContract('StakingStorage');

    // Deploy migrator and register
    const MigrFactory = await hre.ethers.getContractFactory(
      'DelegatorRewardsMigrator',
    );
    migrator = await MigrFactory.deploy(await hub.getAddress());
    await hub.setContractAddress(
      'DelegatorRewardsMigrator',
      migrator.getAddress(),
    );

    // Call initialize via Hub so onlyHub passes
    const initData = migrator.interface.encodeFunctionData('initialize');
    await hub.forwardCall(await migrator.getAddress(), initData);

    return { hub, rewardsStorage, stakingStorage, migrator };
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ hub, rewardsStorage, stakingStorage, migrator } =
      await loadFixture(deployFixture));
  });

  it('happy-path: delegator restakes reward', async () => {
    const delegator = accounts[1];
    const identityId = 1;
    const reward = 10_000n * 10n ** 18n; // 10k TRAC in wei

    // Governance pre-populates reward
    await rewardsStorage.setDelegatorReward(
      identityId,
      delegator.address,
      reward,
    );

    // Call migrator from delegator
    await migrator.increaseDelegatorStakeBase(identityId, delegator.address);

    // Rewards storage marked as claimed
    const [amount, claimed] = await rewardsStorage.getReward(
      identityId,
      delegator.address,
    );
    expect(amount).to.equal(reward);
    expect(claimed).to.be.true;

    // Staking storage updated
    const stakeBase = await stakingStorage.getDelegatorStakeBase(
      identityId,
      hre.ethers.keccak256(
        hre.ethers.solidityPacked(['address'], [delegator.address]),
      ),
    );
    expect(stakeBase).to.equal(reward);

    const nodeStake = await stakingStorage.getNodeStake(identityId);
    expect(nodeStake).to.equal(reward);
  });

  it('reverts when reward already claimed', async () => {
    const identityId = 2;
    const delegator = accounts[2];
    await rewardsStorage.setDelegatorReward(identityId, delegator.address, 1n);
    await migrator.increaseDelegatorStakeBase(identityId, delegator.address);

    await expect(
      migrator.increaseDelegatorStakeBase(identityId, delegator.address),
    ).to.be.revertedWith('Already claimed');
  });

  it('reverts when no reward exists', async () => {
    await expect(
      migrator.increaseDelegatorStakeBase(999, accounts[3].address),
    ).to.be.revertedWith('No reward');
  });
});
