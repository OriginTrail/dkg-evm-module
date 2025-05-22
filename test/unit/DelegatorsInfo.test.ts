import { randomBytes } from 'crypto';

import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre from 'hardhat';

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

describe('DelegatorsInfo contract', function () {
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
});
