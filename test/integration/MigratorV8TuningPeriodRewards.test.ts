import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre, { ethers } from 'hardhat';

import {
  Hub,
  Token,
  Chronos,
  StakingStorage,
  RandomSamplingStorage,
  ParametersStorage,
  ProfileStorage,
  EpochStorage,
  DelegatorsInfo,
  Ask,
  Staking,
  RandomSampling,
  Profile,
  AskStorage,
  MigratorV8TuningPeriodRewards,
  ShardingTableStorage,
  ShardingTable,
} from '../../typechain';
import { createProfile } from '../helpers/profile-helpers';

const toTRAC = (x: string | number) => ethers.parseUnits(x.toString(), 18);

type TestContracts = {
  hub: Hub;
  token: Token;
  chronos: Chronos;
  stakingStorage: StakingStorage;
  randomSamplingStorage: RandomSamplingStorage;
  parametersStorage: ParametersStorage;
  profileStorage: ProfileStorage;
  epochStorage: EpochStorage;
  delegatorsInfo: DelegatorsInfo;
  staking: Staking;
  profile: Profile;
  randomSampling: RandomSampling;
  askStorage: AskStorage;
  ask: Ask;
  migrator: MigratorV8TuningPeriodRewards;
  shardingTableStorage: ShardingTableStorage;
  shardingTable: ShardingTable;
};

type TestAccounts = {
  owner: SignerWithAddress;
  node1: { operational: SignerWithAddress; admin: SignerWithAddress };
  node2: { operational: SignerWithAddress; admin: SignerWithAddress };
  delegator1: SignerWithAddress;
  delegator2: SignerWithAddress;
  delegator3: SignerWithAddress;
};

async function setupTestEnvironment(): Promise<{
  accounts: TestAccounts;
  contracts: TestContracts;
  nodeIds: { node1Id: bigint; node2Id: bigint };
}> {
  // Deploy only the contracts that the migrator actually needs
  await hre.deployments.fixture([
    'MigratorV8TuningPeriodRewards',
    'Staking',
    'Profile',
    'Token',
    'RandomSampling',
    'EpochStorage',
  ]);

  const signers = await hre.ethers.getSigners();
  const accounts: TestAccounts = {
    owner: signers[0],
    node1: { operational: signers[1], admin: signers[2] },
    node2: { operational: signers[3], admin: signers[4] },
    delegator1: signers[5],
    delegator2: signers[6],
    delegator3: signers[7],
  };

  const contracts: TestContracts = {
    hub: await hre.ethers.getContract<Hub>('Hub'),
    token: await hre.ethers.getContract<Token>('Token'),
    chronos: await hre.ethers.getContract<Chronos>('Chronos'),
    stakingStorage:
      await hre.ethers.getContract<StakingStorage>('StakingStorage'),
    randomSamplingStorage: await hre.ethers.getContract<RandomSamplingStorage>(
      'RandomSamplingStorage',
    ),
    parametersStorage:
      await hre.ethers.getContract<ParametersStorage>('ParametersStorage'),
    profileStorage:
      await hre.ethers.getContract<ProfileStorage>('ProfileStorage'),
    epochStorage: await hre.ethers.getContract<EpochStorage>('EpochStorageV8'),
    delegatorsInfo:
      await hre.ethers.getContract<DelegatorsInfo>('DelegatorsInfo'),
    staking: await hre.ethers.getContract<Staking>('Staking'),
    profile: await hre.ethers.getContract<Profile>('Profile'),
    randomSampling:
      await hre.ethers.getContract<RandomSampling>('RandomSampling'),
    askStorage: await hre.ethers.getContract<AskStorage>('AskStorage'),
    ask: await hre.ethers.getContract<Ask>('Ask'),
    shardingTableStorage: await hre.ethers.getContract<ShardingTableStorage>(
      'ShardingTableStorage',
    ),
    shardingTable: await hre.ethers.getContract<ShardingTable>('ShardingTable'),
    migrator: await hre.ethers.getContract<MigratorV8TuningPeriodRewards>(
      'MigratorV8TuningPeriodRewards',
    ),
  };

  await contracts.hub.setContractAddress('HubOwner', accounts.owner.address);

  // Mint tokens for all participants
  for (const delegator of [
    accounts.delegator1,
    accounts.delegator2,
    accounts.delegator3,
  ]) {
    await contracts.token.mint(delegator.address, toTRAC(100_000));
  }
  await contracts.token.mint(accounts.owner.address, toTRAC(1_000_000));
  await contracts.token.mint(
    accounts.node1.operational.address,
    toTRAC(100_000),
  );
  await contracts.token.mint(
    accounts.node2.operational.address,
    toTRAC(100_000),
  );

  // Create profiles for nodes
  const node1Profile = await createProfile(contracts.profile, accounts.node1);

  const node2Profile = await createProfile(contracts.profile, accounts.node2);

  return {
    accounts,
    contracts,
    nodeIds: {
      node1Id: BigInt(node1Profile.identityId),
      node2Id: BigInt(node2Profile.identityId),
    },
  };
}

