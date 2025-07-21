import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre from 'hardhat';

import { Hub } from '../../typechain';
import type { Contract } from 'ethers';

type RewardsMigratorStorageFixture = {
  accounts: SignerWithAddress[];
  Hub: Hub;
  RewardsStorage: any;
};

describe('@unit V8_1_1_Rewards_Migrator_Storage', () => {
  let accounts: SignerWithAddress[];
  let Hub: Hub;
  let RewardsStorage: any;

  async function deployRewardsStorageFixture(): Promise<RewardsMigratorStorageFixture> {
    // Deploy Hub first (fixture already exists)
    await hre.deployments.fixture(['Hub'], {
      keepExistingDeployments: false,
    });

    Hub = await hre.ethers.getContract<Hub>('Hub');
    accounts = await hre.ethers.getSigners();

    // Deploy the storage contract with Hub address
    const factory = await hre.ethers.getContractFactory(
      'V8_1_1_Rewards_Migrator_Storage',
    );
    RewardsStorage = (await factory.deploy(await Hub.getAddress())) as any;
    await RewardsStorage.initialize(); // onlyHub => Hub owner (accounts[0])

    return { accounts, Hub, RewardsStorage };
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ accounts, Hub, RewardsStorage } = await loadFixture(
      deployRewardsStorageFixture,
    ));
  });

  /* -------------------------------------------------------------------------- */
  /*                                  getters                                   */
  /* -------------------------------------------------------------------------- */

  it('Should return correct name and version', async () => {
    expect(await RewardsStorage.name()).to.equal(
      'V8_1_1_Rewards_Migrator_Storage',
    );
    expect(await RewardsStorage.version()).to.equal('1.0.0');
  });

  /* -------------------------------------------------------------------------- */
  /*                             set / get rewards                              */
  /* -------------------------------------------------------------------------- */

  it('Should set and get a single delegator reward', async () => {
    const identityId = 1;
    const delegator = accounts[1].address;
    const amount = 1000n;

    await RewardsStorage.setDelegatorReward(identityId, delegator, amount);

    const [storedAmount, claimed] = await RewardsStorage.getReward(
      identityId,
      delegator,
    );

    expect(storedAmount).to.equal(amount);
    expect(claimed).to.be.false;
    expect(await RewardsStorage.hasReward(identityId, delegator)).to.be.true;
  });

  it('Should set rewards for multiple delegators via setDelegatorsRewards', async () => {
    const identityId = 2;
    const delegators = [accounts[1].address, accounts[2].address];
    const amounts = [500n, 1500n];

    await RewardsStorage.setDelegatorsRewards(identityId, delegators, amounts);

    for (let i = 0; i < delegators.length; i++) {
      const [storedAmount] = await RewardsStorage.getReward(
        identityId,
        delegators[i],
      );
      expect(storedAmount).to.equal(amounts[i]);
      expect(await RewardsStorage.hasReward(identityId, delegators[i])).to.be
        .true;
    }
  });

  /* -------------------------------------------------------------------------- */
  /*                              mark as claimed                               */
  /* -------------------------------------------------------------------------- */

  it('Should mark reward as claimed', async () => {
    const identityId = 3;
    const delegator = accounts[3].address;
    const amount = 2500n;

    await RewardsStorage.setDelegatorReward(identityId, delegator, amount);
    await RewardsStorage.markClaimed(identityId, delegator);

    const [, claimed] = await RewardsStorage.getReward(identityId, delegator);
    expect(claimed).to.be.true;
  });

  it('Should revert when marking already claimed reward', async () => {
    const identityId = 4;
    const delegator = accounts[4].address;
    const amount = 3000n;

    await RewardsStorage.setDelegatorReward(identityId, delegator, amount);
    await RewardsStorage.markClaimed(identityId, delegator);

    await expect(
      RewardsStorage.markClaimed(identityId, delegator),
    ).to.be.revertedWith('Already claimed');
  });

  it('Should revert when marking non-existing reward', async () => {
    await expect(
      RewardsStorage.markClaimed(99, accounts[5].address),
    ).to.be.revertedWith('Reward not found');
  });

  /* -------------------------------------------------------------------------- */
  /*                                edge cases                                  */
  /* -------------------------------------------------------------------------- */

  it('Should revert when setting zero amount', async () => {
    await expect(
      RewardsStorage.setDelegatorReward(1, accounts[1].address, 0),
    ).to.be.revertedWith('Zero amount');
  });

  it('Should revert on length mismatch in setDelegatorsRewards', async () => {
    await expect(
      RewardsStorage.setDelegatorsRewards(
        1,
        [accounts[1].address],
        [100n, 200n],
      ),
    ).to.be.revertedWith('Length mismatch');
  });

  /* -------------------------------------------------------------------------- */
  /*                              access control                                */
  /* -------------------------------------------------------------------------- */

  it('Should revert when non-hub / non-owner tries to set reward', async () => {
    await expect(
      RewardsStorage.connect(accounts[1]).setDelegatorReward(
        1,
        accounts[1].address,
        100n,
      ),
    ).to.be.revertedWithCustomError(RewardsStorage, 'UnauthorizedAccess');
  });

  /* -------------------------------------------------------------------------- */
  /*                       additional QA-coverage tests                         */
  /* -------------------------------------------------------------------------- */

  it('hasReward should toggle from false ➜ true after setting reward', async () => {
    const identityId = 10;
    const delegator = accounts[6].address;

    expect(await RewardsStorage.hasReward(identityId, delegator)).to.be.false;

    await RewardsStorage.setDelegatorReward(identityId, delegator, 777n);

    expect(await RewardsStorage.hasReward(identityId, delegator)).to.be.true;
  });

  it('Should overwrite existing reward when setDelegatorReward called twice', async () => {
    const identityId = 11;
    const delegator = accounts[7].address;

    await RewardsStorage.setDelegatorReward(identityId, delegator, 123n);
    await RewardsStorage.setDelegatorReward(identityId, delegator, 999n);

    const [amount, claimed] = await RewardsStorage.getReward(
      identityId,
      delegator,
    );
    expect(amount).to.equal(999n);
    expect(claimed).to.be.false;
  });

  it('Batch setter should revert if any amount is zero', async () => {
    const identityId = 12;
    const delegators = [accounts[1].address, accounts[2].address];
    const amounts = [0n, 100n];

    await expect(
      RewardsStorage.setDelegatorsRewards(identityId, delegators, amounts),
    ).to.be.revertedWith('Zero amount');
  });

  it('Should revert markClaimed when caller is not hub/contract/owner', async () => {
    const identityId = 13;
    const delegator = accounts[8].address;
    await RewardsStorage.setDelegatorReward(identityId, delegator, 50n);

    await expect(
      RewardsStorage.connect(accounts[8]).markClaimed(identityId, delegator),
    ).to.be.revertedWithCustomError(RewardsStorage, 'UnauthorizedAccess');
  });
});
