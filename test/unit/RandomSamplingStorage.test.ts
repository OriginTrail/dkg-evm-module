import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { EventLog } from 'ethers';
import hre, { ethers } from 'hardhat';

import parameters from '../../deployments/parameters.json';
import {
  mineBlocks,
  mineProofPeriodBlocks,
} from '../../test/helpers/blockchain-helpers';
import {
  Hub,
  RandomSamplingStorage,
  Chronos,
  KnowledgeCollectionStorage,
  RandomSampling,
} from '../../typechain';
import { RandomSamplingLib } from '../../typechain/contracts/storage/RandomSamplingStorage';

const HUNDRED_ETH = ethers.parseEther('100');

// Helper functions for random sampling
async function createMockChallenge(
  randomSamplingStorage: RandomSamplingStorage,
  knowledgeCollectionStorage: KnowledgeCollectionStorage,
  chronos: Chronos,
): Promise<RandomSamplingLib.ChallengeStruct> {
  const currentEpoch = await chronos.getCurrentEpoch();
  await randomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
  const { activeProofPeriodStartBlock } =
    await randomSamplingStorage.getActiveProofPeriodStatus();
  const proofingPeriodDuration =
    await randomSamplingStorage.getActiveProofingPeriodDurationInBlocks();

  return {
    knowledgeCollectionId: 1n,
    chunkId: 1n,
    knowledgeCollectionStorageContract:
      await knowledgeCollectionStorage.getAddress(),
    epoch: currentEpoch,
    activeProofPeriodStartBlock,
    proofingPeriodDurationInBlocks: proofingPeriodDuration,
    solved: false,
  };
}

type RandomStorageFixture = {
  accounts: SignerWithAddress[];
  RandomSamplingStorage: RandomSamplingStorage;
  Hub: Hub;
  Chronos: Chronos;
  RandomSampling: RandomSampling;
};

const PANIC_ARITHMETIC_OVERFLOW = 0x11;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function impersonateAndFund(contract: any) {
  await hre.network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [await contract.getAddress()],
  });

  await hre.network.provider.send('hardhat_setBalance', [
    await contract.getAddress(),
    `0x${HUNDRED_ETH.toString(16)}`,
  ]);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function stopImpersonate(contract: any) {
  await hre.network.provider.request({
    method: 'hardhat_stopImpersonatingAccount',
    params: [await contract.getAddress()],
  });
}