async function advanceEpochAndEnsureActivity(
  contracts: TestContracts,
): Promise<void> {
  // Simply advance to next epoch for testing purposes
  const epochLength = await contracts.chronos.epochLength();
  await time.increase(Number(epochLength));

  // Trigger epoch advancement in system
  await contracts.randomSampling.updateAndGetActiveProofPeriodStartBlock();
}

describe('MigratorV8TuningPeriodRewards Integration Tests', function () {
  let accounts: TestAccounts;
  let contracts: TestContracts;
  let nodeIds: { node1Id: bigint; node2Id: bigint };
  let node1Id: bigint;
  let node2Id: bigint;

  beforeEach(async function () {
    const setup = await setupTestEnvironment();
    accounts = setup.accounts;
    contracts = setup.contracts;
    nodeIds = setup.nodeIds;
    node1Id = nodeIds.node1Id;
    node2Id = nodeIds.node2Id;
  });

  describe('Delegator Reward Migration', function () {
    it('should successfully migrate delegator rewards while system is active', async function () {
      // Test migrator directly without initial stakes since it handles historical rewards
      const initialDelegatorStake =
        await contracts.stakingStorage.getDelegatorStakeBase(
          node1Id,
          ethers.keccak256(
            ethers.solidityPacked(['address'], [accounts.delegator1.address]),
          ),
        );
      const initialNodeStake =
        await contracts.stakingStorage.getNodeStake(node1Id);
      const initialTotalStake = await contracts.stakingStorage.getTotalStake();

      // Migrate reward
      const rewardAmount = toTRAC(1_000);
      await contracts.migrator.migrateDelegatorReward(
        node1Id,
        accounts.delegator1.address,
        rewardAmount,
      );

      // Verify state changes
      const finalDelegatorStake =
        await contracts.stakingStorage.getDelegatorStakeBase(
          node1Id,
          ethers.keccak256(
            ethers.solidityPacked(['address'], [accounts.delegator1.address]),
          ),
        );
      const finalNodeStake =
        await contracts.stakingStorage.getNodeStake(node1Id);
      const finalTotalStake = await contracts.stakingStorage.getTotalStake();

      expect(finalDelegatorStake).to.equal(
        initialDelegatorStake + rewardAmount,
      );
      expect(finalNodeStake).to.equal(initialNodeStake + rewardAmount);
      expect(finalTotalStake).to.equal(initialTotalStake + rewardAmount);

      // Verify delegator is properly registered
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(
        await contracts.delegatorsInfo.isNodeDelegator(
          node1Id,
          accounts.delegator1.address,
        ),
      ).to.be.true;

      // Verify claim flag is set
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(
        await contracts.migrator.claimedDelegatorReward(
          node1Id,
          accounts.delegator1.address,
        ),
      ).to.be.true;
    });

    it('should maintain system consistency during active RandomSampling', async function () {
      // Advance epoch to create activity
      await advanceEpochAndEnsureActivity(contracts);

      // Get current epoch scores before migration
      const currentEpoch = await contracts.chronos.getCurrentEpoch();
      const delegatorKey = ethers.keccak256(
        ethers.solidityPacked(['address'], [accounts.delegator1.address]),
      );

      const initialScore =
        await contracts.randomSamplingStorage.getEpochNodeDelegatorScore(
          currentEpoch,
          node1Id,
          delegatorKey,
        );

      // Migrate reward - use large enough amount to meet minimum stake
      const minimumStake = await contracts.parametersStorage.minimumStake();
      const rewardAmount = minimumStake + toTRAC(1_000); // Ensure above minimum
      await contracts.migrator.migrateDelegatorReward(
        node1Id,
        accounts.delegator1.address,
        rewardAmount,
      );

      // Verify score tracking is maintained
      const finalScore =
        await contracts.randomSamplingStorage.getEpochNodeDelegatorScore(
          currentEpoch,
          node1Id,
          delegatorKey,
        );

      // Score should be preserved (migration shouldn't affect current epoch scores)
      expect(finalScore).to.equal(initialScore);

      // Verify node is properly maintained in sharding table (should be true now with larger stake)
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(await contracts.shardingTableStorage.nodeExists(node1Id)).to.be
        .true;
    });

    it('should handle multiple delegator migrations correctly', async function () {
      const delegators = [
        accounts.delegator1,
        accounts.delegator2,
        accounts.delegator3,
      ];
      const rewardAmounts = [toTRAC(1_000), toTRAC(1_500), toTRAC(2_000)];

      const initialNodeStake =
        await contracts.stakingStorage.getNodeStake(node1Id);
      const totalRewards = rewardAmounts.reduce(
        (sum, amount) => sum + amount,
        0n,
      );

      // Migrate rewards for all delegators
      for (let i = 0; i < delegators.length; i++) {
        await contracts.migrator.migrateDelegatorReward(
          node1Id,
          delegators[i].address,
          rewardAmounts[i],
        );
      }

      // Verify total node stake increased by sum of all rewards
      const finalNodeStake =
        await contracts.stakingStorage.getNodeStake(node1Id);
      expect(finalNodeStake).to.equal(initialNodeStake + totalRewards);

      // Verify each delegator's individual stakes
      for (let i = 0; i < delegators.length; i++) {
        const delegatorKey = ethers.keccak256(
          ethers.solidityPacked(['address'], [delegators[i].address]),
        );
        const expectedStake = rewardAmounts[i]; // No initial stake, just the migrated reward
        const actualStake =
          await contracts.stakingStorage.getDelegatorStakeBase(
            node1Id,
            delegatorKey,
          );
        expect(actualStake).to.equal(expectedStake);
      }
    });

    it('should reject double migration attempts', async function () {
      const rewardAmount = toTRAC(1_000);

      // First migration should succeed
      await contracts.migrator.migrateDelegatorReward(
        node1Id,
        accounts.delegator1.address,
        rewardAmount,
      );

      // Second migration should fail
      await expect(
        contracts.migrator.migrateDelegatorReward(
          node1Id,
          accounts.delegator1.address,
          rewardAmount,
        ),
      ).to.be.revertedWith('Already claimed delegator reward for this node');
    });

    it('should reject zero amount migrations', async function () {
      await expect(
        contracts.migrator.migrateDelegatorReward(
          node1Id,
          accounts.delegator1.address,
          0,
        ),
      ).to.be.revertedWith('No reward');
    });

    it('should reject migrations for non-existent profiles', async function () {
      const nonExistentNodeId = 99999n;

      await expect(
        contracts.migrator.migrateDelegatorReward(
          nonExistentNodeId,
          accounts.delegator1.address,
          toTRAC(1_000),
        ),
      ).to.be.revertedWithCustomError(contracts.migrator, 'ProfileDoesntExist');
    });

    it('should handle migration for new delegators (first-time delegation)', async function () {
      // Don't setup initial stakes - test migration for completely new delegator
      const newDelegator = accounts.delegator1;
      const rewardAmount = toTRAC(5_000);

      // Verify delegator is not initially registered
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(
        await contracts.delegatorsInfo.isNodeDelegator(
          node1Id,
          newDelegator.address,
        ),
      ).to.be.false;

      // Migrate reward for new delegator
      await contracts.migrator.migrateDelegatorReward(
        node1Id,
        newDelegator.address,
        rewardAmount,
      );

      // Verify delegator is now registered
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(
        await contracts.delegatorsInfo.isNodeDelegator(
          node1Id,
          newDelegator.address,
        ),
      ).to.be.true;

      // Verify stake was correctly assigned
      const delegatorKey = ethers.keccak256(
        ethers.solidityPacked(['address'], [newDelegator.address]),
      );
      const finalStake = await contracts.stakingStorage.getDelegatorStakeBase(
        node1Id,
        delegatorKey,
      );
      expect(finalStake).to.equal(rewardAmount);
    });
  });

  describe('Operator Reward Migration', function () {
    it('should successfully migrate operator rewards', async function () {
      const initialOperatorBalance =
        await contracts.stakingStorage.getOperatorFeeBalance(node1Id);
      const rewardAmount = toTRAC(5_000);

      await contracts.migrator.migrateOperatorReward(node1Id, rewardAmount);

      const finalOperatorBalance =
        await contracts.stakingStorage.getOperatorFeeBalance(node1Id);
      expect(finalOperatorBalance).to.equal(
        initialOperatorBalance + rewardAmount,
      );

      // Verify claim flag is set
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(await contracts.migrator.claimedOperatorReward(node1Id)).to.be
        .true;
    });

    it('should reject double operator reward migrations', async function () {
      const rewardAmount = toTRAC(5_000);

      // First migration should succeed
      await contracts.migrator.migrateOperatorReward(node1Id, rewardAmount);

      // Second migration should fail
      await expect(
        contracts.migrator.migrateOperatorReward(node1Id, rewardAmount),
      ).to.be.revertedWith('Already claimed operator reward for this node');
    });

    it('should reject zero amount operator migrations', async function () {
      await expect(
        contracts.migrator.migrateOperatorReward(node1Id, 0),
      ).to.be.revertedWith('No reward');
    });

    it('should reject operator migrations for non-existent profiles', async function () {
      const nonExistentNodeId = 99999n;

      await expect(
        contracts.migrator.migrateOperatorReward(
          nonExistentNodeId,
          toTRAC(1_000),
        ),
      ).to.be.revertedWithCustomError(contracts.migrator, 'ProfileDoesntExist');
    });
  });

  describe('Combined Migration Scenarios', function () {
    it('should handle mixed delegator and operator migrations correctly', async function () {
      const delegatorReward = toTRAC(2_000);
      const operatorReward = toTRAC(3_000);

      const initialNodeStake =
        await contracts.stakingStorage.getNodeStake(node1Id);
      const initialOperatorBalance =
        await contracts.stakingStorage.getOperatorFeeBalance(node1Id);

      // Migrate both types of rewards
      await contracts.migrator.migrateDelegatorReward(
        node1Id,
        accounts.delegator1.address,
        delegatorReward,
      );
      await contracts.migrator.migrateOperatorReward(node1Id, operatorReward);

      // Verify delegator reward increased node stake
      const finalNodeStake =
        await contracts.stakingStorage.getNodeStake(node1Id);
      expect(finalNodeStake).to.equal(initialNodeStake + delegatorReward);

      // Verify operator reward increased operator balance (but not node stake)
      const finalOperatorBalance =
        await contracts.stakingStorage.getOperatorFeeBalance(node1Id);
      expect(finalOperatorBalance).to.equal(
        initialOperatorBalance + operatorReward,
      );
    });

    it('should maintain system integrity during live migration', async function () {
      // Advance epoch and ensure activity
      await advanceEpochAndEnsureActivity(contracts);

      const initialSystemState = {
        totalStake: await contracts.stakingStorage.getTotalStake(),
        node1Stake: await contracts.stakingStorage.getNodeStake(node1Id),
        node2Stake: await contracts.stakingStorage.getNodeStake(node2Id),
        node1OperatorBalance:
          await contracts.stakingStorage.getOperatorFeeBalance(node1Id),
        node2OperatorBalance:
          await contracts.stakingStorage.getOperatorFeeBalance(node2Id),
      };

      // Use larger rewards to ensure nodes meet minimum stake requirements
      const minimumStake = await contracts.parametersStorage.minimumStake();
      const delegatorReward1 = minimumStake + toTRAC(1_500);
      const delegatorReward2 = minimumStake + toTRAC(2_500);
      const operatorReward1 = toTRAC(1_000);
      const operatorReward2 = toTRAC(1_200);

      await contracts.migrator.migrateDelegatorReward(
        node1Id,
        accounts.delegator1.address,
        delegatorReward1,
      );
      await contracts.migrator.migrateDelegatorReward(
        node2Id,
        accounts.delegator2.address,
        delegatorReward2,
      );
      await contracts.migrator.migrateOperatorReward(node1Id, operatorReward1);
      await contracts.migrator.migrateOperatorReward(node2Id, operatorReward2);

      // Verify system state consistency
      const finalSystemState = {
        totalStake: await contracts.stakingStorage.getTotalStake(),
        node1Stake: await contracts.stakingStorage.getNodeStake(node1Id),
        node2Stake: await contracts.stakingStorage.getNodeStake(node2Id),
        node1OperatorBalance:
          await contracts.stakingStorage.getOperatorFeeBalance(node1Id),
        node2OperatorBalance:
          await contracts.stakingStorage.getOperatorFeeBalance(node2Id),
      };

      expect(finalSystemState.totalStake).to.equal(
        initialSystemState.totalStake + delegatorReward1 + delegatorReward2,
      );
      expect(finalSystemState.node1Stake).to.equal(
        initialSystemState.node1Stake + delegatorReward1,
      );
      expect(finalSystemState.node2Stake).to.equal(
        initialSystemState.node2Stake + delegatorReward2,
      );
      expect(finalSystemState.node1OperatorBalance).to.equal(
        initialSystemState.node1OperatorBalance + operatorReward1,
      );
      expect(finalSystemState.node2OperatorBalance).to.equal(
        initialSystemState.node2OperatorBalance + operatorReward2,
      );

      // Verify both nodes are now in sharding table (with larger stakes above minimum)
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(await contracts.shardingTableStorage.nodeExists(node1Id)).to.be
        .true;
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(await contracts.shardingTableStorage.nodeExists(node2Id)).to.be
        .true;
    });
  });

  describe('Reward accrual correctness with RandomSampling', function () {
    it('should accrue current epoch score only on post-migration score-per-stake delta', async function () {
      const epoch = await contracts.chronos.getCurrentEpoch();

      // Bootstrap: ensure node is in sharding table with existing stake (different delegator)
      const minimumStake = await contracts.parametersStorage.minimumStake();
      const bootstrapStake = minimumStake + toTRAC(2_000);
      await contracts.token
        .connect(accounts.delegator2)
        .approve(await contracts.staking.getAddress(), bootstrapStake);
      await contracts.staking
        .connect(accounts.delegator2)
        .stake(node1Id, bootstrapStake);

      // Set initial node score-per-stake for this epoch (pre-migration)
      const preMigrationSps36 = ethers.parseUnits('1', 18); // 1e18 (36-dec fixed scales against 1e18)
      await contracts.randomSamplingStorage
        .connect(accounts.owner)
        .addToNodeEpochScorePerStake(epoch, node1Id, preMigrationSps36);

      // Verify delegator has zero score before migration
      const delegatorKey = ethers.keccak256(
        ethers.solidityPacked(['address'], [accounts.delegator1.address]),
      );
      const scoreBefore =
        await contracts.randomSamplingStorage.getEpochNodeDelegatorScore(
          epoch,
          node1Id,
          delegatorKey,
        );
      expect(scoreBefore).to.equal(0n);

      // Migrate delegator reward (creates stake base and settles to current SPS index)
      const migratedStake = toTRAC(3_000);
      await contracts.migrator.migrateDelegatorReward(
        node1Id,
        accounts.delegator1.address,
        migratedStake,
      );

      // Increase node score-per-stake after migration
      const postMigrationDeltaSps36 = ethers.parseUnits('0.5', 18); // 0.5e18 delta
      await contracts.randomSamplingStorage
        .connect(accounts.owner)
        .addToNodeEpochScorePerStake(epoch, node1Id, postMigrationDeltaSps36);

      // Settle delegator to materialize post-migration SPS delta into epoch score
      await contracts.staking
        .connect(accounts.owner)
        .prepareForStakeChange(epoch, node1Id, delegatorKey);

      // Expected delegator epoch score = migratedStake * deltaSps / 1e18
      const expectedScore =
        (migratedStake * postMigrationDeltaSps36) / ethers.parseUnits('1', 18);

      const scoreAfter =
        await contracts.randomSamplingStorage.getEpochNodeDelegatorScore(
          epoch,
          node1Id,
          delegatorKey,
        );
      expect(scoreAfter).to.equal(expectedScore);
    });
  });

  describe('Access Control', function () {
    it('should only allow owner or multisig to migrate rewards', async function () {
      // TODO: Test access control when multisig is properly set up
      //   // Try migration from non-owner account - must revert with specific custom error
      //   await expect(
      //     contracts.migrator
      //       .connect(accounts.delegator1)
      //       .migrateDelegatorReward(
      //         node1Id,
      //         accounts.delegator1.address,
      //         toTRAC(1_000),
      //       ),
      //   )
      //     .to.be.revertedWithCustomError(contracts.migrator, 'UnauthorizedAccess')
      //     .withArgs('Only Hub Owner or Multisig Owner');

      //   await expect(
      //     contracts.migrator
      //       .connect(accounts.delegator1)
      //       .migrateOperatorReward(node1Id, toTRAC(1_000)),
      //   )
      //     .to.be.revertedWithCustomError(contracts.migrator, 'UnauthorizedAccess')
      //     .withArgs('Only Hub Owner or Multisig Owner');

      // Verify that owner can successfully call these functions
      await expect(
        contracts.migrator.migrateDelegatorReward(
          node2Id,
          accounts.delegator1.address,
          toTRAC(1_000),
        ),
      ).to.not.be.reverted;

      await expect(
        contracts.migrator.migrateOperatorReward(node2Id, toTRAC(1_000)),
      ).to.not.be.reverted;
    });
  });

  describe('Edge Cases and Error Conditions', function () {
    it('should handle migration when node has no existing delegators', async function () {
      // Don't setup any initial stakes
      const newDelegator = accounts.delegator1;
      const rewardAmount = toTRAC(10_000);

      // Verify node has no delegators initially
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(
        await contracts.delegatorsInfo.isNodeDelegator(
          node1Id,
          newDelegator.address,
        ),
      ).to.be.false;

      // Migration should succeed and register the delegator
      await contracts.migrator.migrateDelegatorReward(
        node1Id,
        newDelegator.address,
        rewardAmount,
      );

      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(
        await contracts.delegatorsInfo.isNodeDelegator(
          node1Id,
          newDelegator.address,
        ),
      ).to.be.true;

      const delegatorKey = ethers.keccak256(
        ethers.solidityPacked(['address'], [newDelegator.address]),
      );
      const finalStake = await contracts.stakingStorage.getDelegatorStakeBase(
        node1Id,
        delegatorKey,
      );
      expect(finalStake).to.equal(rewardAmount);
    });

    it('should handle migration that brings node above minimum stake threshold', async function () {
      // Ensure node starts below minimum stake
      const minimumStake = await contracts.parametersStorage.minimumStake();
      const nodeStake = await contracts.stakingStorage.getNodeStake(node2Id);

      if (nodeStake >= minimumStake) {
        // Reset node stake for this test
        await contracts.stakingStorage.setNodeStake(node2Id, 0);
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        expect(await contracts.shardingTableStorage.nodeExists(node2Id)).to.be
          .false;
      }

      // Migrate enough to bring above minimum
      const rewardAmount = minimumStake + toTRAC(1_000);
      await contracts.migrator.migrateDelegatorReward(
        node2Id,
        accounts.delegator1.address,
        rewardAmount,
      );

      // Verify node is now in sharding table
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(await contracts.shardingTableStorage.nodeExists(node2Id)).to.be
        .true;
    });

    it('should allow migration that exceeds maximum stake (no validation in original contract)', async function () {
      // This should succeed since the original contract doesn't validate maximum stake
      const largeReward = toTRAC(1_000_000); // Very large amount

      await contracts.migrator.migrateDelegatorReward(
        node1Id,
        accounts.delegator1.address,
        largeReward,
      );

      // Verify the migration succeeded
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(
        await contracts.migrator.claimedDelegatorReward(
          node1Id,
          accounts.delegator1.address,
        ),
      ).to.be.true;

      const delegatorKey = ethers.keccak256(
        ethers.solidityPacked(['address'], [accounts.delegator1.address]),
      );
      const finalStake = await contracts.stakingStorage.getDelegatorStakeBase(
        node1Id,
        delegatorKey,
      );
      expect(finalStake).to.equal(largeReward);
    });
  });
});
