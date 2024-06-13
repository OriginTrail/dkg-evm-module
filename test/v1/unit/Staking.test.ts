import { randomBytes } from 'crypto';

import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre from 'hardhat';
import { SignerWithAddress } from 'hardhat-deploy-ethers/signers';

import {
  Token,
  Profile,
  ServiceAgreementStorageV1U1,
  Staking,
  StakingStorage,
  HubController,
} from '../../../typechain';

type StakingFixture = {
  accounts: SignerWithAddress[];
  Token: Token;
  Profile: Profile;
  ServiceAgreementStorageV1U1: ServiceAgreementStorageV1U1;
  Staking: Staking;
  StakingStorage: StakingStorage;
};

describe('@v1 @unit Staking contract', function () {
  let accounts: SignerWithAddress[];
  let Staking: Staking;
  let StakingStorage: StakingStorage;
  let Token: Token;
  let Profile: Profile;
  let ServiceAgreementStorageV1U1: ServiceAgreementStorageV1U1;
  const identityId1 = 1;
  const totalStake = hre.ethers.utils.parseEther('1000');
  const operatorFee = hre.ethers.BigNumber.from(10);
  const transferAmount = hre.ethers.utils.parseEther('100');
  const timestamp = 1674261619;

  async function deployStakingFixture(): Promise<StakingFixture> {
    await hre.deployments.fixture(['Staking', 'Profile']);
    Staking = await hre.ethers.getContract<Staking>('Staking');
    StakingStorage = await hre.ethers.getContract<StakingStorage>('StakingStorage');
    Token = await hre.ethers.getContract<Token>('Token');
    Profile = await hre.ethers.getContract<Profile>('Profile');
    ServiceAgreementStorageV1U1 = await hre.ethers.getContract<ServiceAgreementStorageV1U1>(
      'ServiceAgreementStorageV1U1',
    );
    accounts = await hre.ethers.getSigners();
    const HubController = await hre.ethers.getContract<HubController>('HubController');
    await HubController.setContractAddress('HubOwner', accounts[0].address);
    await HubController.setContractAddress('NotHubOwner', accounts[1].address);

    return { accounts, Token, Profile, ServiceAgreementStorageV1U1, Staking, StakingStorage };
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ accounts, Token, Profile, ServiceAgreementStorageV1U1, Staking, StakingStorage } = await loadFixture(
      deployStakingFixture,
    ));
  });

  it('The contract is named "Staking"', async () => {
    expect(await Staking.name()).to.equal('Staking');
  });

  it('The contract is version "1.1.0"', async () => {
    expect(await Staking.version()).to.equal('1.1.0');
  });

  it('Non-Contract should not be able to setTotalStake; expect to fail', async () => {
    const StakingStorageWithNonHubOwner = StakingStorage.connect(accounts[2]);
    await expect(StakingStorageWithNonHubOwner.setTotalStake(identityId1, totalStake)).to.be.revertedWith(
      'Fn can only be called by the hub',
    );
  });

  it('Contract should be able to setTotalStake; expect to pass', async () => {
    await StakingStorage.setTotalStake(identityId1, totalStake);
    expect(await StakingStorage.totalStakes(identityId1)).to.equal(totalStake);
  });

  it('Non-Contract should not be able to setOperatorFee; expect to fail', async () => {
    const StakingStorageWithNonHubOwner = StakingStorage.connect(accounts[2]);
    await expect(StakingStorageWithNonHubOwner.setOperatorFee(identityId1, operatorFee)).to.be.revertedWith(
      'Fn can only be called by the hub',
    );
  });

  it('Contract should be able to setOperatorFee; expect to pass', async () => {
    await StakingStorage.setOperatorFee(identityId1, operatorFee);
    expect(await StakingStorage.operatorFees(identityId1)).to.equal(operatorFee);
  });

  it('Non-Contract should not be able to createWithdrawalRequest; expect to fail', async () => {
    const StakingStorageWithNonHubOwner = StakingStorage.connect(accounts[2]);
    await expect(
      StakingStorageWithNonHubOwner.createWithdrawalRequest(identityId1, accounts[2].address, totalStake, 2022),
    ).to.be.revertedWith('Fn can only be called by the hub');
  });

  it('Contract should be able to createWithdrawalRequest; expect to pass', async () => {
    await StakingStorage.createWithdrawalRequest(identityId1, accounts[1].address, totalStake, timestamp);

    expect(await StakingStorage.withdrawalRequestExists(identityId1, accounts[1].address)).to.equal(true);
    expect(await StakingStorage.getWithdrawalRequestAmount(identityId1, accounts[1].address)).to.equal(totalStake);
    expect(await StakingStorage.getWithdrawalRequestTimestamp(identityId1, accounts[1].address)).to.equal(timestamp);
  });

  it('Non-Contract should not be able to deleteWithdrawalRequest; expect to fail', async () => {
    const StakingStorageWithNonHubOwner = StakingStorage.connect(accounts[2]);
    await expect(
      StakingStorageWithNonHubOwner.deleteWithdrawalRequest(identityId1, accounts[2].address),
    ).to.be.revertedWith('Fn can only be called by the hub');
  });

  it('Contract should be able to deleteWithdrawalRequest; expect to pass', async () => {
    await StakingStorage.createWithdrawalRequest(identityId1, accounts[1].address, totalStake, timestamp);

    await StakingStorage.deleteWithdrawalRequest(identityId1, accounts[1].address);
    expect(await StakingStorage.withdrawalRequestExists(identityId1, accounts[1].address)).to.equal(false);
    expect(await StakingStorage.getWithdrawalRequestAmount(identityId1, accounts[1].address)).to.equal(0);
    expect(await StakingStorage.getWithdrawalRequestTimestamp(identityId1, accounts[1].address)).to.equal(0);
  });

  it('Non-Contract should not be able to transferStake; expect to fail', async () => {
    const StakingStorageWithNonHubOwner = StakingStorage.connect(accounts[2]);
    await expect(StakingStorageWithNonHubOwner.transferStake(accounts[2].address, transferAmount)).to.be.revertedWith(
      'Fn can only be called by the hub',
    );
  });

  it('Contract should be able to transferStake; expect to pass', async () => {
    await Token.mint(StakingStorage.address, hre.ethers.utils.parseEther(`${2_000_000}`));

    const initialReceiverBalance = await Token.balanceOf(accounts[1].address);
    await StakingStorage.transferStake(accounts[1].address, transferAmount);

    expect(await Token.balanceOf(accounts[1].address)).to.equal(initialReceiverBalance.add(transferAmount));
  });

  it('Create 1 node; expect that stake is created and correctly set', async () => {
    await Token.increaseAllowance(Staking.address, hre.ethers.utils.parseEther(`${2_000_000}`));

    const nodeId1 = '0x07f38512786964d9e70453371e7c98975d284100d44bd68dab67fe00b525cb66';
    await Profile.connect(accounts[1]).createProfile(accounts[0].address, [], nodeId1, 'Token', 'TKN', 0);

    await Staking['addStake(uint72,uint96)'](identityId1, hre.ethers.utils.parseEther(`${2_000_000}`));
    expect(await StakingStorage.totalStakes(identityId1)).to.equal(
      hre.ethers.utils.parseEther(`${2_000_000}`),
      'Total amount of stake is not set',
    );
  });

  it('Add reward; expect that total stake is increased', async () => {
    await Token.mint(ServiceAgreementStorageV1U1.address, hre.ethers.utils.parseEther(`${2_000_000}`));
    const nodeId1 = '0x07f38512786964d9e70453371e7c98975d284100d44bd68dab67fe00b525cb66';
    await Profile.createProfile(accounts[1].address, [], nodeId1, 'Token', 'TKN', 0);

    const agreementId = '0x' + randomBytes(32).toString('hex');
    const startTime = Math.floor(Date.now() / 1000).toString();
    const epochsNumber = 5;
    const epochLength = 10;
    const tokenAmount = hre.ethers.utils.parseEther('100');
    const scoreFunctionId = 0;
    const proofWindowOffsetPerc = 10;

    await ServiceAgreementStorageV1U1.createServiceAgreementObject(
      agreementId,
      startTime,
      epochsNumber,
      epochLength,
      tokenAmount,
      scoreFunctionId,
      proofWindowOffsetPerc,
    );

    await Staking.connect(accounts[1]).addReward(agreementId, identityId1, hre.ethers.utils.parseEther(`${2_000_000}`));
    expect(await StakingStorage.totalStakes(identityId1)).to.equal(
      hre.ethers.utils.parseEther(`${2_000_000}`),
      'Total amount of stake is not increased after adding reward',
    );
  });
});
