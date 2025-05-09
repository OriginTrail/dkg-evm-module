import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre, { ethers } from 'hardhat';

import parameters from '../../deployments/parameters.json';
import {
  Hub,
  RandomSamplingStorage,
  Chronos,
  KnowledgeCollectionStorage,
  RandomSampling,
} from '../../typechain';
import { RandomSamplingLib } from '../../typechain/contracts/storage/RandomSamplingStorage';

// Helper functions for random sampling
async function mineBlocks(blocks: number) {
  for (let i = 0; i < blocks; i++) {
    await hre.network.provider.send("evm_mine");
  }
}

async function mineProofPeriodBlocks(
  startBlock: bigint,
  randomSamplingStorage: RandomSamplingStorage
): Promise<bigint> {
  const proofingPeriodDuration = await randomSamplingStorage.getActiveProofingPeriodDurationInBlocks();
  await mineBlocks(Number(proofingPeriodDuration));
  return BigInt(proofingPeriodDuration);
}

async function createMockChallenge(
  randomSamplingStorage: RandomSamplingStorage,
  knowledgeCollectionStorage: KnowledgeCollectionStorage,
  chronos: Chronos
): Promise<RandomSamplingLib.ChallengeStruct> {
  const currentEpoch = await chronos.getCurrentEpoch();
  await randomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
  const { activeProofPeriodStartBlock } = await randomSamplingStorage.getActiveProofPeriodStatus();
  const proofingPeriodDuration = await randomSamplingStorage.getActiveProofingPeriodDurationInBlocks();

  return {
    knowledgeCollectionId: 1n,
    chunkId: 1n,
    knowledgeCollectionStorageContract: await knowledgeCollectionStorage.getAddress(),
    epoch: currentEpoch,
    activeProofPeriodStartBlock,
    proofingPeriodDurationInBlocks: proofingPeriodDuration,
    solved: false
  };
}

type RandomStorageFixture = {
  accounts: SignerWithAddress[];
  RandomSamplingStorage: RandomSamplingStorage;
  Hub: Hub;
  Chronos: Chronos;
};

const PANIC_ARITHMETIC_OVERFLOW = 0x11;

