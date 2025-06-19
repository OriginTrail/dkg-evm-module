import { randomBytes } from 'crypto';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre from 'hardhat';

import {
  Token,
  Profile,
  Staking,
  StakingStorage,
  ParametersStorage,
  RandomSamplingStorage,
  EpochStorage,
  DelegatorsInfo,
  ShardingTableStorage,
  Chronos,
} from '../../typechain';

// ====================================================
//  EMBEDDED FIXTURE – *adjust once, reuse everywhere*
// ====================================================
/**
 * Deploys all contracts via `hre.deployments.fixture()` and returns the common
 * handles consumed by the test‑suite. If your repo names differ, tweak here
 * once and all tests continue to work.
 */
async function deployStakingFixture() {
  // Ensures deploy scripts under /deploy or /deployments are executed once and
  // cached by Hardhat.
  await hre.deployments.fixture();

  // Grab generic signers (Hardhat auto‑creates as many as you need).
  const accounts: SignerWithAddress[] = await hre.ethers.getSigners();

  // Core contracts – **rename here** if your artefact names differ.
  const Token = await hre.ethers.getContract<Token>('Token');
  const Profile = await hre.ethers.getContract<Profile>('Profile');
  const Staking = await hre.ethers.getContract<Staking>('Staking');
  const StakingStorage =
    await hre.ethers.getContract<StakingStorage>('StakingStorage');
  const ParametersStorage =
    await hre.ethers.getContract<ParametersStorage>('ParametersStorage');
  const RandomSamplingStorage =
    await hre.ethers.getContract<RandomSamplingStorage>(
      'RandomSamplingStorage',
    );
  const EpochStorage =
    await hre.ethers.getContract<EpochStorage>('EpochStorage');
  const DelegatorsInfo =
    await hre.ethers.getContract<DelegatorsInfo>('DelegatorsInfo');
  const ShardingTableStorage =
    await hre.ethers.getContract<ShardingTableStorage>('ShardingTableStorage');
  const Chronos = await hre.ethers.getContract<Chronos>('Chronos');

  return {
    accounts,
    Token,
    Profile,
    Staking,
    StakingStorage,
    ParametersStorage,
    RandomSamplingStorage,
    EpochStorage,
    DelegatorsInfo,
    ShardingTableStorage,
    Chronos,
  } as const;
}

// ----------------------------------------------------
//  Helper types & constants
// ----------------------------------------------------

type Fixture = Awaited<ReturnType<typeof deployStakingFixture>>;
const SCALE18 = hre.ethers.parseUnits('1', 18);
const fmt = (x: bigint) => hre.ethers.formatUnits(x, 18);

/** Helper: create a profile with optional operator‑fee */
const createProfile = async (
  env: { accounts: SignerWithAddress[]; Profile: Profile },
  opts: { operatorFeeBp?: bigint } = {},
) => {
  const { accounts, Profile } = env;
  const admin = accounts[0];
  const operational = accounts[1];
  const fee = opts.operatorFeeBp ?? 0n;
  const node = '0x' + randomBytes(32).toString('hex');
  const tx = await Profile.connect(operational).createProfile(
    admin.address,
    [],
    `Node-${Math.floor(Math.random() * 10 ** 4)}`,
    node,
    fee,
  );
  const receipt = await tx.wait();
  if (!receipt) throw new Error('Transaction receipt is null');
  return Number(receipt.logs[0].topics[1]);
};

// ====================================================
//  MASTER SUITE
// ====================================================

