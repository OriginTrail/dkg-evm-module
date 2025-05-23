import { randomBytes } from 'crypto';

import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
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
  };
}

describe('Staking contract', function () {
  let accounts: SignerWithAddress[];
  let Token: Token;
  let Profile: Profile;
  let Staking: Staking;
  let StakingStorage: StakingStorage;
  let ShardingTableStorage: ShardingTableStorage;
  let ParametersStorage: ParametersStorage;

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
      Token,
      Profile,
      Staking,
      StakingStorage,
      ShardingTableStorage,
      ParametersStorage,
    } = await loadFixture(deployStakingFixture));
  });

  it('Should have correct name and version', async () => {
    expect(await Staking.name()).to.equal('Staking');
    expect(await Staking.version()).to.equal('1.0.0');
  });

  it('Should revert if staking 0 tokens', async () => {
    const { identityId } = await createProfile();
    await expect(Staking.stake(identityId, 0)).to.be.revertedWithCustomError(
      Staking,
      'ZeroTokenAmount',
    );
  });

  it('Should revert if profile does not exist', async () => {
    const bogusId = 9_999;
    await expect(Staking.stake(bogusId, 100))
      .to.be.revertedWithCustomError(Staking, 'ProfileDoesntExist')
      .withArgs(bogusId);
  });

  it('Should revert if token allowance too low', async () => {
    const { identityId } = await createProfile();
    await expect(Staking.stake(identityId, 100)).to.be.revertedWithCustomError(
      Staking,
      'TooLowAllowance',
    );
  });

  it('Should revert if token balance too low', async () => {
    const { identityId } = await createProfile();
    const want = 2n ** 96n - 1n;
    await Token.connect(accounts[0]).approve(await Staking.getAddress(), want);

    const actualBal = await Token.balanceOf(accounts[0].address);
    await expect(Staking.stake(identityId, want))
      .to.be.revertedWithCustomError(Staking, 'TooLowBalance')
      .withArgs(await Token.getAddress(), actualBal, want);
  });

  it('Should revert if maximum stake exceeded', async () => {
    const { identityId } = await createProfile();
    const maxStake = await ParametersStorage.maximumStake();

    await Token.mint(accounts[0].address, maxStake + 1n);
    await Token.connect(accounts[0]).approve(
      await Staking.getAddress(),
      maxStake + 1n,
    );
    await Staking.stake(identityId, maxStake);
    const before = await StakingStorage.getNodeStake(identityId);
    await expect(Staking.stake(identityId, 1))
      .to.be.revertedWithCustomError(Staking, 'MaximumStakeExceeded')
      .withArgs(maxStake);
    expect(await StakingStorage.getNodeStake(identityId)).to.equal(before);
  });

  it('Should stake successfully and reflect on node stake', async () => {
    const { identityId } = await createProfile();
    const amount = hre.ethers.parseEther('100'); // 100e18

    await Token.mint(accounts[0].address, amount);
    await Token.connect(accounts[0]).approve(
      await Staking.getAddress(),
      amount,
    );
    await expect(Staking.stake(identityId, amount)).to.changeTokenBalances(
      Token,
      [accounts[0], await StakingStorage.getAddress()],
      [-amount, amount],
    );

    expect(await StakingStorage.getNodeStake(identityId)).to.equal(amount);
  });

  it('Should add node to sharding table when above minimum stake', async () => {
    const { identityId } = await createProfile();
    const minStake = await ParametersStorage.minimumStake();
    await Token.mint(accounts[0].address, minStake);
    await Token.connect(accounts[0]).approve(
      await Staking.getAddress(),
      minStake,
    );
    await Staking.stake(identityId, minStake);
    expect(await ShardingTableStorage.nodeExists(identityId)).to.equal(true);
  });

  it('Should redelegate stake to another identity', async () => {
    const node1 = await createProfile();
    const node2 = await createProfile(accounts[0], accounts[2]);

    const initial = hre.ethers.parseEther('1000');

    await Token.mint(accounts[0].address, initial);
    await Token.connect(accounts[0]).approve(
      await Staking.getAddress(),
      initial,
    );

    await Staking.stake(node1.identityId, initial);
    const half = initial / 2n;
    const node1Before = await StakingStorage.getNodeStake(node1.identityId);
    const node2Before = await StakingStorage.getNodeStake(node2.identityId);
    const dKey = hre.ethers.keccak256(
      hre.ethers.solidityPacked(['address'], [accounts[0].address]),
    );
    const [dBaseBefore, dIdxBefore] =
      await StakingStorage.getDelegatorStakeInfo(node1.identityId, dKey);

    await Staking.redelegate(node1.identityId, node2.identityId, half);
    expect(await StakingStorage.getNodeStake(node1.identityId)).to.equal(
      node1Before - half,
    );
    expect(await StakingStorage.getNodeStake(node2.identityId)).to.equal(
      node2Before + half,
    );
    const [dBaseAfter1, dIdxAfter1] =
      await StakingStorage.getDelegatorStakeInfo(node1.identityId, dKey);
    const [dBaseAfter2, dIdxAfter2] =
      await StakingStorage.getDelegatorStakeInfo(node2.identityId, dKey);

    expect(dBaseAfter1 + dIdxAfter1 + dBaseAfter2 + dIdxAfter2).to.equal(
      dBaseBefore + dIdxBefore,
    );
    await expect(
      Staking.redelegate(node1.identityId, node2.identityId, 0),
    ).to.be.revertedWithCustomError(Staking, 'ZeroTokenAmount');
    await expect(
      Staking.redelegate(9999, node2.identityId, 100),
    ).to.be.revertedWithCustomError(Staking, 'ProfileDoesntExist');
    await expect(
      Staking.redelegate(node1.identityId, 9999, 100),
    ).to.be.revertedWithCustomError(Staking, 'ProfileDoesntExist');
  });

  it('Should handle requestWithdrawal with zero tokens', async () => {
    const { identityId } = await createProfile();
    await expect(
      Staking.requestWithdrawal(identityId, 0),
    ).to.be.revertedWithCustomError(Staking, 'ZeroTokenAmount');
  });

  it('Should handle requestWithdrawal exceeding stake', async () => {
    const { identityId } = await createProfile();
    const stake = hre.ethers.parseEther('100');

    await Token.mint(accounts[0].address, stake);
    await Token.connect(accounts[0]).approve(await Staking.getAddress(), stake);
    await Staking.stake(identityId, stake);

    const nodeStakeBefore = await StakingStorage.getNodeStake(identityId);
    const totalStakeBefore = await StakingStorage.getTotalStake();
    const delegatorKey = hre.ethers.keccak256(
      hre.ethers.solidityPacked(['address'], [accounts[0].address]),
    );
    const [baseBefore, idxBefore] = await StakingStorage.getDelegatorStakeInfo(
      identityId,
      delegatorKey,
    );
    await expect(Staking.requestWithdrawal(identityId, stake + 1n))
      .to.be.revertedWithCustomError(Staking, 'WithdrawalExceedsStake')
      .withArgs(stake, stake + 1n);
    expect(await StakingStorage.getNodeStake(identityId)).to.equal(
      nodeStakeBefore,
    );
    expect(await StakingStorage.getTotalStake()).to.equal(totalStakeBefore);

    const [baseAfter, idxAfter] = await StakingStorage.getDelegatorStakeInfo(
      identityId,
      delegatorKey,
    );
    expect(baseAfter).to.equal(baseBefore);
    expect(idxAfter).to.equal(idxBefore);
  });

  it('Should create a withdrawal request', async () => {
    const { identityId } = await createProfile();
    const stake = hre.ethers.parseEther('100');

    await Token.mint(accounts[0].address, stake);
    await Token.connect(accounts[0]).approve(await Staking.getAddress(), stake);
    await Staking.stake(identityId, stake);

    const half = stake / 2n;
    const nodeStakeBefore = await StakingStorage.getNodeStake(identityId);
    const totalStakeBefore = await StakingStorage.getTotalStake();

    const latestTs = (await hre.ethers.provider.getBlock('latest'))!.timestamp; //  '!' → није null
    const delay = await ParametersStorage.stakeWithdrawalDelay();
    const minExpected = BigInt(latestTs) + delay;

    await Staking.requestWithdrawal(identityId, half);

    const delegatorKey = hre.ethers.keccak256(
      hre.ethers.solidityPacked(['address'], [accounts[0].address]),
    );
    const req = await StakingStorage.getDelegatorWithdrawalRequest(
      identityId,
      delegatorKey,
    );

    expect(req[0]).to.equal(half);
    expect(req[1]).to.equal(0n);

    expect(req[2]).to.be.at.least(minExpected);
    expect(req[2]).to.be.at.most(minExpected + 2n);

    expect(await StakingStorage.getNodeStake(identityId)).to.equal(
      nodeStakeBefore - half,
    );
    expect(await StakingStorage.getTotalStake()).to.equal(
      totalStakeBefore - half,
    );
  });

  it('Should finalize withdrawal after delay', async () => {
    const { identityId } = await createProfile();
    const stake = hre.ethers.parseEther('100');

    await Token.mint(accounts[0].address, stake);
    await Token.connect(accounts[0]).approve(await Staking.getAddress(), stake);
    await Staking.stake(identityId, stake);

    const wAmt = stake / 2n;
    const delegatorKey = hre.ethers.keccak256(
      hre.ethers.solidityPacked(['address'], [accounts[0].address]),
    );

    await Staking.requestWithdrawal(identityId, wAmt);
    const wr = await StakingStorage.getDelegatorWithdrawalRequest(
      identityId,
      delegatorKey,
    );

    const nodeStakeBefore = await StakingStorage.getNodeStake(identityId); // već 50 ETH
    const totalStakeBefore = await StakingStorage.getTotalStake();
    const balBefore = await Token.balanceOf(accounts[0].address);
    await time.increaseTo(wr[2]);
    await Staking.finalizeWithdrawal(identityId);
    const balAfter = await Token.balanceOf(accounts[0].address);
    expect(balAfter - balBefore).to.equal(wAmt);
    const wrAfter = await StakingStorage.getDelegatorWithdrawalRequest(
      identityId,
      delegatorKey,
    );
    expect(wrAfter[0] + wrAfter[1] + wrAfter[2]).to.equal(0n);
    expect(await StakingStorage.getNodeStake(identityId)).to.equal(
      nodeStakeBefore,
    );
    expect(await StakingStorage.getTotalStake()).to.equal(totalStakeBefore);
  });

  it('Should revert finalizeWithdrawal if not requested', async () => {
    const { identityId } = await createProfile();
    await expect(
      Staking.finalizeWithdrawal(identityId),
    ).to.be.revertedWithCustomError(Staking, 'WithdrawalWasntInitiated');
  });

  it('Should revert finalizeWithdrawal if too early', async () => {
    const { identityId } = await createProfile();
    const amount = hre.ethers.parseEther('100');
    await Token.mint(accounts[0].address, amount);
    await Token.connect(accounts[0]).approve(
      await Staking.getAddress(),
      amount,
    );
    await Staking.stake(identityId, amount);
    await Staking.requestWithdrawal(identityId, amount / 2n);
    await expect(
      Staking.finalizeWithdrawal(identityId),
    ).to.be.revertedWithCustomError(Staking, 'WithdrawalPeriodPending');
  });

  it('Should cancel withdrawal request', async () => {
    const { identityId } = await createProfile();
    const stake = hre.ethers.parseEther('200');

    await Token.mint(accounts[0].address, stake);
    await Token.connect(accounts[0]).approve(await Staking.getAddress(), stake);
    await Staking.stake(identityId, stake);

    const wAmt = hre.ethers.parseEther('100');
    await Staking.requestWithdrawal(identityId, wAmt);

    const nodeStakeAfterReq = await StakingStorage.getNodeStake(identityId);
    const totalStakeAfterReq = await StakingStorage.getTotalStake();

    await Staking.cancelWithdrawal(identityId);

    const delegatorKey = hre.ethers.keccak256(
      hre.ethers.solidityPacked(['address'], [accounts[0].address]),
    );
    const wr = await StakingStorage.getDelegatorWithdrawalRequest(
      identityId,
      delegatorKey,
    );
    expect(wr[0] + wr[1] + wr[2]).to.equal(0n);

    expect(await StakingStorage.getNodeStake(identityId)).to.equal(
      nodeStakeAfterReq + wAmt,
    );
    expect(await StakingStorage.getTotalStake()).to.equal(
      totalStakeAfterReq + wAmt,
    );
  });

  it('Should revert cancelWithdrawal if no request', async () => {
    const { identityId } = await createProfile();
    await expect(
      Staking.cancelWithdrawal(identityId),
    ).to.be.revertedWithCustomError(Staking, 'WithdrawalWasntInitiated');
  });

  it('Should distribute rewards correctly', async () => {
    const { identityId } = await createProfile(accounts[0], accounts[1], 20n);

    const stake = hre.ethers.parseEther('100');
    await Token.mint(accounts[0].address, stake);
    await Token.connect(accounts[0]).approve(await Staking.getAddress(), stake);
    await Staking.stake(identityId, stake);

    const reward = hre.ethers.parseEther('50');
    const feeExpected = (reward * 20n) / 100n;
    const delegatorShare = reward - feeExpected;

    await Token.mint(await StakingStorage.getAddress(), reward);

    const stakeBefore = await StakingStorage.getNodeStake(identityId);
    const idxBefore = await StakingStorage.getNodeRewardIndex(identityId);
    const totBefore = await StakingStorage.getTotalStake();

    await Staking.distributeRewards(identityId, reward);

    expect(await StakingStorage.getOperatorFeeBalance(identityId)).to.equal(
      feeExpected,
    );

    expect(await StakingStorage.getNodeStake(identityId)).to.equal(
      stakeBefore + delegatorShare,
    );

    const incExpected = (delegatorShare * 10n ** 18n) / stakeBefore;
    const idxAfter = await StakingStorage.getNodeRewardIndex(identityId);
    expect(idxAfter - idxBefore).to.equal(incExpected);

    expect(await StakingStorage.getTotalStake()).to.equal(
      totBefore + delegatorShare,
    );
  });

  it('Should restake operator fee', async () => {
    const { identityId } = await createProfile(accounts[0], accounts[1], 50n); // 50 %
    const stake = hre.ethers.parseEther('100');

    await Token.mint(accounts[0].address, stake);
    await Token.connect(accounts[0]).approve(await Staking.getAddress(), stake);
    await Staking.stake(identityId, stake);

    const reward = hre.ethers.parseEther('20'); // fee = 10
    await Token.mint(await StakingStorage.getAddress(), reward);
    await Staking.distributeRewards(identityId, reward);

    const feeBal = await StakingStorage.getOperatorFeeBalance(identityId);
    expect(feeBal).to.equal(reward / 2n);

    await expect(Staking.restakeOperatorFee(identityId, feeBal + 1n))
      .to.be.revertedWithCustomError(Staking, 'AmountExceedsOperatorFeeBalance')
      .withArgs(feeBal, feeBal + 1n);

    const restake = feeBal / 2n;
    const stakeBefore = await StakingStorage.getNodeStake(identityId);

    await Staking.restakeOperatorFee(identityId, restake);

    expect(await StakingStorage.getOperatorFeeBalance(identityId)).to.equal(
      feeBal - restake,
    );
    expect(await StakingStorage.getNodeStake(identityId)).to.equal(
      stakeBefore + restake,
    );
  });

  it('Should request operator fee withdrawal', async () => {
    const { identityId } = await createProfile(accounts[0], accounts[1], 50n);
    const stake = hre.ethers.parseEther('100');

    // ─── 1. stake some tokens ────────────────────────────────────────────
    await Token.mint(accounts[0].address, stake);
    await Token.connect(accounts[0]).approve(await Staking.getAddress(), stake);
    await Staking.stake(identityId, stake);

    // ─── 2. generate operator fee via reward distribution (fee = 10 ETH) ─
    const reward = hre.ethers.parseEther('20');
    await Token.mint(await StakingStorage.getAddress(), reward);
    await Staking.distributeRewards(identityId, reward);

    const feeBal = await StakingStorage.getOperatorFeeBalance(identityId);
    const withdraw = feeBal / 2n; // ask to withdraw half

    // ─── 3. capture block-time just *before* the TX ──────────────────────
    const latestTs = (await hre.ethers.provider.getBlock('latest'))!.timestamp; // <- non-null assertion
    const delay = await ParametersStorage.stakeWithdrawalDelay();
    const minExpected = BigInt(latestTs) + delay;

    // ─── 4. make the withdrawal request ──────────────────────────────────
    await Staking.requestOperatorFeeWithdrawal(identityId, withdraw);

    const req =
      await StakingStorage.getOperatorFeeWithdrawalRequest(identityId);
    expect(req[0]).to.equal(withdraw);
    expect(req[1]).to.equal(withdraw);

    // ♦ tolerate ±2 seconds around the theoretical release-time
    expect(req[2]).to.be.at.least(minExpected);
    expect(req[2]).to.be.at.most(minExpected + 2n);

    // balance decreased on storage side
    expect(await StakingStorage.getOperatorFeeBalance(identityId)).to.equal(
      feeBal - withdraw,
    );
  });

  it('Should finalize operator fee withdrawal', async () => {
    const { identityId } = await createProfile(accounts[0], accounts[1], 30n); // 30 %
    const stake = hre.ethers.parseEther('100');

    await Token.mint(accounts[0].address, stake);
    await Token.connect(accounts[0]).approve(await Staking.getAddress(), stake);
    await Staking.stake(identityId, stake);
    const reward = hre.ethers.parseEther('40'); // fee = 12
    await Token.mint(await StakingStorage.getAddress(), reward);
    await Staking.distributeRewards(identityId, reward);

    const feeBal = await StakingStorage.getOperatorFeeBalance(identityId);
    expect(feeBal).to.equal((reward * 30n) / 100n); // 12 ETH

    // ────────── 1) early finalize (negative path)
    await expect(
      Staking.finalizeOperatorFeeWithdrawal(identityId),
    ).to.be.revertedWithCustomError(Staking, 'WithdrawalWasntInitiated');

    // ────────── 2) happy path
    const withdraw = feeBal / 2n; // 6 ETH
    //const delay = await ParametersStorage.stakeWithdrawalDelay();
    await Staking.requestOperatorFeeWithdrawal(identityId, withdraw);

    const req =
      await StakingStorage.getOperatorFeeWithdrawalRequest(identityId);
    await time.increaseTo(req[2]); // skip delay

    const balBefore = await Token.balanceOf(accounts[0].address);
    await Staking.finalizeOperatorFeeWithdrawal(identityId);
    const balAfter = await Token.balanceOf(accounts[0].address);

    expect(balAfter - balBefore).to.equal(withdraw);
    expect(await StakingStorage.getOperatorFeeBalance(identityId)).to.equal(
      feeBal - withdraw,
    );

    const reqAfter =
      await StakingStorage.getOperatorFeeWithdrawalRequest(identityId);
    expect(reqAfter[0] + reqAfter[1] + reqAfter[2]).to.equal(0n);
  });

  it('Should cancel operator fee withdrawal', async () => {
    // create profile with 50 % operator fee
    const { identityId } = await createProfile(accounts[0], accounts[1], 50n);
    const stake = hre.ethers.parseEther('80');

    // stake some tokens
    await Token.mint(accounts[0].address, stake);
    await Token.connect(accounts[0]).approve(await Staking.getAddress(), stake);
    await Staking.stake(identityId, stake);

    // generate operator fee via reward distribution (fee = 10 ETH)
    const reward = hre.ethers.parseEther('20');
    await Token.mint(await StakingStorage.getAddress(), reward);
    await Staking.distributeRewards(identityId, reward);

    const feeBal = await StakingStorage.getOperatorFeeBalance(identityId);
    const withdraw = feeBal / 2n; // ask to withdraw half

    // make the withdrawal request
    await Staking.requestOperatorFeeWithdrawal(identityId, withdraw);

    // happy-path: cancel it
    await Staking.cancelOperatorFeeWithdrawal(identityId);
    expect(await StakingStorage.getOperatorFeeBalance(identityId)).to.equal(
      feeBal,
    ); // balance restored
    const rec =
      await StakingStorage.getOperatorFeeWithdrawalRequest(identityId);
    expect(rec[0] + rec[1] + rec[2]).to.equal(0n); // record wiped

    // negative-path: second cancel must revert
    await expect(
      Staking.cancelOperatorFeeWithdrawal(identityId),
    ).to.be.revertedWithCustomError(Staking, 'WithdrawalWasntInitiated');
  });

  it('Should revert if non-admin tries to restake operator fee or request operator fee withdrawal', async () => {
    const { identityId } = await createProfile();
    await expect(
      Staking.connect(accounts[1]).restakeOperatorFee(identityId, 100),
    ).to.be.reverted;
    await expect(
      Staking.connect(accounts[1]).requestOperatorFeeWithdrawal(
        identityId,
        100,
      ),
    ).to.be.reverted;
  });

  it('Should revert stake, requestWithdrawal, etc. on a non-existent profile', async () => {
    await expect(Staking.stake(9999, 100)).to.be.revertedWithCustomError(
      Staking,
      'ProfileDoesntExist',
    );
    await expect(
      Staking.requestWithdrawal(9999, 50),
    ).to.be.revertedWithCustomError(Staking, 'ProfileDoesntExist');
    await expect(
      Staking.finalizeWithdrawal(9999),
    ).to.be.revertedWithCustomError(Staking, 'ProfileDoesntExist');
    await expect(Staking.cancelWithdrawal(9999)).to.be.revertedWithCustomError(
      Staking,
      'ProfileDoesntExist',
    );
  });

  it('Should simulateStakeInfoUpdate correctly', async () => {
    const { identityId } = await createProfile();
    const stake0 = hre.ethers.parseEther('100');
    // stake 100 ETH
    await Token.mint(accounts[0].address, stake0);
    await Token.connect(accounts[0]).approve(
      await Staking.getAddress(),
      stake0,
    );
    await Staking.stake(identityId, stake0);

    const dKey = hre.ethers.keccak256(
      hre.ethers.solidityPacked(['address'], [accounts[0].address]),
    );
    // send a reward with 0 % fee so math is simple
    const reward = hre.ethers.parseEther('20');
    await Token.mint(await StakingStorage.getAddress(), reward);
    await Staking.distributeRewards(identityId, reward);
    // manual expectation
    const incIndex = (reward * 10n ** 18n) / stake0;
    const expectedUnrealized = (stake0 * incIndex) / 10n ** 18n;
    // call the view helper
    const [base, indexed, unrealized] = await Staking.simulateStakeInfoUpdate(
      identityId,
      dKey,
    );
    // check base + indexed + unrealized math
    expect(unrealized).to.equal(expectedUnrealized);
    expect(base + indexed).to.equal(stake0 + expectedUnrealized);
  });

  it('Full scenario: Multiple nodes, delegators, operator fees, redelegations, partial withdrawals, cancellations, rewards', async () => {
    console.log('--- START FULL SCENARIO TEST ---');

    const admin1 = accounts[0];
    const op1 = accounts[1];
    const admin2 = accounts[2];
    const op2 = accounts[3];

    console.log('Creating Node A with operator fee = 20%');
    const NodeA = await createProfile(admin1, op1, 20n);
    console.log(`NodeA ID: ${NodeA.identityId}, operator fee: 20%`);

    console.log('Creating Node B with operator fee = 50%');
    const NodeB = await createProfile(admin2, op2, 50n);
    console.log(`NodeB ID: ${NodeB.identityId}, operator fee: 50%`);

    const nodes = {
      [NodeA.identityId]: 'A',
      [NodeB.identityId]: 'B',
    };

    const d1 = accounts[4];
    const d2 = accounts[5];
    const d3 = accounts[6];
    const d4 = accounts[7];

    const delegators = {
      [d1.address]: 'd1',
      [d2.address]: 'd2',
      [d3.address]: 'd3',
      [d4.address]: 'd4',
    };

    const delay = await ParametersStorage.stakeWithdrawalDelay();
    const minStake = await ParametersStorage.minimumStake();
    const maxStake = await ParametersStorage.maximumStake();
    const toEth = (amount: bigint) => Number(amount) / 1e18;

    const logNodeData = async (identityId: number) => {
      const [
        stake,
        rewardIndex,
        cEarned,
        cPaid,
        opFeeBal,
        opFeeEarned,
        opFeePaid,
        dCount,
      ] = await StakingStorage.getNodeData(identityId);
      console.log('----------------------------------------------------------');
      console.log(`Node${nodes[identityId]} Data:
        Stake: ${toEth(BigInt(stake))} ETH,
        RewardIndex: ${rewardIndex},
        CumulativeEarnedRewards: ${toEth(BigInt(cEarned))} ETH,
        CumulativePaidOutRewards: ${toEth(BigInt(cPaid))} ETH,
        OperatorFeeBalance: ${toEth(BigInt(opFeeBal))} ETH,
        OperatorFeeCumulativeEarnedRewards: ${toEth(BigInt(opFeeEarned))} ETH,
        OperatorFeeCumulativePaidOutRewards: ${toEth(BigInt(opFeePaid))} ETH,
        DelegatorCount: ${dCount}`);
      console.log('----------------------------------------------------------');
    };

    const logDelegatorData = async (
      identityId: number,
      delegator: SignerWithAddress,
    ) => {
      const dKey = hre.ethers.keccak256(
        hre.ethers.solidityPacked(['address'], [delegator.address]),
      );
      const [dBase, dIndexed, dLastIndex, dEarned, dPaid] =
        await StakingStorage.getDelegatorData(identityId, dKey);
      console.log('----------------------------------------------------------');
      console.log(`Delegator ${delegators[delegator.address]} on Node${nodes[identityId]}:
        BaseStake: ${toEth(BigInt(dBase))} ETH,
        IndexedStake: ${toEth(BigInt(dIndexed))} ETH,
        LastRewardIndex: ${dLastIndex},
        CumulativeEarnedRewards: ${toEth(BigInt(dEarned))} ETH,
        CumulativePaidOutRewards: ${toEth(BigInt(dPaid))} ETH`);
      console.log('----------------------------------------------------------');
    };

    console.log(
      `Minimum stake: ${toEth(minStake)} ETH, Maximum stake: ${toEth(maxStake)} ETH, Delay: ${delay}s`,
    );

    const stakeA = minStake * 2n;
    console.log(`Minting ${toEth(stakeA)} ETH to d1 and staking on NodeA`);
    await Token.mint(d1.address, stakeA);
    await Token.connect(d1).approve(Staking.getAddress(), stakeA);
    console.log(`d1 stakes ${toEth(stakeA)} ETH on NodeA`);
    await Staking.connect(d1).stake(NodeA.identityId, stakeA);

    await logNodeData(NodeA.identityId);
    await logDelegatorData(NodeA.identityId, d1);

    const stakeB = minStake - 1n;
    console.log(
      `Minting ${toEth(stakeB)} ETH to d3 and staking on NodeB (just below min)`,
    );
    await Token.mint(d3.address, stakeB);
    await Token.connect(d3).approve(Staking.getAddress(), stakeB);
    console.log(`d3 stakes ${toEth(stakeB)} ETH on NodeB`);
    await Staking.connect(d3).stake(NodeB.identityId, stakeB);

    await logNodeData(NodeB.identityId);
    await logDelegatorData(NodeB.identityId, d3);

    console.log('Distributing 100 tokens reward to NodeA');
    const rewardA1 = hre.ethers.parseEther('100');
    await Token.mint(StakingStorage.getAddress(), rewardA1);
    console.log(`Distributing reward: ${toEth(rewardA1)} ETH to NodeA`);
    await Staking.distributeRewards(NodeA.identityId, rewardA1);

    await logNodeData(NodeA.identityId);
    await logDelegatorData(NodeA.identityId, d1);

    const partialWithdraw = hre.ethers.parseEther('10');
    console.log(
      `d1 requests withdrawal of ${toEth(partialWithdraw)} ETH from NodeA`,
    );
    await Staking.connect(d1).requestWithdrawal(
      NodeA.identityId,
      partialWithdraw,
    );
    await time.increase(Number(delay));

    const d1BalanceBefore = await Token.balanceOf(d1.address);
    console.log(
      `Finalizing withdrawal for d1. d1 balance before: ${toEth(d1BalanceBefore)} ETH`,
    );
    await Staking.connect(d1).finalizeWithdrawal(NodeA.identityId);
    const d1BalanceAfter = await Token.balanceOf(d1.address);
    console.log(
      `Withdrawal finalized. d1 balance after: ${toEth(d1BalanceAfter)} ETH, diff: ${toEth(d1BalanceAfter - d1BalanceBefore)} ETH`,
    );

    await logNodeData(NodeA.identityId);
    await logDelegatorData(NodeA.identityId, d1);

    console.log('d2 increases stake on NodeA so it has more to redelegate');
    await Token.mint(d2.address, minStake);
    await Token.connect(d2).approve(Staking.getAddress(), minStake);
    console.log(`d2 stakes ${toEth(minStake)} ETH on NodeA`);
    await Staking.connect(d2).stake(NodeA.identityId, minStake);

    await logNodeData(NodeA.identityId);
    await logDelegatorData(NodeA.identityId, d2);

    const nodeBCurrentStake = await StakingStorage.getNodeStake(
      NodeB.identityId,
    );
    const neededForMin = minStake - nodeBCurrentStake;
    console.log(
      `Redelegating from NodeA to NodeB by d2, needed for min: ${toEth(neededForMin)} ETH`,
    );
    await Staking.connect(d2).redelegate(
      NodeA.identityId,
      NodeB.identityId,
      neededForMin,
    );

    await logNodeData(NodeA.identityId);
    await logNodeData(NodeB.identityId);
    await logDelegatorData(NodeA.identityId, d2);
    // For brevity, not logging all delegators after every single operation,
    // but in practice, do it for all delegators to ensure full overview.

    console.log('Distributing 200 tokens reward to NodeB with 50% fee');
    const rewardB1 = hre.ethers.parseEther('200');
    await Token.mint(StakingStorage.getAddress(), rewardB1);
    console.log(`Distributing reward: ${toEth(rewardB1)} ETH to NodeB`);
    await Staking.distributeRewards(NodeB.identityId, rewardB1);

    await logNodeData(NodeB.identityId);

    const d3Key = hre.ethers.keccak256(
      hre.ethers.solidityPacked(['address'], [d3.address]),
    );
    const [d3BaseB, d3IndexedB] = await StakingStorage.getDelegatorStakeInfo(
      NodeB.identityId,
      d3Key,
    );
    const d3TotalB = d3BaseB + d3IndexedB;
    const largeWithdraw = d3TotalB / 2n;
    console.log(
      `d3 tries to withdraw large amount: ${toEth(largeWithdraw)} ETH from NodeB`,
    );
    await Staking.connect(d3).requestWithdrawal(
      NodeB.identityId,
      largeWithdraw,
    );

    await logDelegatorData(NodeB.identityId, d3);

    console.log('d3 cancels withdrawal before finalizing');
    await Staking.connect(d3).cancelWithdrawal(NodeB.identityId);
    const canceledReq = await StakingStorage.getDelegatorWithdrawalRequest(
      NodeB.identityId,
      d3Key,
    );
    console.log(
      `Withdrawal request for d3 after cancel: ${canceledReq[0]} (should be 0)`,
    );

    await logDelegatorData(NodeB.identityId, d3);

    console.log('Operator fee withdrawal on NodeA');
    const operatorFeeBalanceBefore = await StakingStorage.getOperatorFeeBalance(
      NodeA.identityId,
    );
    const opFeeWithdrawAmount = operatorFeeBalanceBefore / 2n;
    console.log(
      `Requesting operator fee withdrawal on NodeA: ${toEth(opFeeWithdrawAmount)} ETH from total ${toEth(operatorFeeBalanceBefore)} ETH`,
    );
    await Staking.connect(admin1).requestOperatorFeeWithdrawal(
      NodeA.identityId,
      opFeeWithdrawAmount,
    );
    await time.increase(Number(delay));
    const admin1BalanceBefore = await Token.balanceOf(admin1.address);
    console.log(
      `Finalizing operator fee withdrawal for NodeA. admin1 balance before: ${toEth(admin1BalanceBefore)} ETH`,
    );
    await Staking.connect(admin1).finalizeOperatorFeeWithdrawal(
      NodeA.identityId,
    );
    const admin1BalanceAfter = await Token.balanceOf(admin1.address);
    console.log(
      `Operator fee withdrawal finalized. admin1 balance after: ${toEth(admin1BalanceAfter)} ETH, diff: ${toEth(admin1BalanceAfter - admin1BalanceBefore)} ETH`,
    );

    await logNodeData(NodeA.identityId);

    console.log('Operator tries to restake operator fee on NodeB');
    const operatorFeeBalanceB = await StakingStorage.getOperatorFeeBalance(
      NodeB.identityId,
    );
    console.log(
      `Operator fee balance on NodeB: ${toEth(operatorFeeBalanceB)} ETH`,
    );
    if (operatorFeeBalanceB > 0n) {
      const restakeAmount =
        operatorFeeBalanceB < hre.ethers.parseEther('10')
          ? operatorFeeBalanceB
          : hre.ethers.parseEther('10');
      console.log(
        `Restaking ${toEth(restakeAmount)} ETH operator fee on NodeB`,
      );
      await Staking.connect(admin2).restakeOperatorFee(
        NodeB.identityId,
        restakeAmount,
      );
      const nodeBStakeAfterRestake = await StakingStorage.getNodeStake(
        NodeB.identityId,
      );
      console.log(
        `NodeB stake after restake: ${toEth(nodeBStakeAfterRestake)} ETH, should be >= minStake`,
      );
    }

    console.log('d4 stakes on NodeB to push it close to max');
    const nodeBStakeNow = await StakingStorage.getNodeStake(NodeB.identityId);
    const pushToMax = maxStake - nodeBStakeNow;
    console.log(`Amount to push NodeB close to max: ${toEth(pushToMax)} ETH`);
    if (pushToMax > 0n) {
      const stakeD4 = pushToMax / 2n;
      console.log(`Minting ${toEth(stakeD4)} ETH to d4`);
      await Token.mint(d4.address, stakeD4);
      await Token.connect(d4).approve(Staking.getAddress(), stakeD4);
      console.log(`d4 stakes ${toEth(stakeD4)} ETH on NodeB`);
      await Staking.connect(d4).stake(NodeB.identityId, stakeD4);
      console.log(
        `NodeB stake after d4 stakes: ${toEth(await StakingStorage.getNodeStake(NodeB.identityId))} ETH`,
      );
    }

    const d1Key = hre.ethers.keccak256(
      hre.ethers.solidityPacked(['address'], [d1.address]),
    );
    const [d1BaseA, d1IndexedA] = await StakingStorage.getDelegatorStakeInfo(
      NodeA.identityId,
      d1Key,
    );
    const d1TotalA = d1BaseA + d1IndexedA;
    const bigRedelegateAmount = d1TotalA > minStake ? minStake : d1TotalA;
    console.log(
      `d1 tries big redelegation from NodeA to NodeB: ${toEth(bigRedelegateAmount)} ETH`,
    );
    const nodeBStakeFinalCheck = await StakingStorage.getNodeStake(
      NodeB.identityId,
    );
    if (nodeBStakeFinalCheck + bigRedelegateAmount > maxStake) {
      console.log('This would exceed maximum stake on NodeB, expecting revert');
      await expect(
        Staking.connect(d1).redelegate(
          NodeA.identityId,
          NodeB.identityId,
          bigRedelegateAmount,
        ),
      ).to.be.reverted;
    }

    console.log('d1 does a small redelegation below max limit');
    const safeAmount =
      (maxStake - (await StakingStorage.getNodeStake(NodeB.identityId))) / 2n;
    if (safeAmount > 0n && safeAmount <= d1TotalA) {
      console.log(
        `Redelegating ${toEth(safeAmount)} ETH from NodeA to NodeB by d1`,
      );
      await Staking.connect(d1).redelegate(
        NodeA.identityId,
        NodeB.identityId,
        safeAmount,
      );
      const nodeBStakeFinal = await StakingStorage.getNodeStake(
        NodeB.identityId,
      );
      console.log(
        `NodeB stake after safe redelegation: ${toEth(nodeBStakeFinal)} ETH, should be < maxStake`,
      );
    }

    // Validate that no negative values appear, node stakes are consistent:
    const nodeAStakeFinal = await StakingStorage.getNodeStake(NodeA.identityId);
    const nodeBStakeFinal2 = await StakingStorage.getNodeStake(
      NodeB.identityId,
    );
    console.log(
      `Final NodeA stake: ${toEth(nodeAStakeFinal)} ETH, Final NodeB stake: ${toEth(nodeBStakeFinal2)} ETH`,
    );
    expect(nodeAStakeFinal).to.be.at.least(0n);
    expect(nodeBStakeFinal2).to.be.at.least(0n);
    const totalStakeStorage = await StakingStorage.getTotalStake();
    const nodeAStakeEnd = await StakingStorage.getNodeStake(NodeA.identityId);
    const nodeBStakeEnd = await StakingStorage.getNodeStake(NodeB.identityId);
    expect(totalStakeStorage).to.equal(nodeAStakeEnd + nodeBStakeEnd);

    const tableLimit = await ParametersStorage.shardingTableSizeLimit();
    expect(await ShardingTableStorage.nodesCount()).to.be.at.most(tableLimit);

    console.log('--- END FULL SCENARIO TEST ---');
  });

  it('Stress test: Rapid stake/un-stake cycles, redelegations, operator fee changes, trying to break invariants', async () => {
    console.log('--- START STRESS TEST SCENARIO ---');
    // Track user balances and stakes
    let d1Balance = 0n;
    let d2Balance = 0n;
    let opFeeBalanceB = 0n;

    const admin1 = accounts[0];
    const op1 = accounts[1];
    const admin2 = accounts[2];
    const op2 = accounts[3];

    const NodeA = await createProfile(admin1, op1, 10n);
    console.log(`NodeA ID: ${NodeA.identityId}, fee: 10%`);
    const NodeB = await createProfile(admin2, op2, 90n);
    console.log(`NodeB ID: ${NodeB.identityId}, fee: 90%`);

    const nodes = {
      [NodeA.identityId]: 'A',
      [NodeB.identityId]: 'B',
    };

    const d1 = accounts[4];
    const d2 = accounts[5];
    const d3 = accounts[6];

    const delegators = {
      [d1.address]: 'd1',
      [d2.address]: 'd2',
      [d3.address]: 'd3',
    };

    const delay = await ParametersStorage.stakeWithdrawalDelay();
    const minStake = await ParametersStorage.minimumStake();
    const maxStake = await ParametersStorage.maximumStake();
    const toEth = (amount: bigint) => Number(amount) / 1e18;

    const logNodeData = async (identityId: number) => {
      const [
        stake,
        rewardIndex,
        cEarned,
        cPaid,
        opFeeBal,
        opFeeEarned,
        opFeePaid,
        dCount,
      ] = await StakingStorage.getNodeData(identityId);
      console.log('----------------------------------------------------------');
      console.log(`Node${nodes[identityId]} Data:
        Stake: ${toEth(BigInt(stake))} ETH,
        RewardIndex: ${rewardIndex},
        CumulativeEarnedRewards: ${toEth(BigInt(cEarned))} ETH,
        CumulativePaidOutRewards: ${toEth(BigInt(cPaid))} ETH,
        OperatorFeeBalance: ${toEth(BigInt(opFeeBal))} ETH,
        OperatorFeeCumulativeEarnedRewards: ${toEth(BigInt(opFeeEarned))} ETH,
        OperatorFeeCumulativePaidOutRewards: ${toEth(BigInt(opFeePaid))} ETH,
        DelegatorCount: ${dCount}`);
      console.log('----------------------------------------------------------');
    };

    const logDelegatorData = async (
      identityId: number,
      delegator: SignerWithAddress,
    ) => {
      const dKey = hre.ethers.keccak256(
        hre.ethers.solidityPacked(['address'], [delegator.address]),
      );
      const [dBase, dIndexed, dLastIndex, dEarned, dPaid] =
        await StakingStorage.getDelegatorData(identityId, dKey);
      console.log('----------------------------------------------------------');
      console.log(`Delegator ${delegators[delegator.address]} on Node${nodes[identityId]}:
        BaseStake: ${toEth(BigInt(dBase))} ETH,
        IndexedStake: ${toEth(BigInt(dIndexed))} ETH,
        LastRewardIndex: ${dLastIndex},
        CumulativeEarnedRewards: ${toEth(BigInt(dEarned))} ETH,
        CumulativePaidOutRewards: ${toEth(BigInt(dPaid))} ETH`);
      console.log('----------------------------------------------------------');
    };

    console.log(
      `MinStake: ${toEth(minStake)} ETH, MaxStake: ${toEth(maxStake)} ETH, Delay: ${delay}s`,
    );

    const mintAmountD1 = maxStake * 2n;
    await Token.mint(d1.address, mintAmountD1);
    d1Balance += mintAmountD1;
    console.log(`d1 initial minted balance: ${toEth(d1Balance)} ETH`);
    await Token.connect(d1).approve(Staking.getAddress(), mintAmountD1);

    const stakeA = minStake + 10n;
    console.log(`d1 stakes ${toEth(stakeA)} ETH on NodeA`);
    await Staking.connect(d1).stake(NodeA.identityId, stakeA);
    d1Balance -= stakeA;

    await logNodeData(NodeA.identityId);
    await logDelegatorData(NodeA.identityId, d1);

    console.log(`d1 requests full withdrawal: ${toEth(stakeA)} ETH from NodeA`);
    await Staking.connect(d1).requestWithdrawal(NodeA.identityId, stakeA);
    await expect(Staking.connect(d1).finalizeWithdrawal(NodeA.identityId)).to.be
      .reverted;
    console.log('Early finalize reverted as expected');
    await time.increase(Number(delay));
    const d1BeforeFinal = await Token.balanceOf(d1.address);
    console.log(`d1 before finalizing: ${toEth(d1BeforeFinal)} ETH`);
    await Staking.connect(d1).finalizeWithdrawal(NodeA.identityId);
    const d1AfterFinal = await Token.balanceOf(d1.address);
    const withdrawn = d1AfterFinal - d1BeforeFinal;
    d1Balance += withdrawn;
    console.log(
      `d1 got back ${toEth(withdrawn)} ETH, balance now: ${toEth(d1Balance)} ETH`,
    );

    await logNodeData(NodeA.identityId);
    await logDelegatorData(NodeA.identityId, d1);

    if (minStake > d1Balance)
      throw new Error('Not enough balance for d1 to restake');
    console.log(`d1 stakes again ${toEth(minStake)} ETH on NodeA`);
    await Staking.connect(d1).stake(NodeA.identityId, minStake);
    d1Balance -= minStake;

    await logNodeData(NodeA.identityId);
    await logDelegatorData(NodeA.identityId, d1);

    const d1Key = hre.ethers.keccak256(
      hre.ethers.solidityPacked(['address'], [d1.address]),
    );
    let [d1BaseA, d1IndexedA] = await StakingStorage.getDelegatorStakeInfo(
      NodeA.identityId,
      d1Key,
    );
    let d1TotalA = d1BaseA + d1IndexedA;
    console.log(`d1 total stake on NodeA: ${toEth(d1TotalA)} ETH`);
    await expect(
      Staking.connect(d1).redelegate(
        NodeA.identityId,
        NodeB.identityId,
        d1TotalA + 1n,
      ),
    ).to.be.reverted;
    console.log('Redelegation exceeding stake reverted as expected');

    const nodeBStakeBefore = await StakingStorage.getNodeStake(
      NodeB.identityId,
    );
    const redelegateAmount = minStake - nodeBStakeBefore - 1n;
    const safeRedelegate =
      redelegateAmount > d1TotalA ? d1TotalA : redelegateAmount;
    console.log(
      `d1 redelegates ${toEth(safeRedelegate)} ETH from NodeA to NodeB`,
    );
    await Staking.connect(d1).redelegate(
      NodeA.identityId,
      NodeB.identityId,
      safeRedelegate,
    );
    await logNodeData(NodeB.identityId);
    await logDelegatorData(NodeB.identityId, d1);

    await Token.mint(d2.address, minStake);
    d2Balance += minStake;
    console.log(`d2 minted balance: ${toEth(d2Balance)} ETH`);
    await Token.connect(d2).approve(Staking.getAddress(), minStake);
    console.log(`d2 stakes ${toEth(minStake)} ETH on NodeB`);
    await Staking.connect(d2).stake(NodeB.identityId, minStake);
    d2Balance -= minStake;

    await logNodeData(NodeB.identityId);
    await logDelegatorData(NodeB.identityId, d2);

    const hugeRewardB = hre.ethers.parseEther('5000000');
    console.log(`Distributing huge reward: ${toEth(hugeRewardB)} ETH to NodeB`);
    await Token.mint(StakingStorage.getAddress(), hugeRewardB);
    await Staking.distributeRewards(NodeB.identityId, hugeRewardB);
    opFeeBalanceB = await StakingStorage.getOperatorFeeBalance(
      NodeB.identityId,
    );
    console.log(`Operator fee on NodeB: ${toEth(opFeeBalanceB)} ETH`);
    await expect(
      Staking.connect(admin2).restakeOperatorFee(
        NodeB.identityId,
        opFeeBalanceB,
      ),
    ).to.be.reverted;
    console.log('Exceed max restake reverted as expected');

    const nodeBStake = await StakingStorage.getNodeStake(NodeB.identityId);
    const partialRestake =
      maxStake > nodeBStake ? (maxStake - nodeBStake) / 2n : 0n;
    const safePartialRestake =
      partialRestake > opFeeBalanceB ? opFeeBalanceB : partialRestake;
    if (safePartialRestake > 0n) {
      console.log(`Restaking partial fee: ${toEth(safePartialRestake)} ETH`);
      await Staking.connect(admin2).restakeOperatorFee(
        NodeB.identityId,
        safePartialRestake,
      );
      opFeeBalanceB -= safePartialRestake;
    }

    console.log(`d1 stakes again minStake+10 ETH on NodeA`);
    if (minStake + 10n > d1Balance)
      throw new Error('Not enough balance for d1');
    await Staking.connect(d1).stake(NodeA.identityId, minStake + 10n);
    d1Balance -= minStake + 10n;
    [d1BaseA, d1IndexedA] = await StakingStorage.getDelegatorStakeInfo(
      NodeA.identityId,
      d1Key,
    );
    d1TotalA = d1BaseA + d1IndexedA;
    console.log(
      `d1 total stake now: ${toEth(d1TotalA)} ETH, balance: ${toEth(d1Balance)} ETH`,
    );

    const firstReq = d1TotalA / 2n;
    console.log(`d1 requests withdrawal: ${toEth(firstReq)} ETH from NodeA`);
    await Staking.connect(d1).requestWithdrawal(NodeA.identityId, firstReq);

    const secondReq = d1TotalA / 4n;
    console.log(
      `d1 requests another withdrawal: ${toEth(secondReq)} ETH from NodeA`,
    );
    await expect(
      Staking.connect(d1).requestWithdrawal(NodeA.identityId, secondReq),
    ).to.not.be.reverted;
    console.log('Multiple overlapping requests done');

    console.log('No operator fee request on NodeA, try finalize anyway');
    await expect(
      Staking.connect(admin1).finalizeOperatorFeeWithdrawal(NodeA.identityId),
    ).to.be.reverted;
    console.log('Reverted as expected');

    const d2Key = hre.ethers.keccak256(
      hre.ethers.solidityPacked(['address'], [d2.address]),
    );
    const [d2BaseB, d2IndexedB] = await StakingStorage.getDelegatorStakeInfo(
      NodeB.identityId,
      d2Key,
    );
    const d2TotalStakeOnB = d2BaseB + d2IndexedB;
    const d2WithdrawReq = d2TotalStakeOnB / 4n;
    console.log(
      `d2 requests ${toEth(d2WithdrawReq)} ETH withdrawal from NodeB`,
    );
    await Staking.connect(d2).requestWithdrawal(
      NodeB.identityId,
      d2WithdrawReq,
    );
    await expect(
      Staking.connect(d2).finalizeWithdrawal(NodeB.identityId),
    ).to.be.revertedWithCustomError(Staking, 'WithdrawalPeriodPending');
    console.log('Too early finalize reverted');
    console.log('d2 cancels withdrawal');
    await Staking.connect(d2).cancelWithdrawal(NodeB.identityId);
    await expect(
      Staking.connect(d2).cancelWithdrawal(NodeB.identityId),
    ).to.be.revertedWithCustomError(Staking, 'WithdrawalWasntInitiated');
    console.log('Second cancel reverted as expected');

    console.log('d3 never staked on NodeA, tries withdrawing 100 ETH');
    await expect(Staking.connect(d3).requestWithdrawal(NodeA.identityId, 100n))
      .to.be.reverted;
    console.log('No stake withdrawal reverted as expected');

    const halfD2StakeB =
      (await StakingStorage.getNodeStake(NodeB.identityId)) / 5n;
    console.log(
      `d2 requests 20% stake withdrawal on NodeB: ${toEth(halfD2StakeB)} ETH`,
    );
    await Staking.connect(d2).requestWithdrawal(NodeB.identityId, halfD2StakeB);
    await time.increase(Number(delay));
    const d2BeforeFinal = await Token.balanceOf(d2.address);
    console.log(
      `Finalizing large d2 withdrawal. Before: ${toEth(d2BeforeFinal)} ETH`,
    );
    await Staking.connect(d2).finalizeWithdrawal(NodeB.identityId);
    const d2AfterFinal = await Token.balanceOf(d2.address);
    d2Balance += d2AfterFinal - d2BeforeFinal;
    console.log(
      `d2 after final: ${toEth(d2AfterFinal)} ETH, gained: ${toEth(d2AfterFinal - d2BeforeFinal)} ETH, d2Balance: ${toEth(d2Balance)} ETH`,
    );

    if ((await ShardingTableStorage.nodeExists(NodeB.identityId)) === false) {
      const [d2BaseB2, d2IndexedB2] =
        await StakingStorage.getDelegatorStakeInfo(NodeB.identityId, d2Key);
      const d2TotalB = d2BaseB2 + d2IndexedB2;
      console.log(`NodeB out of table, d2 totalB: ${toEth(d2TotalB)} ETH`);
      if (d2TotalB > 0) {
        console.log(
          `d2 redelegates ${toEth(d2TotalB)} ETH from NodeB to NodeA`,
        );
        await expect(
          Staking.connect(d2).redelegate(
            NodeB.identityId,
            NodeA.identityId,
            d2TotalB,
          ),
        ).to.not.be.reverted;
      }
    }

    // Validate no negative values:
    const finalNodeAStake = await StakingStorage.getNodeStake(NodeA.identityId);
    const finalNodeBStake = await StakingStorage.getNodeStake(NodeB.identityId);
    expect(finalNodeAStake).to.be.gte(0n);
    expect(finalNodeBStake).to.be.gte(0n);
    const totalStake = await StakingStorage.getTotalStake();
    const stakeAEnd = await StakingStorage.getNodeStake(NodeA.identityId);
    const stakeBEnd = await StakingStorage.getNodeStake(NodeB.identityId);
    expect(totalStake).to.equal(stakeAEnd + stakeBEnd);

    const limit = await ParametersStorage.shardingTableSizeLimit();
    expect(await ShardingTableStorage.nodesCount()).to.be.at.most(limit);
    console.log('--- END STRESS TEST SCENARIO ---');
  });
});
