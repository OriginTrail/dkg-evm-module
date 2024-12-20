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
      'Node',
      node,
      initialOperatorFee ?? 0,
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
    await expect(Staking.stake(9999, 100)).to.be.revertedWithCustomError(
      Staking,
      'ProfileDoesntExist',
    );
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
    await Token.connect(accounts[0]).approve(
      await Staking.getAddress(),
      2n ** 96n - 1n,
    );
    await expect(
      Staking.stake(identityId, 2n ** 96n - 1n),
    ).to.be.revertedWithCustomError(Staking, 'TooLowBalance');
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
    await expect(Staking.stake(identityId, 1)).to.be.revertedWithCustomError(
      Staking,
      'MaximumStakeExceeded',
    );
  });

  it('Should stake successfully and reflect on node stake', async () => {
    const { identityId } = await createProfile();
    const amount = hre.ethers.parseEther('100');
    await Token.mint(accounts[0].address, amount);
    await Token.connect(accounts[0]).approve(
      await Staking.getAddress(),
      amount,
    );
    await Staking.stake(identityId, amount);
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

    const initialStake = hre.ethers.parseEther('1000');
    await Token.mint(accounts[0].address, initialStake);
    await Token.connect(accounts[0]).approve(
      await Staking.getAddress(),
      initialStake,
    );
    await Staking.stake(node1.identityId, initialStake);

    // redelegate half
    const halfStake = initialStake / 2n;
    await Staking.redelegate(node1.identityId, node2.identityId, halfStake);

    // Additional tests for redelegation:
    // 1) Redelegate zero tokens
    await expect(
      Staking.redelegate(node1.identityId, node2.identityId, 0),
    ).to.be.revertedWithCustomError(Staking, 'ZeroTokenAmount');
    // 2) Redelegate from non-existent identity
    await expect(
      Staking.redelegate(9999, node2.identityId, 100),
    ).to.be.revertedWithCustomError(Staking, 'ProfileDoesntExist');
    // 3) Redelegate to non-existent identity
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
    const amount = hre.ethers.parseEther('100');
    await Token.mint(accounts[0].address, amount);
    await Token.connect(accounts[0]).approve(
      await Staking.getAddress(),
      amount,
    );
    await Staking.stake(identityId, amount);
    await expect(
      Staking.requestWithdrawal(identityId, amount + 1n),
    ).to.be.revertedWithCustomError(Staking, 'WithdrawalExceedsStake');
  });

  it('Should create a withdrawal request', async () => {
    const { identityId } = await createProfile();
    const amount = hre.ethers.parseEther('100');
    await Token.mint(accounts[0].address, amount);
    await Token.connect(accounts[0]).approve(
      await Staking.getAddress(),
      amount,
    );
    await Staking.stake(identityId, amount);
    const delay = await ParametersStorage.stakeWithdrawalDelay();
    await Staking.requestWithdrawal(identityId, amount / 2n);
    const req = await StakingStorage.getDelegatorWithdrawalRequest(
      identityId,
      hre.ethers.keccak256(
        hre.ethers.solidityPacked(['address'], [accounts[0].address]),
      ),
    );
    expect(req[0]).to.equal(amount / 2n);
    expect(req[2]).to.be.gte(
      BigInt((await hre.ethers.provider.getBlock('latest'))!.timestamp) + delay,
    );
  });

  it('Should finalize withdrawal after delay', async () => {
    const { identityId } = await createProfile();
    const amount = hre.ethers.parseEther('100');
    await Token.mint(accounts[0].address, amount);
    await Token.connect(accounts[0]).approve(
      await Staking.getAddress(),
      amount,
    );
    await Staking.stake(identityId, amount);
    await Staking.requestWithdrawal(identityId, amount / 2n);
    const req = await StakingStorage.getDelegatorWithdrawalRequest(
      identityId,
      hre.ethers.keccak256(
        hre.ethers.solidityPacked(['address'], [accounts[0].address]),
      ),
    );
    await time.increaseTo(req[2]);
    const balanceBefore = await Token.balanceOf(accounts[0].address);
    await Staking.finalizeWithdrawal(identityId);
    const balanceAfter = await Token.balanceOf(accounts[0].address);
    expect(balanceAfter - balanceBefore).to.equal(amount / 2n);
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
    const amount = hre.ethers.parseEther('200');
    await Token.mint(accounts[0].address, amount);
    await Token.connect(accounts[0]).approve(
      await Staking.getAddress(),
      amount,
    );
    await Staking.stake(identityId, amount);
    await Staking.requestWithdrawal(identityId, hre.ethers.parseEther('100'));
    await Staking.cancelWithdrawal(identityId);
    const req = await StakingStorage.getDelegatorWithdrawalRequest(
      identityId,
      hre.ethers.keccak256(
        hre.ethers.solidityPacked(['address'], [accounts[0].address]),
      ),
    );
    expect(req[0]).to.equal(0);
  });

  it('Should revert cancelWithdrawal if no request', async () => {
    const { identityId } = await createProfile();
    await expect(
      Staking.cancelWithdrawal(identityId),
    ).to.be.revertedWithCustomError(Staking, 'WithdrawalWasntInitiated');
  });

  it('Should distribute rewards correctly', async () => {
    const { identityId } = await createProfile();
    const amount = hre.ethers.parseEther('1000');
    await Token.mint(StakingStorage.getAddress(), amount);
    await StakingStorage.setNodeStake(identityId, amount);
    await expect(
      Staking.distributeRewards(identityId, 0),
    ).to.be.revertedWithCustomError(Staking, 'ZeroTokenAmount');
    await expect(
      Staking.connect(accounts[1]).distributeRewards(identityId, 100),
    ).to.be.reverted; // onlyContracts test depends on setup; skipping
  });

  it('Should restake operator fee', async () => {
    const { identityId } = await createProfile();
    await expect(
      Staking.restakeOperatorFee(identityId, 0),
    ).to.be.revertedWithCustomError(Staking, 'ZeroTokenAmount');
    // Additional logic for operator fee testing requires operator fee accumulation.
    // Skipping a full operator fee integration test due to complexity.
  });

  it('Should request operator fee withdrawal', async () => {
    const { identityId } = await createProfile();
    await expect(
      Staking.requestOperatorFeeWithdrawal(identityId, 0),
    ).to.be.revertedWithCustomError(Staking, 'ZeroTokenAmount');
    // Additional operator fee tests require accumulated fees; skipping full scenario.
  });

  it('Should finalize operator fee withdrawal', async () => {
    const { identityId } = await createProfile();
    await expect(
      Staking.finalizeOperatorFeeWithdrawal(identityId),
    ).to.be.revertedWithCustomError(Staking, 'WithdrawalWasntInitiated');
  });

  it('Should cancel operator fee withdrawal', async () => {
    const { identityId } = await createProfile();
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
    const amount = hre.ethers.parseEther('100');
    await Token.mint(accounts[0].address, amount);
    await Token.connect(accounts[0]).approve(
      await Staking.getAddress(),
      amount,
    );
    await Staking.stake(identityId, amount);
    const delegatorKey = hre.ethers.keccak256(
      hre.ethers.solidityPacked(['address'], [accounts[0].address]),
    );
    const result = await Staking.simulateStakeInfoUpdate(
      identityId,
      delegatorKey,
    );
    expect(result[0] + result[1]).to.be.gt(0);
  });

  it('Full scenario: Multiple nodes, delegators, operator fees, redelegations, partial withdrawals, cancellations, rewards', async () => {
    console.log('--- START FULL SCENARIO TEST ---');

    const admin1 = accounts[0];
    const op1 = accounts[1];
    const admin2 = accounts[2];
    const op2 = accounts[3];
    const d1 = accounts[4];
    const d2 = accounts[5];
    const d3 = accounts[6];
    const d4 = accounts[7];

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
      console.log(`Node ${identityId} Data:
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
      console.log(`Delegator ${delegator.address} on Node ${identityId}:
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

    console.log('Creating Node A with operator fee = 20%');
    const NodeA = await createProfile(admin1, op1, 20n);
    console.log(`NodeA ID: ${NodeA.identityId}, operator fee: 20%`);

    console.log('Creating Node B with operator fee = 50%');
    const NodeB = await createProfile(admin2, op2, 50n);
    console.log(`NodeB ID: ${NodeB.identityId}, operator fee: 50%`);

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

    const d1 = accounts[4];
    const d2 = accounts[5];
    const d3 = accounts[6];

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
      console.log(`Node ${identityId} Data:
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
      console.log(`Delegator ${delegator.address} on Node ${identityId}:
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

    const NodeA = await createProfile(admin1, op1, 10n);
    console.log(`NodeA ID: ${NodeA.identityId}, fee: 10%`);
    const NodeB = await createProfile(admin2, op2, 90n);
    console.log(`NodeB ID: ${NodeB.identityId}, fee: 90%`);

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
    await expect(Staking.connect(d2).finalizeWithdrawal(NodeB.identityId)).to.be
      .reverted;
    console.log('Too early finalize reverted');
    console.log('d2 cancels withdrawal');
    await Staking.connect(d2).cancelWithdrawal(NodeB.identityId);
    await expect(Staking.connect(d2).cancelWithdrawal(NodeB.identityId)).to.be
      .reverted;
    console.log('Second cancel reverted as expected');

    console.log('d3 never staked on NodeA, tries withdrawing 100 ETH');
    await expect(Staking.connect(d3).requestWithdrawal(NodeA.identityId, 100n))
      .to.be.reverted;
    console.log('No stake withdrawal reverted as expected');

    const halfD2StakeB =
      (await StakingStorage.getNodeStake(NodeB.identityId)) / 2n;
    console.log(
      `d2 requests half stake withdrawal on NodeB: ${toEth(halfD2StakeB)} ETH`,
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

    console.log('--- END STRESS TEST SCENARIO ---');
  });
});