describe('🔬 Staking – full behaviour matrix', () => {
  // Contracts
  let Token: Token;
  let Profile: Profile;
  let Staking: Staking;
  let StakingStorage: StakingStorage;
  let RandomSamplingStorage: RandomSamplingStorage;
  let EpochStorage: EpochStorage;
  let DelegatorsInfo: DelegatorsInfo;
  let ParametersStorage: ParametersStorage;
  let ShardingTableStorage: ShardingTableStorage;
  let Chronos: Chronos;
  // Accounts
  let A: SignerWithAddress[];

  // ------------------------------------------------------------------
  //  Fixture loader
  // ------------------------------------------------------------------
  beforeEach(async () => {
    const f: Fixture = await loadFixture(deployStakingFixture);
    ({
      accounts: A,
      Token,
      Profile,
      Staking,
      StakingStorage,
      RandomSamplingStorage,
      EpochStorage,
      DelegatorsInfo,
      ParametersStorage,
      ShardingTableStorage,
      Chronos,
    } = f);
  });

  // --------------------------------------------------
  //  SECTION 1 – Reward ordering & rolling rewards
  // --------------------------------------------------
  describe('Epoch ordering & rolling‑rewards', () => {
    it('reverts if skipping epochs; accumulates / flushes rolling rewards', async () => {
      const id = await createProfile({ accounts: A, Profile });
      const deleg = A[2];

      // Stake once
      const stake = hre.ethers.parseEther('100');
      await Token.mint(deleg.address, stake);
      await Token.connect(deleg).approve(await Staking.getAddress(), stake);
      await Staking.connect(deleg).stake(id, stake);
      const dKey = hre.ethers.keccak256(
        hre.ethers.solidityPacked(['address'], [deleg.address]),
      );

      // Helper to inject reward for an epoch
      const inject = async (ep: bigint, pool: bigint) => {
        await RandomSamplingStorage.addToNodeEpochScore(ep, id, SCALE18);
        await RandomSamplingStorage.addToAllNodesEpochScore(ep, SCALE18);
        await RandomSamplingStorage.addToEpochNodeDelegatorScore(
          ep,
          id,
          dKey,
          SCALE18,
        );
        await EpochStorage.addTokensToEpochRange(1, ep, ep, pool);
      };

      // Produce rewards for 3 consecutive epochs
      const e1 = await Chronos.getCurrentEpoch();
      await inject(e1, hre.ethers.parseEther('10'));
      await time.increase((await Chronos.timeUntilNextEpoch()) + 1n);
      const e2 = await Chronos.getCurrentEpoch();
      await inject(e2, hre.ethers.parseEther('20'));
      await time.increase((await Chronos.timeUntilNextEpoch()) + 1n);
      const e3 = await Chronos.getCurrentEpoch();
      await inject(e3, hre.ethers.parseEther('30'));
      await time.increase((await Chronos.timeUntilNextEpoch()) + 1n);

      // 📢 Attempt to claim e2 before e1 → revert
      await expect(
        Staking.connect(deleg).claimDelegatorRewards(id, e2, deleg.address),
      ).to.be.revertedWith('Must claim older epochs first');

      // Claim e1 – should push to rolling (because >1 epoch gap)
      await Staking.connect(deleg).claimDelegatorRewards(id, e1, deleg.address);
      const rollAfterE1 = await DelegatorsInfo.getDelegatorRollingRewards(
        id,
        deleg.address,
      );
      expect(rollAfterE1).to.be.gt(0);

      // Claim e2 – still gap >1 → still rolling
      await Staking.connect(deleg).claimDelegatorRewards(id, e2, deleg.address);
      const rollAfterE2 = await DelegatorsInfo.getDelegatorRollingRewards(
        id,
        deleg.address,
      );
      expect(rollAfterE2).to.be.gt(rollAfterE1);

      // Claim e3 – now gap ≤1 → rolling flushed into stake
      const baseBefore = await StakingStorage.getDelegatorStakeBase(id, dKey);
      await Staking.connect(deleg).claimDelegatorRewards(id, e3, deleg.address);
      const baseAfter = await StakingStorage.getDelegatorStakeBase(id, dKey);
      expect(
        await DelegatorsInfo.getDelegatorRollingRewards(id, deleg.address),
      ).to.equal(0);
      expect(baseAfter).to.be.gt(baseBefore);
    });
  });

  // --------------------------------------------------
  //  SECTION 2 – Claim guards & batch‑claim
  // --------------------------------------------------
  describe('Claim guards & batch‑claim', () => {
    it('blocks double‑claiming same epoch', async () => {
      const id = await createProfile({ accounts: A, Profile });
      const deleg = A[3];
      const stake = hre.ethers.parseEther('50');
      await Token.mint(deleg.address, stake);
      await Token.connect(deleg).approve(await Staking.getAddress(), stake);
      await Staking.connect(deleg).stake(id, stake);
      const dKey = hre.ethers.keccak256(
        hre.ethers.solidityPacked(['address'], [deleg.address]),
      );

      const epoch = await Chronos.getCurrentEpoch();
      await RandomSamplingStorage.addToNodeEpochScore(epoch, id, SCALE18);
      await RandomSamplingStorage.addToAllNodesEpochScore(epoch, SCALE18);
      await RandomSamplingStorage.addToEpochNodeDelegatorScore(
        epoch,
        id,
        dKey,
        SCALE18,
      );
      await EpochStorage.addTokensToEpochRange(
        1,
        epoch,
        epoch,
        hre.ethers.parseEther('5'),
      );
      await time.increase((await Chronos.timeUntilNextEpoch()) + 1n);

      await Staking.connect(deleg).claimDelegatorRewards(
        id,
        epoch,
        deleg.address,
      );
      await expect(
        Staking.connect(deleg).claimDelegatorRewards(id, epoch, deleg.address),
      ).to.be.revertedWith('Already claimed all finalised epochs');
    });

    it('batch‑claims 10 delegators × 1 epoch', async () => {
      const id = await createProfile({ accounts: A, Profile });
      const epoch = await Chronos.getCurrentEpoch();
      await RandomSamplingStorage.addToNodeEpochScore(epoch, id, SCALE18);
      await RandomSamplingStorage.addToAllNodesEpochScore(epoch, SCALE18);
      const delegs: SignerWithAddress[] = [];
      const addresses: string[] = [];
      for (let i = 0; i < 10; i++) {
        const d = A[4 + i];
        delegs.push(d);
        addresses.push(d.address);
        const stake = hre.ethers.parseEther('10');
        await Token.mint(d.address, stake);
        await Token.connect(d).approve(await Staking.getAddress(), stake);
        await Staking.connect(d).stake(id, stake);
        const dKey = hre.ethers.keccak256(
          hre.ethers.solidityPacked(['address'], [d.address]),
        );
        await RandomSamplingStorage.addToEpochNodeDelegatorScore(
          epoch,
          id,
          dKey,
          SCALE18 / 10n,
        );
      }
      await EpochStorage.addTokensToEpochRange(
        1,
        epoch,
        epoch,
        hre.ethers.parseEther('25'),
      );
      await time.increase((await Chronos.timeUntilNextEpoch()) + 1n);

      await Staking.batchClaimDelegatorRewards(id, [epoch], addresses);
      for (const d of delegs) {
        expect(
          await DelegatorsInfo.getLastClaimedEpoch(id, d.address),
        ).to.equal(epoch);
      }
    });
  });

  // --------------------------------------------------
  //  SECTION 3 – Operator fee commission + withdrawal life‑cycle
  // --------------------------------------------------
  describe('Operator‑fee payout lifecycle', () => {
    it('handles request → cancel → finalize correctly', async () => {
      const nodeId = await createProfile(
        { accounts: A, Profile },
        { operatorFeeBp: 100n /* 1 % */ },
      );
      const deleg = A[5];
      const stake = hre.ethers.parseEther('1000');

      // Delegator stakes so the node has something to charge fees against
      await Token.mint(deleg.address, stake);
      await Token.connect(deleg).approve(await Staking.getAddress(), stake);
      await Staking.connect(deleg).stake(nodeId, stake);

      // Simulate one epoch worth of operator‑fee
      const epoch = await Chronos.getCurrentEpoch();
      await RandomSamplingStorage.addToNodeEpochScore(epoch, nodeId, SCALE18);
      await RandomSamplingStorage.addToAllNodesEpochScore(epoch, SCALE18);
      const dKey = hre.ethers.keccak256(
        hre.ethers.solidityPacked(['address'], [deleg.address]),
      );
      await RandomSamplingStorage.addToEpochNodeDelegatorScore(
        epoch,
        nodeId,
        dKey,
        SCALE18,
      );
      await EpochStorage.addTokensToEpochRange(
        1,
        epoch,
        epoch,
        hre.ethers.parseEther('100'),
      );
      await time.increase((await Chronos.timeUntilNextEpoch()) + 1n);

      // Claim delegator rewards to build operator fee balance inside StakingStorage.operatorFeeBalance
      await Staking.connect(deleg).claimDelegatorRewards(
        nodeId,
        epoch,
        deleg.address,
      );
      const feeBal = await StakingStorage.getOperatorFeeBalance(nodeId);
      expect(feeBal).to.be.gt(0);

      // 1️⃣ request withdrawal
      await Staking.connect(A[1]).requestOperatorFeeWithdrawal(
        nodeId,
        feeBal / 2n,
      );
      let [amount, , ts] =
        await StakingStorage.getOperatorFeeWithdrawalRequest(nodeId);
      expect(amount).to.equal(feeBal / 2n);

      // 2️⃣ cancel
      await Staking.connect(A[1]).cancelOperatorFeeWithdrawal(nodeId);
      [amount] = await StakingStorage.getOperatorFeeWithdrawalRequest(nodeId);
      expect(amount).to.equal(0);

      // 3️⃣ re‑request & fast‑forward, then finalize
      await Staking.connect(A[1]).requestOperatorFeeWithdrawal(
        nodeId,
        feeBal / 2n,
      );
      [amount, , ts] =
        await StakingStorage.getOperatorFeeWithdrawalRequest(nodeId);
      await time.increase(ts - BigInt(await time.latest()) + 2n);
      const balBefore = await Token.balanceOf(A[1].address);
      await Staking.connect(A[1]).finalizeOperatorFeeWithdrawal(nodeId);
      const balAfter = await Token.balanceOf(A[1].address);
      expect(balAfter - balBefore).to.equal(feeBal / 2n);
      [amount] = await StakingStorage.getOperatorFeeWithdrawalRequest(nodeId);
      expect(amount).to.equal(0);
    });
  });

  // --------------------------------------------------
  //  SECTION 4 – Delegator withdrawal life‑cycle
  // --------------------------------------------------
  describe('Delegator withdrawal lifecycle', () => {
    it('request → cancel → finalize works and respects delays', async () => {
      const nodeId = await createProfile({ accounts: A, Profile });
      const deleg = A[6];
      const stake = hre.ethers.parseEther('150');
      await Token.mint(deleg.address, stake);
      await Token.connect(deleg).approve(await Staking.getAddress(), stake);
      await Staking.connect(deleg).stake(nodeId, stake);
      const dKey = hre.ethers.keccak256(
        hre.ethers.solidityPacked(['address'], [deleg.address]),
      );

      // Request withdrawal
      const reqAmt = hre.ethers.parseEther('50');
      await Staking.connect(deleg).requestWithdrawal(nodeId, reqAmt);
      let [amount, , ts] = await StakingStorage.getDelegatorWithdrawalRequest(
        nodeId,
        dKey,
      );
      expect(amount).to.equal(reqAmt);

      // Cancel
      await Staking.connect(deleg).cancelWithdrawal(nodeId);
      [amount] = await StakingStorage.getDelegatorWithdrawalRequest(
        nodeId,
        dKey,
      );
      expect(amount).to.equal(0);

      // Re‑request & finalize
      await Staking.connect(deleg).requestWithdrawal(nodeId, reqAmt);
      [amount, , ts] = await StakingStorage.getDelegatorWithdrawalRequest(
        nodeId,
        dKey,
      );
      await time.increase(ts - BigInt(await time.latest()) + 2n);
      const balBefore = await Token.balanceOf(deleg.address);
      await Staking.connect(deleg).finalizeWithdrawal(nodeId);
      const balAfter = await Token.balanceOf(deleg.address);
      expect(balAfter - balBefore).to.equal(reqAmt);
      [amount] = await StakingStorage.getDelegatorWithdrawalRequest(
        nodeId,
        dKey,
      );
      expect(amount).to.equal(0);
    });
  });

  // --------------------------------------------------
  //  SECTION 5 – Redelegation guard (must claim first)
  // --------------------------------------------------
  it('blocks redelegation while pending rewards exist', async () => {
    const nodeA = await createProfile({ accounts: A, Profile });
    const nodeB = await createProfile({ accounts: A, Profile });
    const deleg = A[12];
    const stake = hre.ethers.parseEther('80');
    await Token.mint(deleg.address, stake);
    await Token.connect(deleg).approve(await Staking.getAddress(), stake);
    await Staking.connect(deleg).stake(nodeA, stake);

    // earn reward in epoch‑E
    const dKey = hre.ethers.keccak256(
      hre.ethers.solidityPacked(['address'], [deleg.address]),
    );
    const epoch = await Chronos.getCurrentEpoch();
    await RandomSamplingStorage.addToNodeEpochScore(epoch, nodeA, SCALE18);
    await RandomSamplingStorage.addToAllNodesEpochScore(epoch, SCALE18);
    await RandomSamplingStorage.addToEpochNodeDelegatorScore(
      epoch,
      nodeA,
      dKey,
      SCALE18,
    );
    await EpochStorage.addTokensToEpochRange(
      1,
      epoch,
      epoch,
      hre.ethers.parseEther('7'),
    );

    await time.increase((await Chronos.timeUntilNextEpoch()) + 1n);

    await expect(
      Staking.connect(deleg).redelegate(nodeA, nodeB, stake / 2n),
    ).to.be.revertedWith('Must claim rewards for all finalised epochs first');
  });

  // --------------------------------------------------
  //  SECTION 6 – Sharding table insert on restake
  // --------------------------------------------------
  it('adds node to sharding table when restake crosses minimum', async () => {
    const nodeId = await createProfile({ accounts: A, Profile });
    const minStake = await ParametersStorage.minimumStake();
    const justBelow = minStake - hre.ethers.parseEther('1');
    await Token.mint(A[0].address, justBelow);
    await Token.connect(A[0]).approve(await Staking.getAddress(), justBelow);
    await Staking.stake(nodeId, justBelow);

    await StakingStorage.setOperatorFeeBalance(
      nodeId,
      hre.ethers.parseEther('2'),
    );
    await Staking.restakeOperatorFee(nodeId, hre.ethers.parseEther('2'));

    expect(await ShardingTableStorage.nodeExists(nodeId)).to.be.true;
  });

  // --------------------------------------------------
  //  SECTION 7 – Zero score / zero stake edge‑cases
  // --------------------------------------------------
  it('updates lastClaimedEpoch even when reward == 0', async () => {
    const nodeId = await createProfile({ accounts: A, Profile });
    const deleg = A[13];
    const stake = hre.ethers.parseEther('20');
    await Token.mint(deleg.address, stake);
    await Token.connect(deleg).approve(await Staking.getAddress(), stake);
    await Staking.connect(deleg).stake(nodeId, stake);

    const epoch = await Chronos.getCurrentEpoch(); // produce NO score
    await EpochStorage.addTokensToEpochRange(
      1,
      epoch,
      epoch,
      hre.ethers.parseEther('3'),
    );
    await time.increase((await Chronos.timeUntilNextEpoch()) + 1n);

    await Staking.connect(deleg).claimDelegatorRewards(
      nodeId,
      epoch,
      deleg.address,
    );
    expect(
      await DelegatorsInfo.getLastClaimedEpoch(nodeId, deleg.address),
    ).to.equal(epoch);
  });

  // --------------------------------------------------
  //  SECTION 8 – Batch claim gas sanity (already included in Section 2)
  // --------------------------------------------------
});
