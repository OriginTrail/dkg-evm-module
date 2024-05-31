import { randomBytes } from 'crypto';

import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { BigNumber, BytesLike } from 'ethers';
import hre from 'hardhat';
import { SignerWithAddress } from 'hardhat-deploy-ethers/signers';

import {
  Token,
  Profile,
  ServiceAgreementStorageV1U1,
  StakingStorage,
  HubController,
  StakingV2,
  Shares,
  ParametersStorage,
  ProfileStorage,
} from '../../../typechain';

type StakingFixture = {
  accounts: SignerWithAddress[];
  Token: Token;
  Profile: Profile;
  ServiceAgreementStorageV1U1: ServiceAgreementStorageV1U1;
  StakingV2: StakingV2;
  StakingStorage: StakingStorage;
};

type Node = {
  account: SignerWithAddress;
  identityId: number;
  nodeId: BytesLike;
  sha256: BytesLike;
};

describe('@v2 @unit StakingV2 contract', function () {
  let accounts: SignerWithAddress[];
  let ParametersStorage: ParametersStorage;
  let ProfileStorage: ProfileStorage;
  let StakingV2: StakingV2;
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
    await hre.deployments.fixture(['StakingV2', 'Profile']);
    ParametersStorage = await hre.ethers.getContract<ParametersStorage>('ParametersStorage');
    ProfileStorage = await hre.ethers.getContract<ProfileStorage>('ProfileStorage');
    StakingV2 = await hre.ethers.getContract<StakingV2>('Staking');
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

    return { accounts, Token, Profile, ServiceAgreementStorageV1U1, StakingV2, StakingStorage };
  }

  async function createProfile(operational: SignerWithAddress, admin: SignerWithAddress): Promise<Node> {
    const OperationalProfile = Profile.connect(operational);

    const nodeId = '0x' + randomBytes(32).toString('hex');
    const sha256 = hre.ethers.utils.soliditySha256(['bytes'], [nodeId]);

    const receipt = await (
      await OperationalProfile.createProfile(
        admin.address,
        [],
        nodeId,
        randomBytes(5).toString('hex'),
        randomBytes(3).toString('hex'),
        0,
      )
    ).wait();
    const identityId = Number(receipt.logs[0].topics[1]);
    const blockchainNodeId = await ProfileStorage.getNodeId(identityId);
    const blockchainSha256 = await ProfileStorage.getNodeAddress(identityId, 1);

    expect(blockchainNodeId).to.be.equal(nodeId);
    expect(blockchainSha256).to.be.equal(sha256);

    await OperationalProfile.setAsk(identityId, hre.ethers.utils.parseEther('0.25'));

    return {
      account: operational,
      identityId,
      nodeId,
      sha256,
    };
  }

  async function calculateSharesToMint(newStakeAmount: BigNumber, totalShares: BigNumber): Promise<BigNumber> {
    const totalStake = await Token.balanceOf(StakingStorage.address);
    if (totalStake.isZero()) {
      return newStakeAmount;
    } else {
      return newStakeAmount.mul(totalShares).div(totalStake);
    }
  }

  async function calculateEligibleTokens(
    identityId: number,
    heldShares: BigNumber,
    totalShares: BigNumber,
  ): Promise<BigNumber> {
    const totalStake = await StakingStorage.totalStakes(identityId);
    return heldShares.mul(totalStake).div(totalShares);
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ accounts, Token, Profile, ServiceAgreementStorageV1U1, StakingV2, StakingStorage } = await loadFixture(
      deployStakingFixture,
    ));
  });

  it('The contract is named "Staking"', async () => {
    expect(await StakingV2.name()).to.equal('Staking');
  });

  it('The contract is version "2.1.0"', async () => {
    expect(await StakingV2.version()).to.equal('2.1.0');
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
    await Token.increaseAllowance(StakingV2.address, hre.ethers.utils.parseEther(`${2_000_000}`));

    const nodeId1 = '0x07f38512786964d9e70453371e7c98975d284100d44bd68dab67fe00b525cb66';
    await Profile.createProfile(accounts[1].address, [], nodeId1, 'Token', 'TKN', 0);

    await StakingV2['addStake(uint72,uint96)'](identityId1, hre.ethers.utils.parseEther(`${2_000_000}`));
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

    await StakingV2.connect(accounts[1]).addReward(
      agreementId,
      identityId1,
      hre.ethers.utils.parseEther(`${2_000_000}`),
    );
    expect(await StakingStorage.totalStakes(identityId1)).to.equal(
      hre.ethers.utils.parseEther(`${2_000_000}`),
      'Total amount of stake is not increased after adding reward',
    );
  });

  it('New profile created, stake added by node admin, StakeIncreased/SharesMinted events are emitted, token/shares balances are correct', async () => {
    const node = await createProfile(accounts[0], accounts[1]);

    const minStake = Number(hre.ethers.utils.formatEther(await ParametersStorage.minimumStake()));
    const maxStake = Number(hre.ethers.utils.formatEther(await ParametersStorage.maximumStake()));
    const stakeAmount = hre.ethers.utils.parseEther(
      `${Math.floor(Math.random() * (maxStake - minStake + 1)) + minStake}`,
    );

    const initialBalance = await Token.balanceOf(accounts[1].address);
    const oldStake = await StakingStorage.totalStakes(node.identityId);

    const sharesAddress = await ProfileStorage.getSharesContractAddress(node.identityId);
    const SharesContract = await hre.ethers.getContractAt<Shares>('Shares', sharesAddress);
    const initialSharesBalance = await SharesContract.balanceOf(accounts[1].address);
    const sharesTotalSupply = await SharesContract.totalSupply();
    const sharesToMint = await calculateSharesToMint(stakeAmount, sharesTotalSupply);

    await Token.connect(accounts[1]).increaseAllowance(StakingV2.address, stakeAmount);

    await expect(StakingV2.connect(accounts[1])['addStake(uint72,uint96)'](node.identityId, stakeAmount))
      .to.emit(StakingV2, 'StakeIncreased')
      .withArgs(node.identityId, node.nodeId, accounts[1].address, oldStake, oldStake.add(stakeAmount))
      .to.emit(StakingV2, 'SharesMinted')
      .withArgs(node.identityId, sharesAddress, accounts[1].address, sharesToMint, sharesTotalSupply.add(sharesToMint));

    const finalBalance = await Token.balanceOf(accounts[1].address);
    const finalSharesBalance = await SharesContract.balanceOf(accounts[1].address);

    expect(finalBalance).to.be.equal(initialBalance.sub(stakeAmount));
    expect(finalSharesBalance).to.be.equal(initialSharesBalance.add(sharesToMint));
  });

  it('New profile created, stake added by 5 delegators, StakeIncreased/SharesMinted events are emitted, token/shares balances are correct', async () => {
    const node = await createProfile(accounts[0], accounts[1]);

    const minStake = Number(hre.ethers.utils.formatEther(await ParametersStorage.minimumStake()));
    const maxStake = Number(hre.ethers.utils.formatEther(await ParametersStorage.maximumStake()));
    let stakeAmount = hre.ethers.utils.parseEther(
      `${Math.floor(Math.random() * (maxStake - minStake + 1)) + minStake}`,
    );

    let initialBalance = await Token.balanceOf(accounts[1].address);
    let oldStake = await StakingStorage.totalStakes(node.identityId);

    const sharesAddress = await ProfileStorage.getSharesContractAddress(node.identityId);
    const SharesContract = await hre.ethers.getContractAt<Shares>('Shares', sharesAddress);
    let initialSharesBalance = await SharesContract.balanceOf(accounts[1].address);
    let sharesTotalSupply = await SharesContract.totalSupply();
    let sharesToMint = await calculateSharesToMint(stakeAmount, sharesTotalSupply);

    await Token.connect(accounts[1]).increaseAllowance(StakingV2.address, stakeAmount);

    await expect(StakingV2.connect(accounts[1])['addStake(uint72,uint96)'](node.identityId, stakeAmount))
      .to.emit(StakingV2, 'StakeIncreased')
      .withArgs(node.identityId, node.nodeId, accounts[1].address, oldStake, oldStake.add(stakeAmount))
      .to.emit(StakingV2, 'SharesMinted')
      .withArgs(node.identityId, sharesAddress, accounts[1].address, sharesToMint, sharesTotalSupply.add(sharesToMint));

    let finalBalance = await Token.balanceOf(accounts[1].address);
    let finalSharesBalance = await SharesContract.balanceOf(accounts[1].address);

    expect(finalBalance).to.be.equal(initialBalance.sub(stakeAmount));
    expect(finalSharesBalance).to.be.equal(initialSharesBalance.add(sharesToMint));

    for (let i = 2; i < 7; i += 1) {
      oldStake = await StakingStorage.totalStakes(node.identityId);
      stakeAmount = hre.ethers.utils.parseEther(
        `${Math.floor(Math.random() * (maxStake - Number(hre.ethers.utils.formatEther(oldStake))))}`,
      );
      sharesTotalSupply = await SharesContract.totalSupply();
      sharesToMint = await calculateSharesToMint(stakeAmount, sharesTotalSupply);

      initialBalance = await Token.balanceOf(accounts[i].address);
      initialSharesBalance = await SharesContract.balanceOf(accounts[i].address);

      await Token.connect(accounts[i]).increaseAllowance(StakingV2.address, stakeAmount);

      await expect(StakingV2.connect(accounts[i])['addStake(uint72,uint96)'](node.identityId, stakeAmount))
        .to.emit(StakingV2, 'StakeIncreased')
        .withArgs(node.identityId, node.nodeId, accounts[i].address, oldStake, oldStake.add(stakeAmount))
        .to.emit(StakingV2, 'SharesMinted')
        .withArgs(
          node.identityId,
          sharesAddress,
          accounts[i].address,
          sharesToMint,
          sharesTotalSupply.add(sharesToMint),
        );

      finalBalance = await Token.balanceOf(accounts[i].address);
      finalSharesBalance = await SharesContract.balanceOf(accounts[i].address);

      expect(finalBalance).to.be.equal(initialBalance.sub(stakeAmount));
      expect(finalSharesBalance).to.be.equal(initialSharesBalance.add(sharesToMint));
    }
  });

  it('New profile created, stake added by node runner and 5 delegators, operator fee change triggered, teleport, operator fee changed, reward added, stake withdrawn, events and balance are correct', async () => {
    const node = await createProfile(accounts[0], accounts[1]);

    const minStake = Number(hre.ethers.utils.formatEther(await ParametersStorage.minimumStake()));
    const maxStake = Number(hre.ethers.utils.formatEther(await ParametersStorage.maximumStake()));
    let stakeAmount = hre.ethers.utils.parseEther(
      `${Math.floor(Math.random() * (maxStake - minStake + 1)) + minStake}`,
    );

    let initialBalance = await Token.balanceOf(accounts[1].address);
    let oldStake = await StakingStorage.totalStakes(node.identityId);

    const sharesAddress = await ProfileStorage.getSharesContractAddress(node.identityId);
    const SharesContract = await hre.ethers.getContractAt<Shares>('Shares', sharesAddress);
    let initialSharesBalance = await SharesContract.balanceOf(accounts[1].address);
    let sharesTotalSupply = await SharesContract.totalSupply();
    let sharesToMint = await calculateSharesToMint(stakeAmount, sharesTotalSupply);

    await Token.connect(accounts[1]).increaseAllowance(StakingV2.address, stakeAmount);

    await expect(StakingV2.connect(accounts[1])['addStake(uint72,uint96)'](node.identityId, stakeAmount))
      .to.emit(StakingV2, 'StakeIncreased')
      .withArgs(node.identityId, node.nodeId, accounts[1].address, oldStake, oldStake.add(stakeAmount))
      .to.emit(StakingV2, 'SharesMinted')
      .withArgs(node.identityId, sharesAddress, accounts[1].address, sharesToMint, sharesTotalSupply.add(sharesToMint));

    let finalBalance = await Token.balanceOf(accounts[1].address);
    let finalSharesBalance = await SharesContract.balanceOf(accounts[1].address);

    expect(finalBalance).to.be.equal(initialBalance.sub(stakeAmount));
    expect(finalSharesBalance).to.be.equal(initialSharesBalance.add(sharesToMint));

    for (let i = 2; i < 7; i += 1) {
      oldStake = await StakingStorage.totalStakes(node.identityId);
      stakeAmount = hre.ethers.utils.parseEther(
        `${Math.floor(Math.random() * (maxStake - Number(hre.ethers.utils.formatEther(oldStake))))}`,
      );
      sharesTotalSupply = await SharesContract.totalSupply();
      sharesToMint = await calculateSharesToMint(stakeAmount, sharesTotalSupply);

      initialBalance = await Token.balanceOf(accounts[i].address);
      initialSharesBalance = await SharesContract.balanceOf(accounts[i].address);

      await Token.connect(accounts[i]).increaseAllowance(StakingV2.address, stakeAmount);

      await expect(StakingV2.connect(accounts[i])['addStake(uint72,uint96)'](node.identityId, stakeAmount))
        .to.emit(StakingV2, 'StakeIncreased')
        .withArgs(node.identityId, node.nodeId, accounts[i].address, oldStake, oldStake.add(stakeAmount))
        .to.emit(StakingV2, 'SharesMinted')
        .withArgs(
          node.identityId,
          sharesAddress,
          accounts[i].address,
          sharesToMint,
          sharesTotalSupply.add(sharesToMint),
        );

      finalBalance = await Token.balanceOf(accounts[i].address);
      finalSharesBalance = await SharesContract.balanceOf(accounts[i].address);

      expect(finalBalance).to.be.equal(initialBalance.sub(stakeAmount));
      expect(finalSharesBalance).to.be.equal(initialSharesBalance.add(sharesToMint));
    }

    const newOperatorFee = 50;
    const stakeWithdrawalDelay = await ParametersStorage.stakeWithdrawalDelay();
    await expect(StakingV2.connect(accounts[1]).startOperatorFeeChange(node.identityId, newOperatorFee))
      .to.emit(StakingV2, 'OperatorFeeChangeStarted')
      .withArgs(
        node.identityId,
        node.nodeId,
        newOperatorFee,
        (await hre.ethers.provider.getBlock('latest')).timestamp + stakeWithdrawalDelay,
      );

    await time.increaseTo((await hre.ethers.provider.getBlock('latest')).timestamp + stakeWithdrawalDelay + 100);

    const agreementId = '0x' + randomBytes(32).toString('hex');
    const startTime = Math.floor(Date.now() / 1000).toString();
    const epochsNumber = 5;
    const epochLength = 10;
    const tokenAmount = hre.ethers.utils.parseEther('100');
    const scoreFunctionId = 0;
    const proofWindowOffsetPerc = 10;

    const reward = hre.ethers.utils.parseEther(`${2_000_000}`);
    await Token.mint(ServiceAgreementStorageV1U1.address, reward);

    await ServiceAgreementStorageV1U1.createServiceAgreementObject(
      agreementId,
      startTime,
      epochsNumber,
      epochLength,
      tokenAmount,
      scoreFunctionId,
      proofWindowOffsetPerc,
    );

    const oldAccOperatorFee = await ProfileStorage.getAccumulatedOperatorFee(node.identityId);
    const accOperatorFee = reward.mul(newOperatorFee).div(100);
    const delegatorsReward = reward.sub(accOperatorFee);
    oldStake = await StakingStorage.totalStakes(node.identityId);

    await expect(StakingV2.addReward(agreementId, node.identityId, reward))
      .to.emit(StakingV2, 'AccumulatedOperatorFeeIncreased')
      .withArgs(node.identityId, node.nodeId, oldAccOperatorFee, oldAccOperatorFee.add(accOperatorFee))
      .to.emit(StakingV2, 'StakeIncreased')
      .withArgs(
        node.identityId,
        node.nodeId,
        ServiceAgreementStorageV1U1.address,
        oldStake,
        oldStake.add(delegatorsReward),
      )
      .to.emit(StakingV2, 'RewardCollected')
      .withArgs(
        agreementId,
        node.identityId,
        node.nodeId,
        ServiceAgreementStorageV1U1.address,
        accOperatorFee,
        delegatorsReward,
      );

    initialBalance = await Token.balanceOf(accounts[1].address);
    oldStake = await StakingStorage.totalStakes(node.identityId);

    initialSharesBalance = await SharesContract.balanceOf(accounts[1].address);
    sharesTotalSupply = await SharesContract.totalSupply();
    let eligibleTokens = await calculateEligibleTokens(node.identityId, initialSharesBalance, sharesTotalSupply);

    await SharesContract.connect(accounts[1]).increaseAllowance(StakingV2.address, initialSharesBalance);

    await expect(StakingV2.connect(accounts[1]).startStakeWithdrawal(node.identityId, initialSharesBalance))
      .to.emit(StakingV2, 'StakeWithdrawalStarted')
      .withArgs(
        node.identityId,
        node.nodeId,
        accounts[1].address,
        oldStake,
        oldStake.sub(eligibleTokens),
        (await hre.ethers.provider.getBlock('latest')).timestamp + stakeWithdrawalDelay,
      )
      .to.emit(StakingV2, 'SharesBurned')
      .withArgs(
        node.identityId,
        sharesAddress,
        accounts[1].address,
        initialSharesBalance,
        sharesTotalSupply.sub(initialSharesBalance),
      );

    await time.increaseTo((await hre.ethers.provider.getBlock('latest')).timestamp + stakeWithdrawalDelay);

    await expect(StakingV2.connect(accounts[1]).withdrawStake(node.identityId))
      .to.emit(StakingV2, 'StakeWithdrawn')
      .withArgs(node.identityId, node.nodeId, accounts[1].address, eligibleTokens);

    finalBalance = await Token.balanceOf(accounts[1].address);
    finalSharesBalance = await SharesContract.balanceOf(accounts[1].address);

    expect(finalBalance).to.be.equal(initialBalance.add(eligibleTokens));
    expect(finalSharesBalance).to.be.equal(0);

    for (let i = 2; i < 7; i += 1) {
      initialBalance = await Token.balanceOf(accounts[i].address);
      oldStake = await StakingStorage.totalStakes(node.identityId);

      initialSharesBalance = await SharesContract.balanceOf(accounts[i].address);
      sharesTotalSupply = await SharesContract.totalSupply();
      eligibleTokens = await calculateEligibleTokens(node.identityId, initialSharesBalance, sharesTotalSupply);

      await SharesContract.connect(accounts[i]).increaseAllowance(StakingV2.address, initialSharesBalance);

      await expect(StakingV2.connect(accounts[i]).startStakeWithdrawal(node.identityId, initialSharesBalance))
        .to.emit(StakingV2, 'StakeWithdrawalStarted')
        .withArgs(
          node.identityId,
          node.nodeId,
          accounts[i].address,
          oldStake,
          oldStake.sub(eligibleTokens),
          (await hre.ethers.provider.getBlock('latest')).timestamp + stakeWithdrawalDelay,
        )
        .to.emit(StakingV2, 'SharesBurned')
        .withArgs(
          node.identityId,
          sharesAddress,
          accounts[i].address,
          initialSharesBalance,
          sharesTotalSupply.sub(initialSharesBalance),
        );

      await time.increaseTo((await hre.ethers.provider.getBlock('latest')).timestamp + stakeWithdrawalDelay);

      await expect(StakingV2.connect(accounts[i]).withdrawStake(node.identityId))
        .to.emit(StakingV2, 'StakeWithdrawn')
        .withArgs(node.identityId, node.nodeId, accounts[i].address, eligibleTokens);

      finalBalance = await Token.balanceOf(accounts[i].address);
      finalSharesBalance = await SharesContract.balanceOf(accounts[i].address);

      expect(finalBalance).to.be.equal(initialBalance.add(eligibleTokens));
      expect(finalSharesBalance).to.be.equal(0);
    }
  });

  it('SA created with score function 1, addReward, expect all reward to be a node operator fee', async () => {
    await Token.mint(ServiceAgreementStorageV1U1.address, hre.ethers.utils.parseEther(`${2_000_000}`));
    const nodeId1 = '0x07f38512786964d9e70453371e7c98975d284100d44bd68dab67fe00b525cb66';
    await Profile.createProfile(accounts[1].address, [], nodeId1, 'Token', 'TKN', 50);

    const agreementId = '0x' + randomBytes(32).toString('hex');
    const startTime = Math.floor(Date.now() / 1000).toString();
    const epochsNumber = 5;
    const epochLength = 10;
    const tokenAmount = hre.ethers.utils.parseEther('100');
    const scoreFunctionId = 1;
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

    const rewardAmount = hre.ethers.utils.parseEther(`${2_000_000}`);

    await expect(StakingV2.connect(accounts[1]).addReward(agreementId, identityId1, rewardAmount))
      .to.emit(StakingV2, 'RewardCollected')
      .withArgs(agreementId, identityId1, nodeId1, ServiceAgreementStorageV1U1.address, rewardAmount, 0);
  });
});
