import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import hre from 'hardhat';

import { Token, Hub, Profile, ServiceAgreementStorageV1, Staking, StakingStorage } from '../typechain';

type StakingFixture = {
  accounts: SignerWithAddress[];
  Token: Token;
  Profile: Profile;
  ServiceAgreementStorageV1: ServiceAgreementStorageV1;
  Staking: Staking;
  StakingStorage: StakingStorage;
};

describe('Staking contract', function () {
  let accounts: SignerWithAddress[];
  let Staking: Staking;
  let StakingStorage: StakingStorage;
  let Token: Token;
  let Profile: Profile;
  let ServiceAgreementStorageV1: ServiceAgreementStorageV1;
  const identityId1 = 1;
  const totalStake = 1000;
  const operatorFee = 10;
  const transferAmount = 100;
  const timestamp = 1674261619;

  async function deployStakingFixture(): Promise<StakingFixture> {
    await hre.deployments.fixture(['Staking', 'Profile']);
    const Staking = await hre.ethers.getContract<Staking>('Staking');
    const StakingStorage = await hre.ethers.getContract<StakingStorage>('StakingStorage');
    const Token = await hre.ethers.getContract<Token>('Token');
    const Profile = await hre.ethers.getContract<Profile>('Profile');
    const ServiceAgreementStorageV1 = await hre.ethers.getContract<ServiceAgreementStorageV1>(
      'ServiceAgreementStorageV1',
    );
    const accounts = await hre.ethers.getSigners();
    const Hub = await hre.ethers.getContract<Hub>('Hub');
    await Hub.setContractAddress('HubOwner', accounts[0].address);

    return { accounts, Token, Profile, ServiceAgreementStorageV1, Staking, StakingStorage };
  }

  beforeEach(async () => {
    ({ accounts, Token, Profile, ServiceAgreementStorageV1, Staking, StakingStorage } = await loadFixture(
      deployStakingFixture,
    ));
  });

  it('The contract is named "Staking"', async function () {
    expect(await Staking.name()).to.equal('Staking');
  });

  it('The contract is version "1.0.1"', async function () {
    expect(await Staking.version()).to.equal('1.0.1');
  });

  it('Non-Contract should not be able to setTotalStake; expect to fail', async function () {
    const StakingStorageWithNonHubOwner = StakingStorage.connect(accounts[1]);
    await expect(StakingStorageWithNonHubOwner.setTotalStake(identityId1, totalStake)).to.be.revertedWith(
      'Fn can only be called by the hub',
    );
  });

  it('Contract should be able to setTotalStake; expect to pass', async function () {
    await StakingStorage.setTotalStake(identityId1, totalStake);
    expect(await StakingStorage.totalStakes(identityId1)).to.equal(totalStake);
  });

  it('Non-Contract should not be able to setOperatorFee; expect to fail', async function () {
    const StakingStorageWithNonHubOwner = StakingStorage.connect(accounts[1]);
    await expect(StakingStorageWithNonHubOwner.setOperatorFee(identityId1, operatorFee)).to.be.revertedWith(
      'Fn can only be called by the hub',
    );
  });

  it('Contract should be able to setOperatorFee; expect to pass', async function () {
    await StakingStorage.setOperatorFee(identityId1, operatorFee);
    expect(await StakingStorage.operatorFees(identityId1)).to.equal(operatorFee);
  });

  it('Non-Contract should not be able to createWithdrawalRequest; expect to fail', async function () {
    const StakingStorageWithNonHubOwner = StakingStorage.connect(accounts[1]);
    await expect(
      StakingStorageWithNonHubOwner.createWithdrawalRequest(identityId1, accounts[1].address, totalStake, 2022),
    ).to.be.revertedWith('Fn can only be called by the hub');
  });

  it('Contract should be able to createWithdrawalRequest; expect to pass', async function () {
    await StakingStorage.createWithdrawalRequest(identityId1, accounts[1].address, totalStake, timestamp);

    expect(await StakingStorage.withdrawalRequestExists(identityId1, accounts[1].address)).to.equal(true);
    expect(await StakingStorage.getWithdrawalRequestAmount(identityId1, accounts[1].address)).to.equal(totalStake);
    expect(await StakingStorage.getWithdrawalRequestTimestamp(identityId1, accounts[1].address)).to.equal(timestamp);
  });

  it('Non-Contract should not be able to deleteWithdrawalRequest; expect to fail', async function () {
    const StakingStorageWithNonHubOwner = StakingStorage.connect(accounts[1]);
    await expect(
      StakingStorageWithNonHubOwner.deleteWithdrawalRequest(identityId1, accounts[1].address),
    ).to.be.revertedWith('Fn can only be called by the hub');
  });

  it('Contract should be able to deleteWithdrawalRequest; expect to pass', async function () {
    await StakingStorage.createWithdrawalRequest(identityId1, accounts[1].address, totalStake, timestamp);

    await StakingStorage.deleteWithdrawalRequest(identityId1, accounts[1].address);
    expect(await StakingStorage.withdrawalRequestExists(identityId1, accounts[1].address)).to.equal(false);
    expect(await StakingStorage.getWithdrawalRequestAmount(identityId1, accounts[1].address)).to.equal(0);
    expect(await StakingStorage.getWithdrawalRequestTimestamp(identityId1, accounts[1].address)).to.equal(0);
  });

  it('Non-Contract should not be able to transferStake; expect to fail', async function () {
    const StakingStorageWithNonHubOwner = StakingStorage.connect(accounts[1]);
    await expect(StakingStorageWithNonHubOwner.transferStake(accounts[1].address, transferAmount)).to.be.revertedWith(
      'Fn can only be called by the hub',
    );
  });

  it('Contract should be able to transferStake; expect to pass', async function () {
    await Token.mint(StakingStorage.address, 1000000000000000);
    await StakingStorage.transferStake(accounts[1].address, transferAmount);

    expect(await Token.balanceOf(accounts[1].address)).to.equal(transferAmount);
  });

  it('Create 1 node; expect that stake is created and correctly set', async function () {
    await Token.mint(accounts[0].address, 1000000000000000);
    await Token.increaseAllowance(Staking.address, 1000000000000000);

    const nodeId1 = '0x07f38512786964d9e70453371e7c98975d284100d44bd68dab67fe00b525cb66';
    await Profile.createProfile(accounts[0].address, nodeId1, 'Token', 'TKN');

    await Staking['addStake(address,uint72,uint96)'](accounts[0].address, identityId1, 1000000000);
    expect(await StakingStorage.totalStakes(identityId1)).to.equal(1000000000, 'Total amount of stake is not set');
  });

  it('Add reward; expect that total stake is increased', async function () {
    await Token.mint(ServiceAgreementStorageV1.address, 1000000000000000);
    const nodeId1 = '0x07f38512786964d9e70453371e7c98975d284100d44bd68dab67fe00b525cb66';
    await Profile.createProfile(accounts[0].address, nodeId1, 'Token', 'TKN');

    await Staking.addReward(identityId1, 1000000000);
    expect(await StakingStorage.totalStakes(identityId1)).to.equal(
      1000000000,
      'Total amount of stake is not increased after adding reward',
    );
  });
});