describe('@unit RandomSamplingStorage', function () {
  let Hub: Hub;
  let RandomSamplingStorage: RandomSamplingStorage;
  let RandomSampling: RandomSampling;
  let Chronos: Chronos;
  let KnowledgeCollectionStorage: KnowledgeCollectionStorage;
  let MockChallenge: RandomSamplingLib.ChallengeStruct;
  let accounts: SignerWithAddress[];

  const proofingPeriodDurationInBlocks =
    parameters.development.RandomSamplingStorage.hardhat
      .proofingPeriodDurationInBlocks;
  const avgBlockTimeInSeconds =
    parameters.development.RandomSamplingStorage.hardhat.avgBlockTimeInSeconds;
  const w1 = parameters.development.RandomSamplingStorage.hardhat.W1;
  const w2 = parameters.development.RandomSamplingStorage.hardhat.W2;

  async function deployRandomSamplingFixture(): Promise<RandomStorageFixture> {
    await hre.deployments.fixture([
      'Token',
      'ParanetKnowledgeCollectionsRegistry',
      'ParanetKnowledgeMinersRegistry',
      'KnowledgeCollectionStorage',
      'KnowledgeCollection',
      'RandomSamplingStorage',
      'RandomSampling',
      'ShardingTableStorage',
      'EpochStorage',
      'Profile',
    ]);

    Hub = await hre.ethers.getContract<Hub>('Hub');
    accounts = await ethers.getSigners();
    Chronos = await hre.ethers.getContract<Chronos>('Chronos');

    // Use the deployed RandomSamplingStorage instance instead of creating a new one
    RandomSamplingStorage = await hre.ethers.getContract<RandomSamplingStorage>(
      'RandomSamplingStorage',
    );

    RandomSampling =
      await hre.ethers.getContract<RandomSampling>('RandomSampling');
    KnowledgeCollectionStorage =
      await hre.ethers.getContract<KnowledgeCollectionStorage>(
        'KnowledgeCollectionStorage',
      );

    await RandomSamplingStorage.initialize();
    await RandomSampling.initialize();

    return {
      accounts,
      RandomSamplingStorage,
      Hub,
      Chronos,
      RandomSampling,
    };
  }

  async function updateAndGetActiveProofPeriod() {
    const tx =
      await RandomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
    await tx.wait();
    return await RandomSamplingStorage.getActiveProofPeriodStatus();
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ RandomSamplingStorage, Chronos, RandomSampling } = await loadFixture(
      deployRandomSamplingFixture,
    ));

    MockChallenge = await createMockChallenge(
      RandomSamplingStorage,
      KnowledgeCollectionStorage,
      Chronos,
    );
  });

  describe('constructor', () => {
    it('Should set correct initial values', async () => {
      // Check initial values set in constructor
      expect(await RandomSamplingStorage.avgBlockTimeInSeconds()).to.equal(
        BigInt(avgBlockTimeInSeconds),
      );
      expect(await RandomSamplingStorage.w1()).to.equal(w1);
      expect(await RandomSamplingStorage.w2()).to.equal(w2);
    });

    it('Should revert if proofingPeriodDurationInBlocks is 0', async () => {
      const RandomSamplingStorageFactory = await hre.ethers.getContractFactory(
        'RandomSamplingStorage',
      );
      await expect(
        RandomSamplingStorageFactory.deploy(
          Hub.target,
          0,
          avgBlockTimeInSeconds,
          w1,
          w2,
        ),
      ).to.be.revertedWith(
        'Proofing period duration in blocks must be greater than 0',
      );
    });

    it('Should revert if avgBlockTimeInSeconds is 0', async () => {
      const RandomSamplingStorageFactory = await hre.ethers.getContractFactory(
        'RandomSamplingStorage',
      );
      await expect(
        RandomSamplingStorageFactory.deploy(
          Hub.target,
          proofingPeriodDurationInBlocks,
          0,
          w1,
          w2,
        ),
      ).to.be.revertedWith(
        'Average block time in seconds must be greater than 0',
      );
    });
  });

  describe('setAvgBlockTimeInSeconds()', () => {
    it('Should update avgBlockTimeInSeconds and revert for non-owners', async () => {
      // Test successful update by owner
      const newAvg = 15;
      const tx = await RandomSamplingStorage.setAvgBlockTimeInSeconds(newAvg);
      await tx.wait();

      await expect(tx)
        .to.emit(RandomSamplingStorage, 'AvgBlockTimeUpdated')
        .withArgs(BigInt(newAvg));

      expect(await RandomSamplingStorage.avgBlockTimeInSeconds()).to.equal(
        BigInt(newAvg),
      );

      // TODO: Fails because the hubOwner is not a multisig, but an individual account
      // // Test revert for non-owner
      // await expect(
      //   RandomSamplingStorage.connect(accounts[1]).setAvgBlockTimeInSeconds(
      //     newAvg,
      //   ),
      // )
      //   .to.be.revertedWithCustomError(
      //     RandomSamplingStorage,
      //     'UnauthorizedAccess',
      //   )
      //   .withArgs('Only Hub Owner');
    });

    it('Should revert if blockTimeInSeconds is 0', async () => {
      await expect(
        RandomSamplingStorage.setAvgBlockTimeInSeconds(0),
      ).to.be.revertedWith('Block time in seconds must be greater than 0');
    });
  });

  describe('setW1() and W1 getter', () => {
    it('Should update W1 correctly and revert for non-owners', async () => {
      // Test successful update by owner
      const newW1 = hre.ethers.parseUnits('2', 18);
      const oldW1 = await RandomSamplingStorage.w1();

      const tx = await RandomSamplingStorage.setW1(newW1);
      await tx.wait();

      await expect(tx)
        .to.emit(RandomSamplingStorage, 'W1Updated')
        .withArgs(oldW1, newW1);

      expect(await RandomSamplingStorage.w1()).to.equal(newW1);

      // // TODO: Fails because the hubOwner is not a multisig, but an individual account
      // // Test revert for non-owner
      // await expect(RandomSamplingStorage.connect(accounts[1]).setW1(newW1))
      //   .to.be.revertedWithCustomError(RandomSampling, 'UnauthorizedAccess')
      //   .withArgs('Only Hub Owner');
    });
  });

  describe('setW2() and W2 getter', () => {
    it('Should update W2 correctly and revert for non-owners', async () => {
      // Test successful update by owner
      const newW2 = hre.ethers.parseUnits('3', 18);
      const oldW2 = await RandomSamplingStorage.w2();

      const tx = await RandomSamplingStorage.setW2(newW2);
      await tx.wait();

      await expect(tx)
        .to.emit(RandomSamplingStorage, 'W2Updated')
        .withArgs(oldW2, newW2);

      expect(await RandomSamplingStorage.w2()).to.equal(newW2);

      // TODO: This test fails because the hubOwner is not a multisig, but an individual account
      // await expect(RandomSamplingStorage.connect(accounts[1]).setW2(newW2))
      //   .to.be.revertedWithCustomError(RandomSampling, 'UnauthorizedAccess')
      //   .withArgs('Only Hub Owner');
    });
  });

  describe('Scoring System', () => {
    it('Should increment and get epoch node valid proofs count', async () => {
      const nodeId = 1n;
      const currentEpoch = await Chronos.getCurrentEpoch();
      const epochLength = await Chronos.epochLength();

      // Test initial state
      const initialCount =
        await RandomSamplingStorage.getEpochNodeValidProofsCount(
          currentEpoch,
          nodeId,
        );
      expect(initialCount).to.equal(0n, 'Should start with 0 proofs');

      // Test incrementing in current epoch
      await RandomSamplingStorage.incrementEpochNodeValidProofsCount(
        currentEpoch,
        nodeId,
      );
      const countAfterIncrement =
        await RandomSamplingStorage.getEpochNodeValidProofsCount(
          currentEpoch,
          nodeId,
        );
      expect(countAfterIncrement).to.equal(1n, 'Should increment to 1');

      // Test multiple increments
      await RandomSamplingStorage.incrementEpochNodeValidProofsCount(
        currentEpoch,
        nodeId,
      );
      const countAfterMultiple =
        await RandomSamplingStorage.getEpochNodeValidProofsCount(
          currentEpoch,
          nodeId,
        );
      expect(countAfterMultiple).to.equal(2n, 'Should increment to 2');

      // Move to next epoch properly
      await time.increase(Number(epochLength));
      const nextEpoch = await Chronos.getCurrentEpoch();
      expect(nextEpoch).to.equal(currentEpoch + 1n, 'Should be in next epoch');

      // Test in next epoch
      await RandomSamplingStorage.incrementEpochNodeValidProofsCount(
        nextEpoch,
        nodeId,
      );
      const nextEpochCount =
        await RandomSamplingStorage.getEpochNodeValidProofsCount(
          nextEpoch,
          nodeId,
        );
      expect(nextEpochCount).to.equal(1n, 'Should start at 1 in new epoch');
      expect(
        await RandomSamplingStorage.getEpochNodeValidProofsCount(
          currentEpoch,
          nodeId,
        ),
      ).to.equal(2n, 'Previous epoch count should remain unchanged');
    });

    it('Should add to node score and get node score', async () => {
      const nodeIds = [1n, 2n, 3n];
      const currentEpoch = await Chronos.getCurrentEpoch();
      const proofPeriodIndex = 1n;

      // Test initial state for all nodes
      for (const nodeId of nodeIds) {
        expect(
          await RandomSamplingStorage.getNodeEpochProofPeriodScore(
            nodeId,
            currentEpoch,
            proofPeriodIndex,
          ),
        ).to.equal(0n, `Node ${nodeId} should start with 0 score`);
      }
      expect(
        await RandomSamplingStorage.getEpochAllNodesProofPeriodScore(
          currentEpoch,
          proofPeriodIndex,
        ),
      ).to.equal(0n, 'Global score should start at 0');

      // Add scores to different nodes
      const scores = [100n, 200n, 300n];
      let expectedGlobalScore = 0n;

      for (let i = 0; i < nodeIds.length; i++) {
        const nodeId = nodeIds[i];
        const score = scores[i];
        expectedGlobalScore += score;

        // Add score to node
        await RandomSamplingStorage.addToNodeEpochProofPeriodScore(
          currentEpoch,
          proofPeriodIndex,
          nodeId,
          score,
        );

        // Add to global score
        await RandomSamplingStorage.addToAllNodesEpochProofPeriodScore(
          currentEpoch,
          proofPeriodIndex,
          score,
        );

        // Verify individual node score
        const nodeScore =
          await RandomSamplingStorage.getNodeEpochProofPeriodScore(
            nodeId,
            currentEpoch,
            proofPeriodIndex,
          );
        expect(nodeScore).to.equal(
          score,
          `Node ${nodeId} should have score ${score}`,
        );

        // Verify global score
        const globalScore =
          await RandomSamplingStorage.getEpochAllNodesProofPeriodScore(
            currentEpoch,
            proofPeriodIndex,
          );
        expect(globalScore).to.equal(
          expectedGlobalScore,
          `Global score should be ${expectedGlobalScore} after adding ${score} to node ${nodeId}`,
        );
      }

      // Test adding more score to existing node
      const additionalScore = 50n;
      await RandomSamplingStorage.addToNodeEpochProofPeriodScore(
        currentEpoch,
        proofPeriodIndex,
        nodeIds[0],
        additionalScore,
      );

      // Add to global score
      await RandomSamplingStorage.addToAllNodesEpochProofPeriodScore(
        currentEpoch,
        proofPeriodIndex,
        additionalScore,
      );

      // Verify updated individual score
      const updatedNodeScore =
        await RandomSamplingStorage.getNodeEpochProofPeriodScore(
          nodeIds[0],
          currentEpoch,
          proofPeriodIndex,
        );
      expect(updatedNodeScore).to.equal(
        scores[0] + additionalScore,
        'Node score should be updated with additional score',
      );

      // Verify updated global score
      const updatedGlobalScore =
        await RandomSamplingStorage.getEpochAllNodesProofPeriodScore(
          currentEpoch,
          proofPeriodIndex,
        );
      expect(updatedGlobalScore).to.equal(
        expectedGlobalScore + additionalScore,
        'Global score should be updated with additional score',
      );
    });

    it('Should accumulate delegator scores correctly', async () => {
      const publishingNodeIdentityId = 1n;
      const signer = await ethers.getSigner(accounts[0].address);
      const currentEpoch = await Chronos.getCurrentEpoch();
      const delegatorKey = ethers.encodeBytes32String('delegator1');
      const score = 100n;

      // Test initial state
      expect(
        await RandomSamplingStorage.getEpochNodeDelegatorScore(
          currentEpoch,
          publishingNodeIdentityId,
          delegatorKey,
        ),
      ).to.equal(0n);

      // Add score and verify accumulation
      await RandomSamplingStorage.connect(signer).addToEpochNodeDelegatorScore(
        currentEpoch,
        publishingNodeIdentityId,
        delegatorKey,
        score,
      );
      expect(
        await RandomSamplingStorage.getEpochNodeDelegatorScore(
          currentEpoch,
          publishingNodeIdentityId,
          delegatorKey,
        ),
      ).to.equal(score);

      // Add more score and verify accumulation
      await RandomSamplingStorage.connect(signer).addToEpochNodeDelegatorScore(
        currentEpoch,
        publishingNodeIdentityId,
        delegatorKey,
        score,
      );
      expect(
        await RandomSamplingStorage.getEpochNodeDelegatorScore(
          currentEpoch,
          publishingNodeIdentityId,
          delegatorKey,
        ),
      ).to.equal(score * 2n);
    });

    it('Should add to and get nodeEpochScorePerStake correctly and emit event', async () => {
      const nodeId = 1n;
      const currentEpoch = await Chronos.getCurrentEpoch();
      const scorePerStakeToAdd = 500n;
      const expectedTotalScorePerStake = 500n;

      // Initial state
      expect(
        await RandomSamplingStorage.getNodeEpochScorePerStake(
          currentEpoch,
          nodeId,
        ),
      ).to.equal(0n, 'Initial nodeEpochScorePerStake should be 0');

      // Add scorePerStake and check event
      await expect(
        RandomSamplingStorage.addToNodeEpochScorePerStake(
          currentEpoch,
          nodeId,
          scorePerStakeToAdd,
        ),
      )
        .to.emit(RandomSamplingStorage, 'NodeEpochScorePerStakeUpdated')
        .withArgs(
          currentEpoch,
          nodeId,
          scorePerStakeToAdd,
          expectedTotalScorePerStake,
        );

      // Verify stored value
      expect(
        await RandomSamplingStorage.getNodeEpochScorePerStake(
          currentEpoch,
          nodeId,
        ),
      ).to.equal(
        expectedTotalScorePerStake,
        `nodeEpochScorePerStake should be ${expectedTotalScorePerStake}`,
      );

      // Add more and verify accumulation
      const anotherScorePerStakeToAdd = 300n;
      const newExpectedTotalScorePerStake =
        expectedTotalScorePerStake + anotherScorePerStakeToAdd;
      await expect(
        RandomSamplingStorage.addToNodeEpochScorePerStake(
          currentEpoch,
          nodeId,
          anotherScorePerStakeToAdd,
        ),
      )
        .to.emit(RandomSamplingStorage, 'NodeEpochScorePerStakeUpdated')
        .withArgs(
          currentEpoch,
          nodeId,
          anotherScorePerStakeToAdd,
          newExpectedTotalScorePerStake,
        );

      expect(
        await RandomSamplingStorage.getNodeEpochScorePerStake(
          currentEpoch,
          nodeId,
        ),
      ).to.equal(
        newExpectedTotalScorePerStake,
        `nodeEpochScorePerStake should be ${newExpectedTotalScorePerStake}`,
      );

      // Test different node
      const anotherNodeId = 2n;
      await expect(
        RandomSamplingStorage.addToNodeEpochScorePerStake(
          currentEpoch,
          anotherNodeId,
          scorePerStakeToAdd,
        ),
      )
        .to.emit(RandomSamplingStorage, 'NodeEpochScorePerStakeUpdated')
        .withArgs(
          currentEpoch,
          anotherNodeId,
          scorePerStakeToAdd,
          scorePerStakeToAdd,
        );
      expect(
        await RandomSamplingStorage.getNodeEpochScorePerStake(
          currentEpoch,
          anotherNodeId,
        ),
      ).to.equal(scorePerStakeToAdd);

      // Test different epoch
      await time.increase(Number(await Chronos.epochLength()));
      const nextEpoch = await Chronos.getCurrentEpoch();
      await expect(
        RandomSamplingStorage.addToNodeEpochScorePerStake(
          nextEpoch,
          nodeId,
          scorePerStakeToAdd,
        ),
      )
        .to.emit(RandomSamplingStorage, 'NodeEpochScorePerStakeUpdated')
        .withArgs(
          nextEpoch,
          nodeId,
          scorePerStakeToAdd,
          expectedTotalScorePerStake,
        );
      expect(
        await RandomSamplingStorage.getNodeEpochScorePerStake(
          nextEpoch,
          nodeId,
        ),
      ).to.equal(scorePerStakeToAdd);
    });
  });

  describe('Initialization', () => {
    it('Should have correct name and version', async () => {
      expect(await RandomSamplingStorage.name()).to.equal(
        'RandomSamplingStorage',
      );
      expect(await RandomSamplingStorage.version()).to.equal('1.0.0');
    });

    it('Should set the initial parameters correctly', async function () {
      const proofingPeriod =
        await RandomSamplingStorage.proofingPeriodDurations(0);
      expect(proofingPeriod.durationInBlocks).to.equal(
        proofingPeriodDurationInBlocks,
      );
      const currentEpochTx = await Chronos.getCurrentEpoch();
      const currentEpoch = BigInt(currentEpochTx.toString());
      expect(proofingPeriod.effectiveEpoch).to.equal(currentEpoch);
    });

    it('Should set correct Chronos reference and epoch on initialize', async () => {
      const currentEpoch = await Chronos.getCurrentEpoch();
      await RandomSamplingStorage.initialize();
      const proofingPeriod =
        await RandomSamplingStorage.proofingPeriodDurations(0);
      expect(proofingPeriod.effectiveEpoch).to.equal(currentEpoch);
    });

    it('Should set correct initial values', async () => {
      const currentEpoch = await Chronos.getCurrentEpoch();

      // Deploy a new instance to check initial values before initialization
      const RandomSamplingStorageFactory = await hre.ethers.getContractFactory(
        'RandomSamplingStorage',
      );
      const newRandomSamplingStorage =
        await RandomSamplingStorageFactory.deploy(
          Hub.target,
          proofingPeriodDurationInBlocks,
          avgBlockTimeInSeconds,
          w1,
          w2,
        );

      // Check initial proofing period duration
      const initialDuration =
        await newRandomSamplingStorage.proofingPeriodDurations(0);
      expect(initialDuration.durationInBlocks).to.equal(
        proofingPeriodDurationInBlocks,
      );
      expect(initialDuration.effectiveEpoch).to.equal(currentEpoch);
    });

    it('Should update effectiveEpoch to current epoch after initialize', async () => {
      const currentEpoch = await Chronos.getCurrentEpoch();
      await RandomSamplingStorage.initialize();
      const initialDuration =
        await RandomSamplingStorage.proofingPeriodDurations(0);
      expect(initialDuration.effectiveEpoch).to.equal(currentEpoch);
    });

    it('Should set correct CHUNK_BYTE_SIZE constant', async () => {
      expect(await RandomSamplingStorage.CHUNK_BYTE_SIZE()).to.equal(32);
    });
  });

  describe('Access Control', () => {
    beforeEach(async () => {
      // Register RandomSampling in Hub so it can call onlyContracts methods
      const currentRandomSampling =
        await Hub.getContractAddress('RandomSampling');
      if (currentRandomSampling !== (await RandomSampling.getAddress())) {
        await Hub.connect(accounts[0]).setContractAddress(
          'RandomSampling',
          await RandomSampling.getAddress(),
        );
      }
    });

    it('Should revert contact call if not called by Hub', async () => {
      await expect(RandomSamplingStorage.connect(accounts[1]).initialize())
        .to.be.revertedWithCustomError(
          RandomSamplingStorage,
          'UnauthorizedAccess',
        )
        .withArgs('Only Hub');
    });

    it('Should revert contact call on onlyContract modifiers', async () => {
      await expect(
        RandomSamplingStorage.connect(
          accounts[1],
        ).replacePendingProofingPeriodDuration(0, 0),
      )
        .to.be.revertedWithCustomError(
          RandomSamplingStorage,
          'UnauthorizedAccess',
        )
        .withArgs('Only Contracts in Hub');

      await expect(
        RandomSamplingStorage.connect(accounts[1]).addProofingPeriodDuration(
          0,
          0,
        ),
      )
        .to.be.revertedWithCustomError(
          RandomSamplingStorage,
          'UnauthorizedAccess',
        )
        .withArgs('Only Contracts in Hub');

      await expect(
        RandomSamplingStorage.connect(accounts[1]).setNodeChallenge(
          0,
          MockChallenge,
        ),
      )
        .to.be.revertedWithCustomError(
          RandomSamplingStorage,
          'UnauthorizedAccess',
        )
        .withArgs('Only Contracts in Hub');

      await expect(
        RandomSamplingStorage.connect(
          accounts[1],
        ).incrementEpochNodeValidProofsCount(0, 0),
      )
        .to.be.revertedWithCustomError(
          RandomSamplingStorage,
          'UnauthorizedAccess',
        )
        .withArgs('Only Contracts in Hub');

      await expect(
        RandomSamplingStorage.connect(
          accounts[1],
        ).addToNodeEpochProofPeriodScore(0, 0, 0, 0),
      )
        .to.be.revertedWithCustomError(
          RandomSamplingStorage,
          'UnauthorizedAccess',
        )
        .withArgs('Only Contracts in Hub');

      await expect(
        RandomSamplingStorage.connect(accounts[1]).addToNodeEpochScorePerStake(
          0,
          0,
          0,
        ),
      )
        .to.be.revertedWithCustomError(
          RandomSamplingStorage,
          'UnauthorizedAccess',
        )
        .withArgs('Only Contracts in Hub');

      await expect(
        RandomSamplingStorage.connect(
          accounts[1],
        ).setDelegatorLastSettledNodeEpochScorePerStake(
          0,
          0,
          ethers.encodeBytes32String('0'),
          0,
        ),
      )
        .to.be.revertedWithCustomError(
          RandomSamplingStorage,
          'UnauthorizedAccess',
        )
        .withArgs('Only Contracts in Hub');
    });

    it('Should allow access when called by Hub', async () => {
      await expect(RandomSamplingStorage.connect(accounts[0]).initialize()).to
        .not.be.reverted;

      await expect(RandomSamplingStorage.connect(accounts[1]).initialize()).to
        .be.reverted;

      // Test contract-only functions with RandomSampling
      await impersonateAndFund(RandomSampling);
      const rsSigner = await ethers.getSigner(
        await RandomSampling.getAddress(),
      );

      await expect(
        RandomSamplingStorage.connect(rsSigner).setNodeChallenge(
          0,
          MockChallenge,
        ),
      ).to.not.be.reverted;

      await expect(
        RandomSamplingStorage.connect(
          rsSigner,
        ).replacePendingProofingPeriodDuration(0, 0),
      ).to.not.be.reverted;

      await expect(
        RandomSamplingStorage.connect(rsSigner).addProofingPeriodDuration(0, 0),
      ).to.not.be.reverted;

      await expect(
        RandomSamplingStorage.connect(
          rsSigner,
        ).incrementEpochNodeValidProofsCount(1, 1),
      ).to.not.be.reverted;

      await expect(
        RandomSamplingStorage.connect(rsSigner).addToNodeEpochProofPeriodScore(
          1,
          1,
          1,
          1000,
        ),
      ).to.not.be.reverted;

      await expect(
        RandomSamplingStorage.connect(rsSigner).addToNodeEpochScorePerStake(
          1,
          1,
          1000,
        ),
      ).to.not.be.reverted;

      await expect(
        RandomSamplingStorage.connect(
          rsSigner,
        ).setDelegatorLastSettledNodeEpochScorePerStake(
          1,
          1,
          ethers.encodeBytes32String('test'),
          1000,
        ),
      ).to.not.be.reverted;

      await stopImpersonate(RandomSampling);
    });

    it('Should allow access when called by registered contract', async () => {
      // Test contract-only functions with RandomSampling
      await impersonateAndFund(RandomSampling);
      const rsSigner = await ethers.getSigner(
        await RandomSampling.getAddress(),
      );

      await expect(
        RandomSamplingStorage.connect(
          rsSigner,
        ).replacePendingProofingPeriodDuration(1000, 1),
      ).to.not.be.reverted;

      await expect(
        RandomSamplingStorage.connect(rsSigner).addProofingPeriodDuration(
          1000,
          1,
        ),
      ).to.not.be.reverted;

      await expect(
        RandomSamplingStorage.connect(rsSigner).setNodeChallenge(
          1,
          MockChallenge,
        ),
      ).to.not.be.reverted;

      await expect(
        RandomSamplingStorage.connect(
          rsSigner,
        ).incrementEpochNodeValidProofsCount(1, 1),
      ).to.not.be.reverted;

      await expect(
        RandomSamplingStorage.connect(rsSigner).addToNodeEpochProofPeriodScore(
          1,
          1,
          1,
          1000,
        ),
      ).to.not.be.reverted;

      await expect(
        RandomSamplingStorage.connect(rsSigner).addToNodeEpochScorePerStake(
          1,
          1,
          1000,
        ),
      ).to.not.be.reverted;

      await expect(
        RandomSamplingStorage.connect(
          rsSigner,
        ).setDelegatorLastSettledNodeEpochScorePerStake(
          1,
          1,
          ethers.encodeBytes32String('test'),
          1000,
        ),
      ).to.not.be.reverted;

      await stopImpersonate(RandomSampling);
    });
  });

  describe('Proofing Period Management', () => {
    it('Should return the correct proofing period status', async () => {
      const { activeProofPeriodStartBlock } =
        await updateAndGetActiveProofPeriod();
      const duration =
        await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks();

      // Initial check
      const status = await RandomSamplingStorage.getActiveProofPeriodStatus();
      expect(status.activeProofPeriodStartBlock).to.be.a('bigint');
      expect(status.isValid).to.be.a('boolean');
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(status.isValid).to.be.true;

      // Test at middle of period
      const middleBlock = activeProofPeriodStartBlock + duration / 2n;
      await mineBlocks(
        Number(
          middleBlock - BigInt(await hre.ethers.provider.getBlockNumber()),
        ),
      );
      const middleStatus =
        await RandomSamplingStorage.getActiveProofPeriodStatus();
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(middleStatus.isValid).to.be.true;

      // Test at end of period
      const endBlock = activeProofPeriodStartBlock + duration - 1n;
      await mineBlocks(
        Number(endBlock - BigInt(await hre.ethers.provider.getBlockNumber())),
      );
      const endStatus =
        await RandomSamplingStorage.getActiveProofPeriodStatus();
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(endStatus.isValid).to.be.true;

      // Test after period ends
      await mineBlocks(1);
      const afterStatus =
        await RandomSamplingStorage.getActiveProofPeriodStatus();
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(afterStatus.isValid).to.be.false;
    });

    it('Should update start block correctly for different period scenarios', async () => {
      // Test when no period has passed
      const { activeProofPeriodStartBlock: initialBlock } =
        await updateAndGetActiveProofPeriod();
      const statusNoPeriod =
        await RandomSamplingStorage.getActiveProofPeriodStatus();
      expect(statusNoPeriod.activeProofPeriodStartBlock).to.equal(initialBlock);

      // Test when 1 full period has passed
      const duration =
        await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks();
      await mineBlocks(Number(duration));
      const { activeProofPeriodStartBlock: onePeriodBlock } =
        await updateAndGetActiveProofPeriod();
      expect(onePeriodBlock).to.equal(initialBlock + duration);

      // Test when 2 full periods have passed
      await mineBlocks(Number(duration));
      const { activeProofPeriodStartBlock: twoPeriodBlock } =
        await updateAndGetActiveProofPeriod();
      expect(twoPeriodBlock).to.equal(initialBlock + duration * 2n);

      // Test when n full periods have passed (using n=5 as example)
      const n = 5;
      for (let i = 0; i < n - 2; i++) {
        await mineBlocks(Number(duration));
      }
      const { activeProofPeriodStartBlock: nPeriodBlock } =
        await updateAndGetActiveProofPeriod();
      expect(nPeriodBlock).to.equal(initialBlock + duration * BigInt(n));
    });

    it('Should return correct historical proofing period start', async () => {
      const { activeProofPeriodStartBlock } =
        await updateAndGetActiveProofPeriod();
      const duration =
        await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks();

      // Test invalid inputs
      await expect(
        RandomSamplingStorage.getHistoricalProofPeriodStartBlock(0, 1),
      ).to.be.revertedWith('Proof period start block must be greater than 0');

      await expect(
        RandomSamplingStorage.getHistoricalProofPeriodStartBlock(100, 0),
      ).to.be.revertedWith('Offset must be greater than 0');

      await expect(
        RandomSamplingStorage.getHistoricalProofPeriodStartBlock(
          activeProofPeriodStartBlock + 10n,
          1,
        ),
      ).to.be.revertedWith('Proof period start block is not valid');

      await expect(
        RandomSamplingStorage.getHistoricalProofPeriodStartBlock(
          activeProofPeriodStartBlock,
          999,
        ),
      ).to.be.revertedWithPanic(PANIC_ARITHMETIC_OVERFLOW);

      // Test valid historical blocks
      await mineProofPeriodBlocks(
        activeProofPeriodStartBlock,
        RandomSamplingStorage,
      );
      const { activeProofPeriodStartBlock: newPeriodStartBlock } =
        await updateAndGetActiveProofPeriod();

      // Test offset 1
      const onePeriodBack =
        await RandomSamplingStorage.getHistoricalProofPeriodStartBlock(
          newPeriodStartBlock,
          1,
        );
      expect(onePeriodBack).to.equal(newPeriodStartBlock - duration);

      // Test offset 2
      const twoPeriodsBack =
        await RandomSamplingStorage.getHistoricalProofPeriodStartBlock(
          newPeriodStartBlock,
          2,
        );
      expect(twoPeriodsBack).to.equal(newPeriodStartBlock - duration * 2n);

      // Test offset 3
      const threePeriodsBack =
        await RandomSamplingStorage.getHistoricalProofPeriodStartBlock(
          newPeriodStartBlock,
          3,
        );
      expect(threePeriodsBack).to.equal(newPeriodStartBlock - duration * 3n);

      // Test that returned block is aligned with period start
      expect(threePeriodsBack % duration).to.equal(
        0n,
        'Historical block should be aligned with period start',
      );
    });

    it('Should return correct active proof period', async () => {
      const { activeProofPeriodStartBlock, isValid } =
        await updateAndGetActiveProofPeriod();
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(isValid).to.be.equal(true, 'Period should be valid');

      // Mine blocks up to the last block of the current period
      const currentBlock = await hre.ethers.provider.getBlockNumber();
      const blocksToMine =
        Number(activeProofPeriodStartBlock) +
        Number(proofingPeriodDurationInBlocks) -
        currentBlock -
        1;
      await mineBlocks(blocksToMine);

      let statusAfterUpdate =
        await RandomSamplingStorage.getActiveProofPeriodStatus();
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(statusAfterUpdate.isValid).to.be.equal(
        true,
        'Period should still be valid',
      );

      // Mine one more block to reach the end of the period
      await mineBlocks(1);
      statusAfterUpdate =
        await RandomSamplingStorage.getActiveProofPeriodStatus();
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(statusAfterUpdate.isValid).to.be.equal(
        false,
        'Period should not be valid',
      );

      // Update the period and mine blocks for the new period
      await updateAndGetActiveProofPeriod();
      const newStatus =
        await RandomSamplingStorage.getActiveProofPeriodStatus();
      const blocksToMineNew =
        Number(newStatus.activeProofPeriodStartBlock) +
        Number(proofingPeriodDurationInBlocks) -
        (await hre.ethers.provider.getBlockNumber()) -
        1;
      await mineBlocks(blocksToMineNew);

      statusAfterUpdate =
        await RandomSamplingStorage.getActiveProofPeriodStatus();
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(statusAfterUpdate.isValid).to.be.equal(
        true,
        'New period should be valid',
      );
    });

    it('Should pick correct proofing period duration based on epoch', async () => {
      const initialDuration =
        await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks();
      const epochLength = await Chronos.epochLength();

      // Test initial duration
      expect(initialDuration).to.equal(BigInt(proofingPeriodDurationInBlocks));

      // Test duration in middle of epoch
      await time.increase(Number(epochLength) / 2);
      const midEpochDuration =
        await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks();
      expect(midEpochDuration).to.equal(
        initialDuration,
        'Duration should not change mid-epoch',
      );

      // Set new duration for next epoch
      const newDuration = 1000;
      await RandomSampling.setProofingPeriodDurationInBlocks(newDuration);

      // Verify duration hasn't changed yet
      const beforeEpochEndDuration =
        await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks();
      expect(beforeEpochEndDuration).to.equal(
        initialDuration,
        'Duration should not change before epoch end',
      );

      // Move to next epoch
      await time.increase(Number(epochLength) + 1);
      const nextEpochDuration =
        await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks();
      expect(nextEpochDuration).to.equal(
        BigInt(newDuration),
        'Duration should change in next epoch',
      );

      // Set another duration for future epoch
      const futureDuration = 2000;
      await RandomSampling.setProofingPeriodDurationInBlocks(futureDuration);

      // Verify current epoch still has previous duration
      const currentEpochDuration =
        await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks();
      expect(currentEpochDuration).to.equal(
        BigInt(newDuration),
        'Current epoch should keep previous duration',
      );

      // Move to future epoch
      await time.increase(Number(epochLength));
      const futureEpochDuration =
        await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks();
      expect(futureEpochDuration).to.equal(
        BigInt(futureDuration),
        'Future epoch should have new duration',
      );
    });

    it('Should return correct proofing period duration based on epoch history', async () => {
      const baseDuration = 100;
      const testEpochs = 5;
      const currentEpoch = await Chronos.getCurrentEpoch();
      const epochLength = await Chronos.epochLength();

      // Set up multiple durations with different effective epochs
      const durations = [];
      for (let i = 0; i < testEpochs; i++) {
        const duration = baseDuration + i * 100;
        durations.push(duration);

        await RandomSampling.setProofingPeriodDurationInBlocks(duration);

        await time.increase(Number(epochLength));
      }

      const finalEpoch = await Chronos.getCurrentEpoch();
      expect(finalEpoch).to.equal(currentEpoch + BigInt(testEpochs));

      // Test invalid epoch (before first duration)
      await expect(
        RandomSamplingStorage.getEpochProofingPeriodDurationInBlocks(
          currentEpoch - 1n,
        ),
      ).to.be.revertedWith('No applicable duration found');

      // Test each epoch's duration
      for (let i = 0; i < testEpochs; i++) {
        const targetEpoch = finalEpoch - BigInt(i);
        const expectedDuration = durations[testEpochs - 1 - i];

        const actual =
          await RandomSamplingStorage.getEpochProofingPeriodDurationInBlocks(
            targetEpoch,
          );
        expect(actual).to.equal(
          expectedDuration,
          `Epoch ${targetEpoch} should have duration ${expectedDuration}`,
        );
      }

      // Test edge case - current epoch
      const currentEpochDuration =
        await RandomSamplingStorage.getEpochProofingPeriodDurationInBlocks(
          finalEpoch,
        );
      expect(currentEpochDuration).to.equal(
        durations[durations.length - 1],
        'Current epoch should have the latest duration',
      );

      // Test edge case - first epoch with duration
      const firstEpochWithDuration = currentEpoch;
      const firstEpochDuration =
        await RandomSamplingStorage.getEpochProofingPeriodDurationInBlocks(
          firstEpochWithDuration,
        );
      expect(firstEpochDuration).to.equal(
        durations[0],
        'First epoch should have the first duration',
      );
    });

    it('Should return same block when no period has passed', async () => {
      const { activeProofPeriodStartBlock: initialBlock } =
        await updateAndGetActiveProofPeriod();

      // Mine blocks up to the last block of the current period
      const currentBlock = await hre.ethers.provider.getBlockNumber();
      const blocksToMine =
        Number(initialBlock) +
        Number(proofingPeriodDurationInBlocks) -
        currentBlock -
        2;
      await mineBlocks(blocksToMine);

      const tx =
        await RandomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
      await tx.wait();
      const { activeProofPeriodStartBlock: newBlock } =
        await RandomSamplingStorage.getActiveProofPeriodStatus();

      // Should return the same block since we haven't reached the end of the period
      expect(newBlock).to.equal(initialBlock);

      // Mine one more block to reach the end of the period
      await mineBlocks(1);

      const tx2 =
        await RandomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
      await tx2.wait();
      const { activeProofPeriodStartBlock: finalBlock } =
        await RandomSamplingStorage.getActiveProofPeriodStatus();

      // Should update the block since we've reached the end of the period
      expect(finalBlock).to.be.greaterThan(initialBlock);
    });

    it('Should return correct status for different block numbers', async () => {
      const { activeProofPeriodStartBlock } =
        await updateAndGetActiveProofPeriod();
      const duration =
        await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks();

      // Test at start block
      const statusAtStart =
        await RandomSamplingStorage.getActiveProofPeriodStatus();
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(statusAtStart.isValid).to.be.true;
      expect(statusAtStart.activeProofPeriodStartBlock).to.equal(
        activeProofPeriodStartBlock,
      );

      // Test at middle block
      const middleBlock = activeProofPeriodStartBlock + duration / 2n;
      await mineBlocks(
        Number(
          middleBlock - BigInt(await hre.ethers.provider.getBlockNumber()),
        ),
      );
      const statusAtMiddle =
        await RandomSamplingStorage.getActiveProofPeriodStatus();
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(statusAtMiddle.isValid).to.be.true;

      // Test at last valid block
      const lastValidBlock = activeProofPeriodStartBlock + duration - 1n;
      await mineBlocks(
        Number(
          lastValidBlock - BigInt(await hre.ethers.provider.getBlockNumber()),
        ),
      );
      const statusAtLastValid =
        await RandomSamplingStorage.getActiveProofPeriodStatus();
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(statusAtLastValid.isValid).to.be.true;

      // Test at first invalid block
      await mineBlocks(1);
      const statusAtInvalid =
        await RandomSamplingStorage.getActiveProofPeriodStatus();
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(statusAtInvalid.isValid).to.be.false;
    });
  });

  describe('Challenge Handling', () => {
    it('Should set and get challenge correctly', async () => {
      const publishingNodeIdentityId = 1n;

      const signer = await ethers.getSigner(accounts[0].address);
      await RandomSamplingStorage.connect(signer).setNodeChallenge(
        publishingNodeIdentityId,
        MockChallenge,
      );

      const challenge = await RandomSamplingStorage.getNodeChallenge(
        publishingNodeIdentityId,
      );

      expect(challenge.knowledgeCollectionId).to.be.equal(
        MockChallenge.knowledgeCollectionId,
      );
      expect(challenge.chunkId).to.be.equal(MockChallenge.chunkId);
      expect(challenge.epoch).to.be.equal(MockChallenge.epoch);
      expect(challenge.proofingPeriodDurationInBlocks).to.be.equal(
        MockChallenge.proofingPeriodDurationInBlocks,
      );
      expect(challenge.activeProofPeriodStartBlock).to.be.equal(
        MockChallenge.activeProofPeriodStartBlock,
      );
      expect(challenge.proofingPeriodDurationInBlocks).to.be.equal(
        MockChallenge.proofingPeriodDurationInBlocks,
      );
      expect(challenge.solved).to.be.equal(MockChallenge.solved);
    });

    it('Should handle multiple challenges and updates correctly', async () => {
      const publishingNodeIdentityId = 1n;

      const signer = await ethers.getSigner(accounts[0].address);

      // Test initial state
      const initialChallenge = await RandomSamplingStorage.getNodeChallenge(
        publishingNodeIdentityId,
      );
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(initialChallenge.solved).to.be.false;
      expect(initialChallenge.knowledgeCollectionId).to.be.equal(0n);

      // Set first challenge
      await RandomSamplingStorage.connect(signer).setNodeChallenge(
        publishingNodeIdentityId,
        MockChallenge,
      );

      // Verify first challenge
      const firstChallenge = await RandomSamplingStorage.getNodeChallenge(
        publishingNodeIdentityId,
      );
      expect(firstChallenge.knowledgeCollectionId).to.be.equal(
        MockChallenge.knowledgeCollectionId,
      );
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(firstChallenge.solved).to.be.equal(MockChallenge.solved);

      // Create and set second challenge
      const secondChallenge = {
        ...MockChallenge,
        knowledgeCollectionId: BigInt(MockChallenge.knowledgeCollectionId) + 1n,
        solved: true,
      };
      await RandomSamplingStorage.connect(signer).setNodeChallenge(
        publishingNodeIdentityId,
        secondChallenge,
      );

      // Verify second challenge overwrote first
      const finalChallenge = await RandomSamplingStorage.getNodeChallenge(
        publishingNodeIdentityId,
      );
      expect(finalChallenge.knowledgeCollectionId).to.be.equal(
        secondChallenge.knowledgeCollectionId,
      );
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(finalChallenge.solved).to.be.true;
      expect(finalChallenge.chunkId).to.be.equal(secondChallenge.chunkId);
    });
  });

  describe('Proofing Period Duration Management', () => {
    it('Should correctly track pending proofing period duration', async () => {
      const currentEpoch = await Chronos.getCurrentEpoch();

      // Initially should be false
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(await RandomSamplingStorage.isPendingProofingPeriodDuration()).to
        .be.false;

      // Add a new duration
      await RandomSamplingStorage.addProofingPeriodDuration(
        1000,
        currentEpoch + 1n,
      );
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(await RandomSamplingStorage.isPendingProofingPeriodDuration()).to
        .be.true;

      // Replace pending duration
      await RandomSamplingStorage.replacePendingProofingPeriodDuration(
        2000,
        currentEpoch + 1n,
      );
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(await RandomSamplingStorage.isPendingProofingPeriodDuration()).to
        .be.true;

      // Move to next epoch
      await time.increase(Number(await Chronos.epochLength()));
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(await RandomSamplingStorage.isPendingProofingPeriodDuration()).to
        .be.false;
    });

    it('Should handle multiple proofing period durations correctly', async () => {
      const currentEpoch = await Chronos.getCurrentEpoch();

      // Add multiple durations
      const durations = [1000, 2000, 3000];
      for (let i = 0; i < durations.length; i++) {
        await RandomSamplingStorage.addProofingPeriodDuration(
          durations[i],
          currentEpoch + BigInt(i + 1),
        );
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        expect(await RandomSamplingStorage.isPendingProofingPeriodDuration()).to
          .be.true;
      }

      // Verify durations are set correctly
      for (let i = 0; i < durations.length; i++) {
        const epoch = currentEpoch + BigInt(i + 1);
        const duration =
          await RandomSamplingStorage.getEpochProofingPeriodDurationInBlocks(
            epoch,
          );
        expect(duration).to.equal(BigInt(durations[i]));
      }
    });

    it('Should replace pending duration correctly', async () => {
      const currentEpoch = await Chronos.getCurrentEpoch();

      // Add initial duration
      await RandomSamplingStorage.addProofingPeriodDuration(
        1000,
        currentEpoch + 1n,
      );
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(await RandomSamplingStorage.isPendingProofingPeriodDuration()).to
        .be.true;

      // Replace with new duration
      const newDuration = 2000;
      await RandomSamplingStorage.replacePendingProofingPeriodDuration(
        newDuration,
        currentEpoch + 1n,
      );

      // Verify new duration is set
      const duration =
        await RandomSamplingStorage.getEpochProofingPeriodDurationInBlocks(
          currentEpoch + 1n,
        );
      expect(duration).to.equal(BigInt(newDuration));
    });

    it('Should emit ProofingPeriodDurationAdded event with correct parameters', async () => {
      const newDuration = 1000;
      const effectiveEpoch = (await Chronos.getCurrentEpoch()) + 1n;

      // Add new proofing period duration and capture the event
      const tx = await RandomSamplingStorage.addProofingPeriodDuration(
        newDuration,
        effectiveEpoch,
      );
      const receipt = await tx.wait();

      // Find the ProofingPeriodDurationAdded event
      const event = receipt?.logs.find(
        (log) =>
          (log as EventLog).fragment?.name === 'ProofingPeriodDurationAdded',
      ) as EventLog;

      // Verify event parameters
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(event).to.not.be.undefined;
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(event?.args).to.not.be.undefined;
      expect(event?.args[0]).to.equal(newDuration);
      expect(event?.args[1]).to.equal(effectiveEpoch);
    });

    it('Should emit PendingProofingPeriodDurationReplaced event with correct parameters', async () => {
      const oldDuration = 1000;
      const newDuration = 2000;
      const effectiveEpoch = (await Chronos.getCurrentEpoch()) + 1n;

      // First add a duration
      await RandomSamplingStorage.addProofingPeriodDuration(
        oldDuration,
        effectiveEpoch,
      );

      // Then replace it and capture the event
      const tx =
        await RandomSamplingStorage.replacePendingProofingPeriodDuration(
          newDuration,
          effectiveEpoch,
        );
      const receipt = await tx.wait();

      // Find the PendingProofingPeriodDurationReplaced event
      const event = receipt?.logs.find(
        (log) =>
          (log as EventLog).fragment?.name ===
          'PendingProofingPeriodDurationReplaced',
      ) as EventLog;

      // Verify event parameters
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(event).to.not.be.undefined;
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(event?.args).to.not.be.undefined;
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(event?.args[0]).to.equal(oldDuration);
      expect(event?.args[1]).to.equal(newDuration);
      expect(event?.args[2]).to.equal(effectiveEpoch);
    });
  });

  describe('Delegator Rewards Management', () => {
    it('Should track delegator rewards claimed status correctly', async () => {
      const publishingNodeIdentityId = 1n;
      const signer = await ethers.getSigner(accounts[0].address);
      const currentEpoch = await Chronos.getCurrentEpoch();
      const delegatorKey = ethers.encodeBytes32String('delegator1');

      // Initially should be false
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(
        await RandomSamplingStorage.getEpochNodeDelegatorRewardsClaimed(
          currentEpoch,
          publishingNodeIdentityId,
          delegatorKey,
        ),
      ).to.be.false;

      // Set as claimed
      await RandomSamplingStorage.connect(
        signer,
      ).setEpochNodeDelegatorRewardsClaimed(
        currentEpoch,
        publishingNodeIdentityId,
        delegatorKey,
        true,
      );

      // Verify claimed status
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(
        await RandomSamplingStorage.getEpochNodeDelegatorRewardsClaimed(
          currentEpoch,
          publishingNodeIdentityId,
          delegatorKey,
        ),
      ).to.be.true;

      // Set as not claimed
      await RandomSamplingStorage.connect(
        signer,
      ).setEpochNodeDelegatorRewardsClaimed(
        currentEpoch,
        publishingNodeIdentityId,
        delegatorKey,
        false,
      );

      // Verify not claimed status
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(
        await RandomSamplingStorage.getEpochNodeDelegatorRewardsClaimed(
          currentEpoch,
          publishingNodeIdentityId,
          delegatorKey,
        ),
      ).to.be.false;
    });

    it('Should handle multiple delegators rewards claimed status', async () => {
      const publishingNodeIdentityId = 1n;
      const signer = await ethers.getSigner(accounts[0].address);
      const currentEpoch = await Chronos.getCurrentEpoch();
      const delegatorKeys = [
        ethers.encodeBytes32String('delegator1'),
        ethers.encodeBytes32String('delegator2'),
        ethers.encodeBytes32String('delegator3'),
      ];

      // Set different statuses for different delegators
      for (let i = 0; i < delegatorKeys.length; i++) {
        const claimed = i % 2 === 0; // Alternate between true and false
        await RandomSamplingStorage.connect(
          signer,
        ).setEpochNodeDelegatorRewardsClaimed(
          currentEpoch,
          publishingNodeIdentityId,
          delegatorKeys[i],
          claimed,
        );

        // Verify status
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        expect(
          await RandomSamplingStorage.getEpochNodeDelegatorRewardsClaimed(
            currentEpoch,
            publishingNodeIdentityId,
            delegatorKeys[i],
          ),
        ).to.equal(claimed);
      }
    });

    it('Should maintain separate claimed status for different epochs', async () => {
      const publishingNodeIdentityId = 1n;
      const signer = await ethers.getSigner(accounts[0].address);
      const currentEpoch = await Chronos.getCurrentEpoch();
      const delegatorKey = ethers.encodeBytes32String('delegator1');

      // Set claimed status for current epoch
      await RandomSamplingStorage.connect(
        signer,
      ).setEpochNodeDelegatorRewardsClaimed(
        currentEpoch,
        publishingNodeIdentityId,
        delegatorKey,
        true,
      );

      // Move to next epoch
      await time.increase(Number(await Chronos.epochLength()));
      const nextEpoch = await Chronos.getCurrentEpoch();

      // Verify current epoch is still claimed
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(
        await RandomSamplingStorage.getEpochNodeDelegatorRewardsClaimed(
          currentEpoch,
          publishingNodeIdentityId,
          delegatorKey,
        ),
      ).to.be.true;

      // Verify next epoch is not claimed
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(
        await RandomSamplingStorage.getEpochNodeDelegatorRewardsClaimed(
          nextEpoch,
          publishingNodeIdentityId,
          delegatorKey,
        ),
      ).to.be.false;
    });
  });

  describe('Delegator Last Settled Node Epoch Score Per Stake Management', () => {
    it('Should set and get delegatorLastSettledNodeEpochScorePerStake correctly and emit event', async () => {
      const nodeId = 1n;
      const delegatorKey = ethers.encodeBytes32String('delegatorTest');
      const currentEpoch = await Chronos.getCurrentEpoch();
      const scorePerStakeToSet = 12345n;

      // Initial state
      expect(
        await RandomSamplingStorage.getDelegatorLastSettledNodeEpochScorePerStake(
          currentEpoch,
          nodeId,
          delegatorKey,
        ),
      ).to.equal(
        0n,
        'Initial delegatorLastSettledNodeEpochScorePerStake should be 0',
      );

      // Set scorePerStake and check event
      await expect(
        RandomSamplingStorage.setDelegatorLastSettledNodeEpochScorePerStake(
          currentEpoch,
          nodeId,
          delegatorKey,
          scorePerStakeToSet,
        ),
      )
        .to.emit(
          RandomSamplingStorage,
          'DelegatorLastSettledNodeEpochScorePerStakeUpdated',
        )
        .withArgs(currentEpoch, nodeId, delegatorKey, scorePerStakeToSet);

      // Verify stored value
      expect(
        await RandomSamplingStorage.getDelegatorLastSettledNodeEpochScorePerStake(
          currentEpoch,
          nodeId,
          delegatorKey,
        ),
      ).to.equal(
        scorePerStakeToSet,
        `delegatorLastSettledNodeEpochScorePerStake should be ${scorePerStakeToSet}`,
      );

      // Set again to test overwrite
      const newScorePerStakeToSet = 54321n;
      await expect(
        RandomSamplingStorage.setDelegatorLastSettledNodeEpochScorePerStake(
          currentEpoch,
          nodeId,
          delegatorKey,
          newScorePerStakeToSet,
        ),
      )
        .to.emit(
          RandomSamplingStorage,
          'DelegatorLastSettledNodeEpochScorePerStakeUpdated',
        )
        .withArgs(currentEpoch, nodeId, delegatorKey, newScorePerStakeToSet);

      expect(
        await RandomSamplingStorage.getDelegatorLastSettledNodeEpochScorePerStake(
          currentEpoch,
          nodeId,
          delegatorKey,
        ),
      ).to.equal(
        newScorePerStakeToSet,
        `delegatorLastSettledNodeEpochScorePerStake should be ${newScorePerStakeToSet} after overwrite`,
      );

      // Test different delegatorKey
      const anotherDelegatorKey = ethers.encodeBytes32String('delegatorTest2');
      await expect(
        RandomSamplingStorage.setDelegatorLastSettledNodeEpochScorePerStake(
          currentEpoch,
          nodeId,
          anotherDelegatorKey,
          scorePerStakeToSet,
        ),
      )
        .to.emit(
          RandomSamplingStorage,
          'DelegatorLastSettledNodeEpochScorePerStakeUpdated',
        )
        .withArgs(
          currentEpoch,
          nodeId,
          anotherDelegatorKey,
          scorePerStakeToSet,
        );
      expect(
        await RandomSamplingStorage.getDelegatorLastSettledNodeEpochScorePerStake(
          currentEpoch,
          nodeId,
          anotherDelegatorKey,
        ),
      ).to.equal(scorePerStakeToSet);

      // Test different node
      const anotherNodeId = 2n;
      await expect(
        RandomSamplingStorage.setDelegatorLastSettledNodeEpochScorePerStake(
          currentEpoch,
          anotherNodeId,
          delegatorKey,
          scorePerStakeToSet,
        ),
      )
        .to.emit(
          RandomSamplingStorage,
          'DelegatorLastSettledNodeEpochScorePerStakeUpdated',
        )
        .withArgs(
          currentEpoch,
          anotherNodeId,
          delegatorKey,
          scorePerStakeToSet,
        );
      expect(
        await RandomSamplingStorage.getDelegatorLastSettledNodeEpochScorePerStake(
          currentEpoch,
          anotherNodeId,
          delegatorKey,
        ),
      ).to.equal(scorePerStakeToSet);

      // Test different epoch
      await time.increase(Number(await Chronos.epochLength()));
      const nextEpoch = await Chronos.getCurrentEpoch();
      await expect(
        RandomSamplingStorage.setDelegatorLastSettledNodeEpochScorePerStake(
          nextEpoch,
          nodeId,
          delegatorKey,
          scorePerStakeToSet,
        ),
      )
        .to.emit(
          RandomSamplingStorage,
          'DelegatorLastSettledNodeEpochScorePerStakeUpdated',
        )
        .withArgs(nextEpoch, nodeId, delegatorKey, scorePerStakeToSet);
      expect(
        await RandomSamplingStorage.getDelegatorLastSettledNodeEpochScorePerStake(
          nextEpoch,
          nodeId,
          delegatorKey,
        ),
      ).to.equal(scorePerStakeToSet);
    });
  });

  describe('Edge Cases', () => {
    it('Should revert if no matching duration in blocks found', async () => {
      // Add a new duration that will be effective in the next epoch
      const newDuration = 1000;
      await RandomSampling.setProofingPeriodDurationInBlocks(newDuration);

      // Move to next epoch
      await time.increase(Number(await Chronos.epochLength()));

      // Try to get duration for an epoch before the first duration was set
      await expect(
        RandomSamplingStorage.getEpochProofingPeriodDurationInBlocks(0n),
      ).to.be.revertedWith('No applicable duration found');
    });

    it('Should handle large number of proofing durations correctly', async () => {
      const baseDuration = 100;
      const numDurations = 50; // Large number of durations
      const currentEpoch = await Chronos.getCurrentEpoch();

      // Add multiple durations with different epochs
      for (let i = 0; i < numDurations; i++) {
        const duration = baseDuration + i;
        await RandomSamplingStorage.connect(
          await ethers.getSigner(accounts[0].address),
        ).addProofingPeriodDuration(duration, currentEpoch + BigInt(i));
        await time.increase(Number(await Chronos.epochLength()));
      }

      // Verify each duration is accessible and correct
      for (let i = 0; i < numDurations; i++) {
        const targetEpoch = currentEpoch + BigInt(i);
        const expectedDuration = baseDuration + i;
        const actualDuration =
          await RandomSamplingStorage.getEpochProofingPeriodDurationInBlocks(
            targetEpoch,
          );
        expect(actualDuration).to.equal(expectedDuration);
      }
    });
  });
});
