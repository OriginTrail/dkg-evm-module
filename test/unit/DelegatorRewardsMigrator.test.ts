import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre from 'hardhat';
import type { Contract } from 'ethers';

import type { Hub } from '../../typechain';

/**
 * Minimal unit-level checks for DelegatorRewardsMigrator.
 * Covers:
 *  • name() / version()
 *  • initialize() succeeds only when called by Hub and correctly sets references
 *  • initialize() reverts when called by random EOA
 */

describe('@unit DelegatorRewardsMigrator', () => {
  let accounts: SignerWithAddress[];
  let hub: Hub;
  let migrator: any;
  const dummyAddr: Record<string, string> = {} as any;

  async function deployFixture() {
    await hre.deployments.fixture(['Hub'], { keepExistingDeployments: false });
    accounts = await hre.ethers.getSigners();
    hub = await hre.ethers.getContract<Hub>('Hub');

    const DummyFactory = await hre.ethers.getContractFactory('Hub'); // placeholder

    // map each required name to its own dummy contract address to avoid AddressAlreadyInSet revert
    const names = [
      'V8_1_1_Rewards_Migrator_Storage',
      'StakingStorage',
      'ShardingTableStorage',
      'ShardingTable',
      'ParametersStorage',
      'Ask',
      'DelegatorsInfo',
      'RandomSamplingStorage',
      'Chronos',
    ];
    for (const n of names) {
      const d = (await DummyFactory.deploy()) as any;
      dummyAddr[n] = await d.getAddress();
      await hub.setContractAddress(n, dummyAddr[n]);
    }

    // deploy migrator with hub address
    const MigratorFactory = await hre.ethers.getContractFactory(
      'DelegatorRewardsMigrator',
    );
    migrator = (await MigratorFactory.deploy(await hub.getAddress())) as any;

    // register migrator so Hub.forwardCall accepts it
    await hub.setContractAddress(
      'DelegatorRewardsMigrator',
      await migrator.getAddress(),
    );

    return { hub, migrator };
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ hub, migrator } = await loadFixture(deployFixture));
  });

  it('returns correct name and version', async () => {
    expect(await migrator.name()).to.equal('DelegatorRewardsMigrator');
    expect(await migrator.version()).to.equal('1.0.0');
  });

  it('initialize sets internal references when called by Hub', async () => {
    // call via Hub forwardCall to satisfy onlyHub
    const data = migrator.interface.encodeFunctionData('initialize');
    await hub.forwardCall(await migrator.getAddress(), data);

    expect(await migrator.rewardsStorage()).to.equal(
      dummyAddr['V8_1_1_Rewards_Migrator_Storage'],
    );
    expect(await migrator.stakingStorage()).to.equal(
      dummyAddr['StakingStorage'],
    );
  });

  it('initialize reverts when called by EOA', async () => {
    await expect(
      migrator.connect(accounts[2]).initialize(),
    ).to.be.revertedWithCustomError(migrator, 'UnauthorizedAccess');
  });
});