describe('@unit RandomSamplingStorage', function () {
  let Hub: Hub;
  let RandomSamplingStorage: RandomSamplingStorage;
  let RandomSampling: RandomSampling;
  let Chronos: Chronos;
  let KnowledgeCollectionStorage: KnowledgeCollectionStorage;
  let MockChallenge: RandomSamplingLib.ChallengeStruct;
  let accounts: SignerWithAddress[];

  const proofingPeriodDurationInBlocks =
    parameters.development.RandomSamplingStorage.hardhat.proofingPeriodDurationInBlocks;

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
    RandomSamplingStorage = await hre.ethers.getContract<RandomSamplingStorage>(
      'RandomSamplingStorage',
    );
    RandomSampling =
      await hre.ethers.getContract<RandomSampling>('RandomSampling');
    KnowledgeCollectionStorage =
      await hre.ethers.getContract<KnowledgeCollectionStorage>(
        'KnowledgeCollectionStorage',
      );

    await Hub.setContractAddress('HubOwner', accounts[0].address);

    return { accounts, RandomSamplingStorage, Hub, Chronos };
  }

  async function updateAndGetActiveProofPeriod() {
    const tx = await RandomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
    await tx.wait();
    return await RandomSamplingStorage.getActiveProofPeriodStatus();
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ RandomSamplingStorage, Chronos } = await loadFixture(
      deployRandomSamplingFixture,
    ));

    MockChallenge = await createMockChallenge(
      RandomSamplingStorage,
      KnowledgeCollectionStorage,
      Chronos,
    );
  });

  describe('Node Score System', () => {
    it('Should increment and get epoch node valid proofs count', async () => {
      const nodeId = 1n;
      const signer = await ethers.getSigner(accounts[0].address);
      const currentEpoch = await Chronos.getCurrentEpoch();
      const epochLength = await Chronos.epochLength();

      // Test initial state
      const initialCount = await RandomSamplingStorage.getEpochNodeValidProofsCount(
        currentEpoch,
        nodeId
      );
      expect(initialCount).to.equal(0n, 'Should start with 0 proofs');

      // Test incrementing in current epoch
      await RandomSamplingStorage.connect(signer).incrementEpochNodeValidProofsCount(
        currentEpoch,
        nodeId
      );
      const countAfterIncrement = await RandomSamplingStorage.getEpochNodeValidProofsCount(
        currentEpoch,
        nodeId
      );
      expect(countAfterIncrement).to.equal(1n, 'Should increment to 1');

      // Test multiple increments
      await RandomSamplingStorage.connect(signer).incrementEpochNodeValidProofsCount(
        currentEpoch,
        nodeId
      );
      const countAfterMultiple = await RandomSamplingStorage.getEpochNodeValidProofsCount(
        currentEpoch,
        nodeId
      );
      expect(countAfterMultiple).to.equal(2n, 'Should increment to 2');

      // Move to next epoch properly
      await time.increase(Number(epochLength));
      const nextEpoch = await Chronos.getCurrentEpoch();
      expect(nextEpoch).to.equal(currentEpoch + 1n, 'Should be in next epoch');

      // Test in next epoch
      await RandomSamplingStorage.connect(signer).incrementEpochNodeValidProofsCount(
        nextEpoch,
        nodeId
      );
      const nextEpochCount = await RandomSamplingStorage.getEpochNodeValidProofsCount(
        nextEpoch,
        nodeId
      );
      expect(nextEpochCount).to.equal(1n, 'Should start at 1 in new epoch');
      expect(await RandomSamplingStorage.getEpochNodeValidProofsCount(currentEpoch, nodeId))
        .to.equal(2n, 'Previous epoch count should remain unchanged');
    });

    it('Should add to node score and get node score', async () => {
      const nodeIds = [1n, 2n, 3n];
      const signer = await ethers.getSigner(accounts[0].address);
      const currentEpoch = await Chronos.getCurrentEpoch();
      const proofPeriodIndex = 1n;

      // Test initial state for all nodes
      for (const nodeId of nodeIds) {
        expect(await RandomSamplingStorage.getNodeEpochProofPeriodScore(
          nodeId,
          currentEpoch, 
          proofPeriodIndex
        )).to.equal(0n, `Node ${nodeId} should start with 0 score`);
      }
      expect(await RandomSamplingStorage.allNodesEpochProofPeriodScore(
        currentEpoch, 
        proofPeriodIndex
      )).to.equal(0n, 'Global score should start at 0');

      // Add scores to different nodes
      const scores = [100n, 200n, 300n];
      let expectedGlobalScore = 0n;

      for (let i = 0; i < nodeIds.length; i++) {
        const nodeId = nodeIds[i];
        const score = scores[i];
        expectedGlobalScore += score;

        // Add score to node
        await RandomSamplingStorage.connect(signer).addToNodeScore(
          currentEpoch,
          proofPeriodIndex,
          nodeId,
          score
        );

        // Verify individual node score
        const nodeScore = await RandomSamplingStorage.getNodeEpochProofPeriodScore(
          nodeId,
          currentEpoch,
          proofPeriodIndex
        );
        expect(nodeScore).to.equal(score, 
          `Node ${nodeId} should have score ${score}`);

        // Verify global score
        const globalScore = await RandomSamplingStorage.allNodesEpochProofPeriodScore(
          currentEpoch,
          proofPeriodIndex
        );
        expect(globalScore).to.equal(expectedGlobalScore,
          `Global score should be ${expectedGlobalScore} after adding ${score} to node ${nodeId}`);
      }

      // Test adding more score to existing node
      const additionalScore = 50n;
      await RandomSamplingStorage.connect(signer).addToNodeScore(
        currentEpoch,
        proofPeriodIndex,
        nodeIds[0],
        additionalScore
      );

      // Verify updated individual score
      const updatedNodeScore = await RandomSamplingStorage.getNodeEpochProofPeriodScore(
        nodeIds[0],
        currentEpoch,
        proofPeriodIndex
      );
      expect(updatedNodeScore).to.equal(scores[0] + additionalScore,
        'Node score should be updated with additional score');

      // Verify updated global score
      const updatedGlobalScore = await RandomSamplingStorage.allNodesEpochProofPeriodScore(
        currentEpoch,
        proofPeriodIndex
      );
      expect(updatedGlobalScore).to.equal(expectedGlobalScore + additionalScore,
        'Global score should be updated with additional score');
    });

    it('Should accumulate delegator scores correctly', async () => {
      const publishingNodeIdentityId = 1n;
      const signer = await ethers.getSigner(accounts[0].address);
      const currentEpoch = await Chronos.getCurrentEpoch();
      const delegatorKey = ethers.encodeBytes32String('delegator1');
      const score = 100n;

      // Test initial state
      expect(await RandomSamplingStorage.getEpochNodeDelegatorScore(
        currentEpoch,
        publishingNodeIdentityId,
        delegatorKey
      )).to.equal(0n);

      // Add score and verify accumulation
      await RandomSamplingStorage.connect(signer).addToEpochNodeDelegatorScore(
        currentEpoch,
        publishingNodeIdentityId,
        delegatorKey,
        score
      );
      expect(await RandomSamplingStorage.getEpochNodeDelegatorScore(
        currentEpoch,
        publishingNodeIdentityId,
        delegatorKey
      )).to.equal(score);

      // Add more score and verify accumulation
      await RandomSamplingStorage.connect(signer).addToEpochNodeDelegatorScore(
        currentEpoch,
        publishingNodeIdentityId,
        delegatorKey,
        score
      );
      expect(await RandomSamplingStorage.getEpochNodeDelegatorScore(
        currentEpoch,
        publishingNodeIdentityId,
        delegatorKey
      )).to.equal(score * 2n);
    });
  });

  describe('Initialization', () => {
    it('Should have correct name and version', async () => {
      expect(await RandomSamplingStorage.name()).to.equal('RandomSamplingStorage');
      expect(await RandomSamplingStorage.version()).to.equal('1.0.0');
    });

    it('Should set the initial parameters correctly', async function () {
      const proofingPeriod = await RandomSamplingStorage.proofingPeriodDurations(0);
      expect(proofingPeriod.durationInBlocks).to.equal(proofingPeriodDurationInBlocks);
      const currentEpochTx = await Chronos.getCurrentEpoch();
      const currentEpoch = BigInt(currentEpochTx.toString());
      expect(proofingPeriod.effectiveEpoch).to.equal(currentEpoch);
    });

    it('Should set correct Chronos reference and epoch on initialize', async () => {
      const currentEpoch = await Chronos.getCurrentEpoch();
      await RandomSamplingStorage.initialize();
      const proofingPeriod = await RandomSamplingStorage.proofingPeriodDurations(0);
      expect(proofingPeriod.effectiveEpoch).to.equal(currentEpoch);
    });

    it('Should only apply latest epoch on multiple initialize calls', async () => {
      const currentEpoch = await Chronos.getCurrentEpoch();
      
      // First initialization
      await RandomSamplingStorage.initialize();
      const firstProofingPeriod = await RandomSamplingStorage.proofingPeriodDurations(0);
      expect(firstProofingPeriod.effectiveEpoch).to.equal(currentEpoch);

      // Move to next epoch
      await time.increase(Number(await Chronos.epochLength()));
      const nextEpoch = await Chronos.getCurrentEpoch();

      // Add a new duration before second initialization
      const newDuration = 1000;
      await RandomSampling.setProofingPeriodDurationInBlocks(newDuration);

      // Second initialization
      await RandomSamplingStorage.initialize();
      
      // Verify durations are preserved
      const firstDuration = await RandomSamplingStorage.getEpochProofingPeriodDurationInBlocks(currentEpoch);
      const secondDuration = await RandomSamplingStorage.getEpochProofingPeriodDurationInBlocks(nextEpoch);
      
      expect(firstDuration).to.equal(firstProofingPeriod.durationInBlocks);
      expect(secondDuration).to.be.equal(BigInt(newDuration));
    });
  });

  describe('Access Control', () => {
    it('Should revert contact call if not called by Hub', async () => {
      await expect(RandomSamplingStorage.connect(accounts[1]).initialize())
        .to.be.revertedWithCustomError(RandomSamplingStorage, 'UnauthorizedAccess')
        .withArgs('Only Hub');
    });

    it('Should revert contact call on onlyContract modifiers', async () => {
      await expect(
        RandomSamplingStorage.connect(accounts[1]).replacePendingProofingPeriodDuration(0, 0)
      )
        .to.be.revertedWithCustomError(RandomSamplingStorage, 'UnauthorizedAccess')
        .withArgs('Only Contracts in Hub');

      await expect(
        RandomSamplingStorage.connect(accounts[1]).addProofingPeriodDuration(0, 0)
      )
        .to.be.revertedWithCustomError(RandomSamplingStorage, 'UnauthorizedAccess')
        .withArgs('Only Contracts in Hub');

      await expect(
        RandomSamplingStorage.connect(accounts[1]).setNodeChallenge(0, MockChallenge)
      )
        .to.be.revertedWithCustomError(RandomSamplingStorage, 'UnauthorizedAccess')
        .withArgs('Only Contracts in Hub');

      await expect(
        RandomSamplingStorage.connect(accounts[1]).incrementEpochNodeValidProofsCount(0, 0)
      )
        .to.be.revertedWithCustomError(RandomSamplingStorage, 'UnauthorizedAccess')
        .withArgs('Only Contracts in Hub');

      await expect(
        RandomSamplingStorage.connect(accounts[1]).addToNodeScore(0, 0, 0, 0)
      )
        .to.be.revertedWithCustomError(RandomSamplingStorage, 'UnauthorizedAccess')
        .withArgs('Only Contracts in Hub');

      await expect(
        RandomSamplingStorage.connect(accounts[1]).addToEpochNodeDelegatorScore(
          0,
          0,
          ethers.encodeBytes32String('0'),
          0
        )
      )
        .to.be.revertedWithCustomError(RandomSamplingStorage, 'UnauthorizedAccess')
        .withArgs('Only Contracts in Hub');
    });

    it('Should allow access when called by Hub', async () => {
      const { RandomSamplingStorage, Hub } = await loadFixture(deployRandomSamplingFixture);
      const hubSigner = await Hub.runner;
      
      // Test initialize
      await expect(RandomSamplingStorage.connect(hubSigner).initialize())
        .to.not.be.reverted;

      // Test setNodeChallenge
      await expect(
        RandomSamplingStorage.connect(hubSigner).setNodeChallenge(0, MockChallenge)
      ).to.not.be.reverted;

      // Test replacePendingProofingPeriodDuration
      await expect(
        RandomSamplingStorage.connect(hubSigner).replacePendingProofingPeriodDuration(0, 0)
      ).to.not.be.reverted;

      // Test addProofingPeriodDuration
      await expect(
        RandomSamplingStorage.connect(hubSigner).addProofingPeriodDuration(0, 0)
      ).to.not.be.reverted;
    });
  });

  describe('Proofing Period Management', () => {
    it('Should return the correct proofing period status', async () => {
      const { activeProofPeriodStartBlock } = await updateAndGetActiveProofPeriod();
      const duration = await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks();

      // Initial check
      const status = await RandomSamplingStorage.getActiveProofPeriodStatus();
      expect(status.activeProofPeriodStartBlock).to.be.a('bigint');
      expect(status.isValid).to.be.a('boolean');
      expect(status.isValid).to.be.true;

      // Test at middle of period
      const middleBlock = activeProofPeriodStartBlock + (duration / 2n);
      await mineBlocks(Number(middleBlock - BigInt(await hre.ethers.provider.getBlockNumber())));
      const middleStatus = await RandomSamplingStorage.getActiveProofPeriodStatus();
      expect(middleStatus.isValid).to.be.true;

      // Test at end of period
      const endBlock = activeProofPeriodStartBlock + duration - 1n;
      await mineBlocks(Number(endBlock - BigInt(await hre.ethers.provider.getBlockNumber())));
      const endStatus = await RandomSamplingStorage.getActiveProofPeriodStatus();
      expect(endStatus.isValid).to.be.true;

      // Test after period ends
      await mineBlocks(1);
      const afterStatus = await RandomSamplingStorage.getActiveProofPeriodStatus();
      expect(afterStatus.isValid).to.be.false;
    });

    it('Should update start block correctly for different period scenarios', async () => {
      // Test when no period has passed
      const { activeProofPeriodStartBlock: initialBlock } = await updateAndGetActiveProofPeriod();
      const statusNoPeriod = await RandomSamplingStorage.getActiveProofPeriodStatus();
      expect(statusNoPeriod.activeProofPeriodStartBlock).to.equal(initialBlock);

      // Test when 1 full period has passed
      const duration = await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks();
      await mineBlocks(Number(duration));
      const { activeProofPeriodStartBlock: onePeriodBlock } = await updateAndGetActiveProofPeriod();
      expect(onePeriodBlock).to.equal(initialBlock + duration);

      // Test when 2 full periods have passed
      await mineBlocks(Number(duration));
      const { activeProofPeriodStartBlock: twoPeriodBlock } = await updateAndGetActiveProofPeriod();
      expect(twoPeriodBlock).to.equal(initialBlock + (duration * 2n));

      // Test when n full periods have passed (using n=5 as example)
      const n = 5;
      for (let i = 0; i < n - 2; i++) {
        await mineBlocks(Number(duration));
      }
      const { activeProofPeriodStartBlock: nPeriodBlock } = await updateAndGetActiveProofPeriod();
      expect(nPeriodBlock).to.equal(initialBlock + (duration * BigInt(n)));
    });

    it('Should return correct historical proofing period start', async () => {
      const { activeProofPeriodStartBlock } = await updateAndGetActiveProofPeriod();
      const duration = await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks();

      // Test invalid inputs
      await expect(
        RandomSamplingStorage.getHistoricalProofPeriodStartBlock(0, 1)
      ).to.be.revertedWith('Proof period start block must be greater than 0');
      
      await expect(
        RandomSamplingStorage.getHistoricalProofPeriodStartBlock(100, 0)
      ).to.be.revertedWith('Offset must be greater than 0');
      
      await expect(
        RandomSamplingStorage.getHistoricalProofPeriodStartBlock(activeProofPeriodStartBlock + 10n, 1)
      ).to.be.revertedWith('Proof period start block is not valid');
      
      await expect(
        RandomSamplingStorage.getHistoricalProofPeriodStartBlock(activeProofPeriodStartBlock, 999)
      ).to.be.revertedWithPanic(PANIC_ARITHMETIC_OVERFLOW);

      // Test valid historical blocks
      await mineProofPeriodBlocks(activeProofPeriodStartBlock, RandomSamplingStorage);
      const { activeProofPeriodStartBlock: newPeriodStartBlock } = await updateAndGetActiveProofPeriod();

      // Test offset 1
      const onePeriodBack = await RandomSamplingStorage.getHistoricalProofPeriodStartBlock(
        newPeriodStartBlock,
        1
      );
      expect(onePeriodBack).to.equal(newPeriodStartBlock - duration);

      // Test offset 2
      const twoPeriodsBack = await RandomSamplingStorage.getHistoricalProofPeriodStartBlock(
        newPeriodStartBlock,
        2
      );
      expect(twoPeriodsBack).to.equal(newPeriodStartBlock - (duration * 2n));

      // Test offset 3
      const threePeriodsBack = await RandomSamplingStorage.getHistoricalProofPeriodStartBlock(
        newPeriodStartBlock,
        3
      );
      expect(threePeriodsBack).to.equal(newPeriodStartBlock - (duration * 3n));

      // Test that returned block is aligned with period start
      expect(threePeriodsBack % duration).to.equal(0n, 'Historical block should be aligned with period start');
    });

    it('Should return correct active proof period', async () => {
      const { activeProofPeriodStartBlock, isValid } = await updateAndGetActiveProofPeriod();
      expect(isValid).to.be.equal(true, 'Period should be valid');

      // Mine blocks up to the last block of the current period
      const currentBlock = await hre.ethers.provider.getBlockNumber();
      const blocksToMine = Number(activeProofPeriodStartBlock) + Number(proofingPeriodDurationInBlocks) - currentBlock - 1;
      await mineBlocks(blocksToMine);
      
      let statusAfterUpdate = await RandomSamplingStorage.getActiveProofPeriodStatus();
      expect(statusAfterUpdate.isValid).to.be.equal(true, 'Period should still be valid');

      // Mine one more block to reach the end of the period
      await mineBlocks(1);
      statusAfterUpdate = await RandomSamplingStorage.getActiveProofPeriodStatus();
      expect(statusAfterUpdate.isValid).to.be.equal(false, 'Period should not be valid');

      // Update the period and mine blocks for the new period
      await updateAndGetActiveProofPeriod();
      const newStatus = await RandomSamplingStorage.getActiveProofPeriodStatus();
      const blocksToMineNew = Number(newStatus.activeProofPeriodStartBlock) + Number(proofingPeriodDurationInBlocks) - (await hre.ethers.provider.getBlockNumber()) - 1;
      await mineBlocks(blocksToMineNew);
      
      statusAfterUpdate = await RandomSamplingStorage.getActiveProofPeriodStatus();
      expect(statusAfterUpdate.isValid).to.be.equal(true, 'New period should be valid');
    });

    it('Should pick correct proofing period duration based on epoch', async () => {
      const initialDuration = await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks();
      const currentEpoch = await Chronos.getCurrentEpoch();
      const epochLength = await Chronos.epochLength();

      // Test initial duration
      expect(initialDuration).to.equal(BigInt(proofingPeriodDurationInBlocks));

      // Test duration in middle of epoch
      await time.increase(Number(epochLength) / 2);
      const midEpochDuration = await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks();
      expect(midEpochDuration).to.equal(initialDuration, 'Duration should not change mid-epoch');

      // Set new duration for next epoch
      const newDuration = 1000;
      await RandomSampling.setProofingPeriodDurationInBlocks(newDuration);
      
      // Verify duration hasn't changed yet
      const beforeEpochEndDuration = await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks();
      expect(beforeEpochEndDuration).to.equal(initialDuration, 'Duration should not change before epoch end');

      // Move to next epoch
      await time.increase(Number(epochLength) + 1);
      const nextEpochDuration = await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks();
      expect(nextEpochDuration).to.equal(BigInt(newDuration), 'Duration should change in next epoch');

      // Set another duration for future epoch
      const futureDuration = 2000;
      await RandomSampling.setProofingPeriodDurationInBlocks(futureDuration);
      
      // Verify current epoch still has previous duration
      const currentEpochDuration = await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks();
      expect(currentEpochDuration).to.equal(BigInt(newDuration), 'Current epoch should keep previous duration');

      // Move to future epoch
      await time.increase(Number(epochLength));
      const futureEpochDuration = await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks();
      expect(futureEpochDuration).to.equal(BigInt(futureDuration), 'Future epoch should have new duration');
    });

    it('Should return correct proofing period duration based on epoch history', async () => {
      const baseDuration = 100;
      const testEpochs = 5; // Increased number of epochs for better coverage
      const currentEpoch = await Chronos.getCurrentEpoch();
      const epochLength = await Chronos.epochLength();

      // Set up multiple durations with different effective epochs
      const durations = [];
      for (let i = 0; i < testEpochs; i++) {
        const duration = baseDuration + (i * 100); // Larger increments for clearer testing
        durations.push(duration);
        await RandomSampling.setProofingPeriodDurationInBlocks(duration);
        await time.increase(Number(epochLength));
      }

      const finalEpoch = await Chronos.getCurrentEpoch();
      expect(finalEpoch).to.equal(currentEpoch + BigInt(testEpochs));

      // Test invalid epoch (before first duration)
      await expect(
        RandomSamplingStorage.getEpochProofingPeriodDurationInBlocks(currentEpoch - 1n)
      ).to.be.revertedWith('No applicable duration found');

      // Test each epoch's duration
      for (let i = 0; i < testEpochs; i++) {
        const targetEpoch = finalEpoch - BigInt(i);
        const expectedDuration = durations[testEpochs - 1 - i];
        
        const actual = await RandomSamplingStorage.getEpochProofingPeriodDurationInBlocks(targetEpoch);
        expect(actual).to.equal(expectedDuration, 
          `Epoch ${targetEpoch} should have duration ${expectedDuration}`);
      }

      // Test edge case - current epoch
      const currentEpochDuration = await RandomSamplingStorage.getEpochProofingPeriodDurationInBlocks(finalEpoch);
      expect(currentEpochDuration).to.equal(durations[durations.length - 1],
        'Current epoch should have the latest duration');

      // Test edge case - first epoch with duration
      const firstEpochWithDuration = currentEpoch;
      const firstEpochDuration = await RandomSamplingStorage.getEpochProofingPeriodDurationInBlocks(firstEpochWithDuration);
      expect(firstEpochDuration).to.equal(durations[0],
        'First epoch should have the first duration');
    });

    it('Should return same block when no period has passed', async () => {
      const { activeProofPeriodStartBlock: initialBlock } = await updateAndGetActiveProofPeriod();
      
      // Mine blocks up to the last block of the current period
      const currentBlock = await hre.ethers.provider.getBlockNumber();
      const blocksToMine = Number(initialBlock) + Number(proofingPeriodDurationInBlocks) - currentBlock - 2;
      await mineBlocks(blocksToMine);
      
      const tx = await RandomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
      await tx.wait();
      const { activeProofPeriodStartBlock: newBlock } = await RandomSamplingStorage.getActiveProofPeriodStatus();
      
      // Should return the same block since we haven't reached the end of the period
      expect(newBlock).to.equal(initialBlock);

      // Mine one more block to reach the end of the period
      await mineBlocks(1);
      
      const tx2 = await RandomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
      await tx2.wait();
      const { activeProofPeriodStartBlock: finalBlock } = await RandomSamplingStorage.getActiveProofPeriodStatus();
      
      // Should update the block since we've reached the end of the period
      expect(finalBlock).to.be.greaterThan(initialBlock);
    });

    it('Should return correct status for different block numbers', async () => {
      const { activeProofPeriodStartBlock } = await updateAndGetActiveProofPeriod();
      const duration = await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks();

      // Test at start block
      const statusAtStart = await RandomSamplingStorage.getActiveProofPeriodStatus();
      expect(statusAtStart.isValid).to.be.true;
      expect(statusAtStart.activeProofPeriodStartBlock).to.equal(activeProofPeriodStartBlock);

      // Test at middle block
      const middleBlock = activeProofPeriodStartBlock + (duration / 2n);
      await mineBlocks(Number(middleBlock - BigInt(await hre.ethers.provider.getBlockNumber())));
      const statusAtMiddle = await RandomSamplingStorage.getActiveProofPeriodStatus();
      expect(statusAtMiddle.isValid).to.be.true;

      // Test at last valid block
      const lastValidBlock = activeProofPeriodStartBlock + duration - 1n;
      await mineBlocks(Number(lastValidBlock - BigInt(await hre.ethers.provider.getBlockNumber())));
      const statusAtLastValid = await RandomSamplingStorage.getActiveProofPeriodStatus();
      expect(statusAtLastValid.isValid).to.be.true;

      // Test at first invalid block
      await mineBlocks(1);
      const statusAtInvalid = await RandomSamplingStorage.getActiveProofPeriodStatus();
      expect(statusAtInvalid.isValid).to.be.false;
    });
  });

  describe('Challenge Handling', () => {
    it('Should set and get challenge correctly', async () => {
      const publishingNodeIdentityId = 1n;

      const signer = await ethers.getSigner(accounts[0].address);
      await RandomSamplingStorage.connect(signer).setNodeChallenge(
        publishingNodeIdentityId,
        MockChallenge
      );

      const challenge = await RandomSamplingStorage.getNodeChallenge(publishingNodeIdentityId);

      expect(challenge.knowledgeCollectionId).to.be.equal(MockChallenge.knowledgeCollectionId);
      expect(challenge.chunkId).to.be.equal(MockChallenge.chunkId);
      expect(challenge.epoch).to.be.equal(MockChallenge.epoch);
      expect(challenge.proofingPeriodDurationInBlocks).to.be.equal(
        MockChallenge.proofingPeriodDurationInBlocks
      );
      expect(challenge.activeProofPeriodStartBlock).to.be.equal(
        MockChallenge.activeProofPeriodStartBlock
      );
      expect(challenge.proofingPeriodDurationInBlocks).to.be.equal(
        MockChallenge.proofingPeriodDurationInBlocks
      );
      expect(challenge.solved).to.be.equal(MockChallenge.solved);
    });

    it('Should handle multiple challenges and updates correctly', async () => {
      const publishingNodeIdentityId = 1n;

      const signer = await ethers.getSigner(accounts[0].address);

      // Test initial state
      const initialChallenge = await RandomSamplingStorage.getNodeChallenge(publishingNodeIdentityId);
      expect(initialChallenge.solved).to.be.false;
      expect(initialChallenge.knowledgeCollectionId).to.be.equal(0n);

      // Set first challenge
      await RandomSamplingStorage.connect(signer).setNodeChallenge(
        publishingNodeIdentityId,
        MockChallenge
      );

      // Verify first challenge
      const firstChallenge = await RandomSamplingStorage.getNodeChallenge(publishingNodeIdentityId);
      expect(firstChallenge.knowledgeCollectionId).to.be.equal(MockChallenge.knowledgeCollectionId);
      expect(firstChallenge.solved).to.be.equal(MockChallenge.solved);

      // Create and set second challenge
      const secondChallenge = {
        ...MockChallenge,
        knowledgeCollectionId: BigInt(MockChallenge.knowledgeCollectionId) + 1n,
        solved: true
      };
      await RandomSamplingStorage.connect(signer).setNodeChallenge(
        publishingNodeIdentityId,
        secondChallenge
      );

      // Verify second challenge overwrote first
      const finalChallenge = await RandomSamplingStorage.getNodeChallenge(publishingNodeIdentityId);
      expect(finalChallenge.knowledgeCollectionId).to.be.equal(secondChallenge.knowledgeCollectionId);
      expect(finalChallenge.solved).to.be.true;
      expect(finalChallenge.chunkId).to.be.equal(secondChallenge.chunkId);
    });
  });

  describe('Proofing Period Duration', () => {
    it('Should revert if no matching duration in blocks found', async () => {
      // Get current epoch
      const currentEpoch = await Chronos.getCurrentEpoch();
      
      // Add a new duration that will be effective in the next epoch
      const newDuration = 1000;
      await RandomSampling.setProofingPeriodDurationInBlocks(newDuration);
      
      // Move to next epoch
      await time.increase(Number(await Chronos.epochLength()));
      
      // Try to get duration for an epoch before the first duration was set
      await expect(
        RandomSamplingStorage.getEpochProofingPeriodDurationInBlocks(0n)
      ).to.be.revertedWith('No applicable duration found');
    });

    it('Should handle large number of proofing durations correctly', async () => {
      const baseDuration = 100;
      const numDurations = 50; // Large number of durations
      const currentEpoch = await Chronos.getCurrentEpoch();

      // Add multiple durations with different epochs
      for (let i = 0; i < numDurations; i++) {
        const duration = baseDuration + i;
        await RandomSamplingStorage.connect(await ethers.getSigner(accounts[0].address))
          .addProofingPeriodDuration(duration, currentEpoch + BigInt(i));
        await time.increase(Number(await Chronos.epochLength()));
      }

      // Verify each duration is accessible and correct
      for (let i = 0; i < numDurations; i++) {
        const targetEpoch = currentEpoch + BigInt(i);
        const expectedDuration = baseDuration + i;
        const actualDuration = await RandomSamplingStorage.getEpochProofingPeriodDurationInBlocks(targetEpoch);
        expect(actualDuration).to.equal(expectedDuration);
      }
    });
  });
});
