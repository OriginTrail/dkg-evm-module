import { randomBytes } from 'crypto';

import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre, { ethers } from 'hardhat';

import {
  Token,
  Profile,
  StakingStorage,
  ParametersStorage,
  ProfileStorage,
  ShardingTable,
  ShardingTableStorage,
  AskStorage,
  Hub,
  Staking,
  DelegatorsInfo,
} from '../../typechain';

type StakingFixture = {
  accounts: SignerWithAddress[];
  Token: Token;
  Profile: Profile;
  Staking: Staking;
  StakingStorage: StakingStorage;
  ShardingTableStorage: ShardingTableStorage;
  ShardingTable: ShardingTable;
  ParametersStorage: ParametersStorage;
  ProfileStorage: ProfileStorage;
  AskStorage: AskStorage;
  Hub: Hub;
  DelegatorsInfo: DelegatorsInfo;
};

async function deployStakingFixture(): Promise<StakingFixture> {
  await hre.deployments.fixture(['Profile', 'Staking']);
  const Staking = await hre.ethers.getContract<Staking>('Staking');
  const Profile = await hre.ethers.getContract<Profile>('Profile');
  const Token = await hre.ethers.getContract<Token>('Token');
  const StakingStorage =
    await hre.ethers.getContract<StakingStorage>('StakingStorage');
  const ShardingTableStorage =
    await hre.ethers.getContract<ShardingTableStorage>('ShardingTableStorage');
  const ShardingTable =
    await hre.ethers.getContract<ShardingTable>('ShardingTable');
  const ParametersStorage =
    await hre.ethers.getContract<ParametersStorage>('ParametersStorage');
  const ProfileStorage =
    await hre.ethers.getContract<ProfileStorage>('ProfileStorage');
  const AskStorage = await hre.ethers.getContract<AskStorage>('AskStorage');
  const Hub = await hre.ethers.getContract<Hub>('Hub');
  const DelegatorsInfo =
    await hre.ethers.getContract<DelegatorsInfo>('DelegatorsInfo');
  const accounts = await hre.ethers.getSigners();

  await Hub.setContractAddress('HubOwner', accounts[0].address);

  return {
    accounts,
    Token,
    Profile,
    Staking,
    StakingStorage,
    ShardingTableStorage,
    ShardingTable,
    ParametersStorage,
    ProfileStorage,
    AskStorage,
    Hub,
    DelegatorsInfo,
  };
}

describe('DelegatorsInfo contract', function() {
  let accounts: SignerWithAddress[];
  // let Token: Token;
  let Profile: Profile;
  // let Staking: Staking;
  // let StakingStorage: StakingStorage;
  // let ShardingTableStorage: ShardingTableStorage;
  // let ParametersStorage: ParametersStorage;
  // let ProfileStorage: ProfileStorage;
  let DelegatorsInfo: DelegatorsInfo;
  const createProfile = async (
    admin?: SignerWithAddress,
    operational?: SignerWithAddress,
    initialOperatorFee?: bigint,
  ) => {
    const node = '0x' + randomBytes(32).toString('hex');
    const tx = await Profile.connect(operational ?? accounts[1]).createProfile(
      admin ? admin.address : accounts[0],
      [],
      `Node ${Math.floor(Math.random() * 1000)}`,
      node,
      (initialOperatorFee ?? 0n) * 100n,
    );
    const receipt = await tx.wait();
    const identityId = Number(receipt?.logs[0].topics[1]);
    return { nodeId: node, identityId };
  };

  beforeEach(async () => {
    ({
      accounts,
      // Token,
      Profile,
      // Staking,
      // StakingStorage,
      // ShardingTableStorage,
      // ParametersStorage,
      // ProfileStorage,
      DelegatorsInfo,
    } = await loadFixture(deployStakingFixture));
  });

  it('Should have correct name and version', async () => {
    expect(await DelegatorsInfo.name()).to.equal('DelegatorsInfo');
    expect(await DelegatorsInfo.version()).to.equal('1.0.0');
  });

  it('Should add delegator', async () => {
    const { identityId } = await createProfile();
    await DelegatorsInfo.addDelegator(identityId, accounts[1].address);
    const isDelegator = await DelegatorsInfo.isNodeDelegator(
      identityId,
      accounts[1].address,
    );
    expect(isDelegator).to.equal(true);
  });

  it('Should remove delegator', async () => {
    const { identityId } = await createProfile();
    await DelegatorsInfo.addDelegator(identityId, accounts[1].address);
    await DelegatorsInfo.removeDelegator(identityId, accounts[1].address);
    const isDelegator = await DelegatorsInfo.isNodeDelegator(
      identityId,
      accounts[1].address,
    );
    expect(isDelegator).to.equal(false);
    const nodeDelegators = await DelegatorsInfo.getDelegators(identityId);
    expect(nodeDelegators.length).to.equal(0);
  });
  it('Should remove delegator from end of array', async () => {
    const { identityId } = await createProfile();
    await DelegatorsInfo.addDelegator(identityId, accounts[1].address);
    await DelegatorsInfo.addDelegator(identityId, accounts[2].address);
    await DelegatorsInfo.removeDelegator(identityId, accounts[2].address);
    const isDelegator = await DelegatorsInfo.isNodeDelegator(
      identityId,
      accounts[2].address,
    );
    expect(isDelegator).to.equal(false);
    const nodeDelegators = await DelegatorsInfo.getDelegators(identityId);
    expect(nodeDelegators.length).to.equal(1);
    expect(nodeDelegators[0]).to.equal(accounts[1].address);
    const removedDelegatorIndex = await DelegatorsInfo.getDelegatorIndex(
      identityId,
      accounts[2].address,
    );
    expect(removedDelegatorIndex).to.equal(0);
    const keptDelegatorIndex = await DelegatorsInfo.getDelegatorIndex(
      identityId,
      accounts[1].address,
    );
    expect(keptDelegatorIndex).to.equal(0);
  });
  it('Should remove delegator from middle of array', async () => {
    const { identityId } = await createProfile();
    await DelegatorsInfo.addDelegator(identityId, accounts[1].address);
    await DelegatorsInfo.addDelegator(identityId, accounts[2].address);
    await DelegatorsInfo.addDelegator(identityId, accounts[3].address);

    const isDelegator1 = await DelegatorsInfo.isNodeDelegator(
      identityId,
      accounts[1].address,
    );
    expect(isDelegator1).to.equal(true);
    const isDelegator2 = await DelegatorsInfo.isNodeDelegator(
      identityId,
      accounts[2].address,
    );
    expect(isDelegator2).to.equal(true);
    const isDelegator3 = await DelegatorsInfo.isNodeDelegator(
      identityId,
      accounts[3].address,
    );
    expect(isDelegator3).to.equal(true);
    await DelegatorsInfo.removeDelegator(identityId, accounts[2].address);

    const isDelegator = await DelegatorsInfo.isNodeDelegator(
      identityId,
      accounts[2].address,
    );
    expect(isDelegator).to.equal(false);
    const nodeDelegators = await DelegatorsInfo.getDelegators(identityId);
    expect(nodeDelegators.length).to.equal(2);
    expect(nodeDelegators[0]).to.equal(accounts[1].address);
    expect(nodeDelegators[1]).to.equal(accounts[3].address);
    const removedDelegatorIndex = await DelegatorsInfo.getDelegatorIndex(
      identityId,
      accounts[2].address,
    );
    expect(removedDelegatorIndex).to.equal(0);
    const keptDelegatorIndex1 = await DelegatorsInfo.getDelegatorIndex(
      identityId,
      accounts[1].address,
    );
    expect(keptDelegatorIndex1).to.equal(0);
    const keptDelegatorIndex3 = await DelegatorsInfo.getDelegatorIndex(
      identityId,
      accounts[3].address,
    );
    expect(keptDelegatorIndex3).to.equal(1);
  });

  it('Should revert when removing non-existent delegator', async () => {
    const { identityId } = await createProfile();
    await expect(
      DelegatorsInfo.removeDelegator(identityId, accounts[1].address),
    ).to.be.revertedWith('Delegator not found');
  });

  it('Should handle multiple operations on same identity', async () => {
    const { identityId } = await createProfile();
    // Add multiple delegators
    await DelegatorsInfo.addDelegator(identityId, accounts[1].address);
    await DelegatorsInfo.addDelegator(identityId, accounts[2].address);

    // Remove and re-add
    await DelegatorsInfo.removeDelegator(identityId, accounts[1].address);
    await DelegatorsInfo.addDelegator(identityId, accounts[1].address);

    const delegators = await DelegatorsInfo.getDelegators(identityId);
    expect(delegators.length).to.equal(2);
    // Check if indices were updated correctly
    expect(
      await DelegatorsInfo.getDelegatorIndex(identityId, accounts[1].address),
    ).to.equal(1);
  });

  it('Should return correct delegator list', async () => {
    const { identityId } = await createProfile();
    await DelegatorsInfo.addDelegator(identityId, accounts[1].address);
    await DelegatorsInfo.addDelegator(identityId, accounts[2].address);

    const delegators = await DelegatorsInfo.getDelegators(identityId);
    expect(delegators).to.deep.equal([
      accounts[1].address,
      accounts[2].address,
    ]);
  });

  it('Should return empty array for non-existent identity', async () => {
    const delegators = await DelegatorsInfo.getDelegators(999);
    expect(delegators.length).to.equal(0);
  });

  it('Should set and get lastClaimedEpoch, emit DelegatorLastClaimedEpochUpdated', async () => {
    const { identityId } = await createProfile();

    const delegator = accounts[1].address;
    const epoch = 1;
    const epoch2 = 2;

    await expect(
      DelegatorsInfo.setLastClaimedEpoch(identityId, delegator, epoch)
    ).to.emit(DelegatorsInfo, 'DelegatorLastClaimedEpochUpdated')
      .withArgs(identityId, delegator, epoch);

    expect(await DelegatorsInfo.getLastClaimedEpoch(identityId, delegator)).to.equal(epoch);

    // Make sure it updates the value
    await expect(
      DelegatorsInfo.setLastClaimedEpoch(identityId, delegator, epoch2)
    ).to.emit(DelegatorsInfo, 'DelegatorLastClaimedEpochUpdated')
      .withArgs(identityId, delegator, epoch2);

    expect(await DelegatorsInfo.getLastClaimedEpoch(identityId, delegator)).to.equal(epoch2);
  });

  it('Should set and get DelegatorRollingRewards, emit DelegatorRollingRewardsUpdated', async () => {
    const { identityId } = await createProfile();

    const delegator = accounts[1].address;
    const amount = 500;
    const amount2 = 500;

    await expect(
      DelegatorsInfo.setDelegatorRollingRewards(identityId, delegator, amount)
    ).to.emit(DelegatorsInfo, 'DelegatorRollingRewardsUpdated')
      .withArgs(identityId, delegator, amount, amount);

    expect(await DelegatorsInfo.getDelegatorRollingRewards(identityId, delegator)).to.equal(amount);


    // Make sure it updates the value
    await expect(
      DelegatorsInfo.setDelegatorRollingRewards(identityId, delegator, amount2)
    ).to.emit(DelegatorsInfo, 'DelegatorRollingRewardsUpdated')
      .withArgs(identityId, delegator, amount2, amount2);

    expect(await DelegatorsInfo.getDelegatorRollingRewards(identityId, delegator)).to.equal(amount2);
  });

  it('Should set IsOperatorFeeClaimedForEpoch and emit IsOperatorFeeClaimedForEpochUpdated', async () => {
    const { identityId } = await createProfile();

    const epoch = 1;
    const isClaimed = false;

    await expect(
      DelegatorsInfo.setIsOperatorFeeClaimedForEpoch(identityId, epoch, isClaimed)
    ).to.emit(DelegatorsInfo, 'IsOperatorFeeClaimedForEpochUpdated')
      .withArgs(identityId, epoch, isClaimed);
  });

  it('Should set and get NetNodeEpochRewards, emit NetNodeEpochRewardsSet', async () => {
    const { identityId } = await createProfile();

    const amount = 500;
    const epoch = 1;

    await expect(
      DelegatorsInfo.setNetNodeEpochRewards(identityId, epoch, amount)
    ).to.emit(DelegatorsInfo, 'NetNodeEpochRewardsSet')
      .withArgs(identityId, epoch, amount);

    expect(await DelegatorsInfo.getNetNodeEpochRewards(identityId, epoch)).to.equal(amount);
  });

  it('Should set HasDelegatorClaimedEpochRewards and emit HasDelegatorClaimedEpochRewardsUpdated', async () => {
    const { identityId } = await createProfile();

    const claimed = false;
    const epoch = 1;
    const delegatorKey = ethers.encodeBytes32String('delegator1');

    await expect(
      DelegatorsInfo.setHasDelegatorClaimedEpochRewards(epoch, identityId, delegatorKey, claimed)
    ).to.emit(DelegatorsInfo, 'HasDelegatorClaimedEpochRewardsUpdated')
      .withArgs(epoch, identityId, delegatorKey, claimed);
  });

  it('Should set setHasEverDelegatedToNode and emit HasEverDelegatedToNodeUpdated', async () => {
    const { identityId } = await createProfile();

    const claimed = false;
    const delegator = accounts[1].address;

    await expect(
      DelegatorsInfo.setHasEverDelegatedToNode(identityId, delegator, claimed)
    ).to.emit(DelegatorsInfo, 'HasEverDelegatedToNodeUpdated')
      .withArgs(identityId, delegator, claimed);
  });

  it('Should set and get setLastStakeHeldEpoch, emit LastStakeHeldEpochUpdated', async () => {
    const { identityId } = await createProfile();

    const epoch = 1;
    const delegator = accounts[1].address;

    await expect(
      DelegatorsInfo.setLastStakeHeldEpoch(identityId, delegator, epoch)
    ).to.emit(DelegatorsInfo, 'LastStakeHeldEpochUpdated')

    expect(await DelegatorsInfo.getLastStakeHeldEpoch(identityId, delegator)).to.equal(epoch);
  });

  it('Should set delegator rolling rewards', async () => {
    const { identityId } = await createProfile();
    const delegator = accounts[1].address;
    const amount = 500;

    await DelegatorsInfo.addDelegator(identityId, delegator);
    await DelegatorsInfo.setDelegatorRollingRewards(identityId, delegator, amount);

    expect(await DelegatorsInfo.getDelegatorRollingRewards(identityId, delegator)).to.equal(amount);
  });

  it('Should add to delegator rolling rewards', async () => {
    const { identityId } = await createProfile();
    const delegator = accounts[1].address;
    const amount = 500;
    const amount2 = 1000;

    await DelegatorsInfo.addDelegator(identityId, delegator);
    await DelegatorsInfo.setDelegatorRollingRewards(identityId, delegator, amount);
    await DelegatorsInfo.addDelegatorRollingRewards(identityId, delegator, amount2);

    expect(await DelegatorsInfo.getDelegatorRollingRewards(identityId, delegator)).to.equal(amount + amount2);
  });

  it('Should return zero rolling rewards for non-delegator', async () => {
    const { identityId } = await createProfile();
    const delegator = accounts[1].address;

    expect(await DelegatorsInfo.getDelegatorRollingRewards(identityId, delegator)).to.equal(0);
  });

  // Access control
  it('Should return zero rolling rewards for non-delegator', async () => {
    const { identityId } = await createProfile();
    const delegator = accounts[1].address;

    expect(await DelegatorsInfo.getDelegatorRollingRewards(identityId, delegator)).to.equal(0);
  });

  it('Should revert when non-contract calls addDelegator', async () => {
    const { identityId } = await createProfile();
    await expect(
      DelegatorsInfo.connect(accounts[1]).addDelegator(identityId, accounts[2].address)
    ).to.be.revertedWithCustomError(DelegatorsInfo, 'UnauthorizedAccess');
  });

  it('Should revert when non-contract calls removeDelegator', async () => {
    const { identityId } = await createProfile();
    await expect(
      DelegatorsInfo.connect(accounts[1]).removeDelegator(identityId, accounts[2].address)
    ).to.be.revertedWithCustomError(DelegatorsInfo, 'UnauthorizedAccess');
  });

  it('Should revert when non-contract calls setLastClaimedEpoch', async () => {
    const { identityId } = await createProfile();
    await expect(
      DelegatorsInfo.connect(accounts[1]).setLastClaimedEpoch(identityId, accounts[2].address, 1)
    ).to.be.revertedWithCustomError(DelegatorsInfo, 'UnauthorizedAccess');
  });

  it('Should revert when non-contract calls setDelegatorRollingRewards', async () => {
    const { identityId } = await createProfile();
    await expect(
      DelegatorsInfo.connect(accounts[1]).setDelegatorRollingRewards(identityId, accounts[2].address, 100)
    ).to.be.revertedWithCustomError(DelegatorsInfo, 'UnauthorizedAccess');
  });

  it('Should revert when non-contract calls addDelegatorRollingRewards', async () => {
    const { identityId } = await createProfile();
    await expect(
      DelegatorsInfo.connect(accounts[1]).addDelegatorRollingRewards(identityId, accounts[2].address, 100)
    ).to.be.revertedWithCustomError(DelegatorsInfo, 'UnauthorizedAccess');
  });

  it('Should revert when non-contract calls setIsOperatorFeeClaimedForEpoch', async () => {
    const { identityId } = await createProfile();
    await expect(
      DelegatorsInfo.connect(accounts[1]).setIsOperatorFeeClaimedForEpoch(identityId, 1, true)
    ).to.be.revertedWithCustomError(DelegatorsInfo, 'UnauthorizedAccess');
  });

  it('Should revert when non-contract calls setNetNodeEpochRewards', async () => {
    const { identityId } = await createProfile();
    await expect(
      DelegatorsInfo.connect(accounts[1]).setNetNodeEpochRewards(identityId, 1, 1000)
    ).to.be.revertedWithCustomError(DelegatorsInfo, 'UnauthorizedAccess');
  });

  it('Should revert when non-contract calls setHasDelegatorClaimedEpochRewards', async () => {
    const { identityId } = await createProfile();
    const delegatorKey = ethers.encodeBytes32String('testKey');
    await expect(
      DelegatorsInfo.connect(accounts[1]).setHasDelegatorClaimedEpochRewards(1, identityId, delegatorKey, true)
    ).to.be.revertedWithCustomError(DelegatorsInfo, 'UnauthorizedAccess');
  });

  it('Should revert when non-contract calls setHasEverDelegatedToNode', async () => {
    const { identityId } = await createProfile();
    await expect(
      DelegatorsInfo.connect(accounts[1]).setHasEverDelegatedToNode(identityId, accounts[2].address, true)
    ).to.be.revertedWithCustomError(DelegatorsInfo, 'UnauthorizedAccess');
  });

  it('Should revert when non-contract calls setLastStakeHeldEpoch', async () => {
    const { identityId } = await createProfile();
    await expect(
      DelegatorsInfo.connect(accounts[1]).setLastStakeHeldEpoch(identityId, accounts[2].address, 1)
    ).to.be.revertedWithCustomError(DelegatorsInfo, 'UnauthorizedAccess');
  });
});
