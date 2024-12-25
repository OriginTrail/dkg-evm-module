import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre from 'hardhat';

import { EpochStorage } from '../../typechain';

type EpochStorageFixture = {
  accounts: SignerWithAddress[];
  EpochStorage: EpochStorage;
};

describe('@unit EpochStorage', () => {
  let accounts: SignerWithAddress[];
  let EpochStorage: EpochStorage;

  async function deployEpochStorageFixture(): Promise<EpochStorageFixture> {
    await hre.deployments.fixture(['EpochStorage']);
    EpochStorage = await hre.ethers.getContract<EpochStorage>('EpochStorageV8');
    accounts = await hre.ethers.getSigners();
    return { accounts, EpochStorage };
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ accounts, EpochStorage } = await loadFixture(deployEpochStorageFixture));
  });

  it('Add knowledge value for single epoch, verify totals and max', async () => {
    const epoch = 10;
    await EpochStorage.addEpochProducedKnowledgeValue(123, epoch, 500);
    expect(await EpochStorage.getEpochProducedKnowledgeValue(epoch)).to.equal(
      500,
    );
    expect(
      await EpochStorage.getNodeEpochProducedKnowledgeValue(123, epoch),
    ).to.equal(500);
    expect(
      await EpochStorage.getEpochNodeMaxProducedKnowledgeValue(epoch),
    ).to.equal(500);
  });

  it('Add knowledge values to multiple epochs, check accumulated node stats', async () => {
    await EpochStorage.addEpochProducedKnowledgeValue(42, 1, 1000);
    await EpochStorage.addEpochProducedKnowledgeValue(42, 2, 250);
    await EpochStorage.addEpochProducedKnowledgeValue(42, 3, 500);
    expect(await EpochStorage.getEpochProducedKnowledgeValue(1)).to.equal(1000);
    expect(await EpochStorage.getEpochProducedKnowledgeValue(2)).to.equal(250);
    expect(await EpochStorage.getEpochProducedKnowledgeValue(3)).to.equal(500);
    expect(
      await EpochStorage.getNodeEpochProducedKnowledgeValue(42, 1),
    ).to.equal(1000);
    expect(
      await EpochStorage.getNodeEpochProducedKnowledgeValue(42, 2),
    ).to.equal(250);
    expect(
      await EpochStorage.getNodeEpochProducedKnowledgeValue(42, 3),
    ).to.equal(500);
  });

  it('Get node knowledge value percentage returns zero if total is zero', async () => {
    expect(
      await EpochStorage.getNodeEpochProducedKnowledgeValuePercentage(
        9999,
        100,
      ),
    ).to.equal(0);
    await EpochStorage.addEpochProducedKnowledgeValue(777, 100, 0);
    expect(
      await EpochStorage.getNodeEpochProducedKnowledgeValuePercentage(777, 100),
    ).to.equal(0);
  });

  it('Add tokens to epoch range, check pool and remainder', async () => {
    await EpochStorage.addTokensToEpochRange(1, 5, 9, 1000);
    expect(await EpochStorage.accumulatedRemainder(1)).to.be.lte(100); // some remainder left
    expect(await EpochStorage.getEpochPool(1, 5)).to.be.gt(0);
    expect(await EpochStorage.getEpochPool(1, 9)).to.be.gt(0);
  });

  it('Pay out epoch tokens, verify distribution and nodePaidOut', async () => {
    await EpochStorage.addTokensToEpochRange(2, 1, 1, 1000);
    await EpochStorage.payOutEpochTokens(2, 1, 500, 300);
    expect(await EpochStorage.getEpochDistributedPool(2, 1)).to.equal(300);
    expect(await EpochStorage.getNodeEpochPaidOut(2, 500, 1)).to.equal(300);
    await EpochStorage.payOutEpochTokens(2, 1, 500, 200);
    expect(await EpochStorage.getEpochDistributedPool(2, 1)).to.equal(500);
    expect(await EpochStorage.getNodeEpochPaidOut(2, 500, 1)).to.equal(500);
  });

  it('Add tokens to multiple epochs, finalize, then check correct cumulative values', async () => {
    await EpochStorage.addTokensToEpochRange(3, 2, 5, 5000);
    expect(await EpochStorage.getEpochPool(3, 2)).to.be.gt(0);
    expect(await EpochStorage.getEpochPool(3, 6)).to.be.equal(0);
    expect(await EpochStorage.getEpochDistributedPool(3, 4)).to.equal(0);
  });

  it('Simulate paying out across epochs and nodes, random checks', async () => {
    await EpochStorage.addTokensToEpochRange(4, 5, 5, 6000);
    await EpochStorage.payOutEpochTokens(4, 5, 111, 200);
    await EpochStorage.payOutEpochTokens(4, 5, 222, 300);
    expect(await EpochStorage.getEpochDistributedPool(4, 5)).to.equal(500);
    expect(await EpochStorage.getNodeEpochPaidOut(4, 111, 5)).to.equal(200);
    expect(await EpochStorage.getNodeEpochPaidOut(4, 222, 5)).to.equal(300);
  });

  it('Add large range tokens, partial remainders, finalize, verify pools', async () => {
    await EpochStorage.addTokensToEpochRange(5, 1, 10, 9999);
    await EpochStorage.addTokensToEpochRange(5, 1, 5, 555);
    expect(await EpochStorage.getEpochPool(5, 10)).to.be.closeTo(1000, 1);
    expect(await EpochStorage.accumulatedRemainder(5)).to.be.gt(0);
  });

  it('Add big knowledge values for multiple identities in same epoch, check nodeMax', async () => {
    await EpochStorage.addEpochProducedKnowledgeValue(101, 20, 1500);
    await EpochStorage.addEpochProducedKnowledgeValue(202, 20, 3000);
    await EpochStorage.addEpochProducedKnowledgeValue(303, 20, 2800);
    expect(
      await EpochStorage.getEpochNodeMaxProducedKnowledgeValue(20),
    ).to.equal(3000);
  });

  it('Verify getCurrentEpochPool with no tokens added, expecting zero', async () => {
    const shardId = 7;
    expect(await EpochStorage.getCurrentEpochPool(shardId)).to.equal(0);
  });

  it('Verify getCurrentEpochPool after adding tokens to current epoch', async () => {
    const shardId = 8;
    const currentEpoch = await hre.ethers.getContractAt(
      'Chronos',
      await EpochStorage.chronos(),
    );
    const epochNum = await currentEpoch.getCurrentEpoch();
    await EpochStorage.addTokensToEpochRange(shardId, epochNum, epochNum, 2000);
    expect(await EpochStorage.getCurrentEpochPool(shardId)).to.be.equal(2000);
  });

  it('Check getEpochRangePool for partially overlapping epochs, ensuring correct totals', async () => {
    const shardId = 9;
    await EpochStorage.addTokensToEpochRange(shardId, 2, 4, 3000);
    await EpochStorage.addTokensToEpochRange(shardId, 3, 5, 2000);
    expect(
      (await EpochStorage.getEpochRangePool(shardId, 2, 5)) +
        (await EpochStorage.accumulatedRemainder(shardId)),
    ).to.be.equal(5000);
  });

  it('Validate getPreviousEpochPool when current epoch is 1, expecting zero', async () => {
    const shardId = 10;
    expect(await EpochStorage.getPreviousEpochPool(shardId)).to.equal(0);
  });

  it('Add tokens to partially overlapping ranges, finalize them, verify getEpochPool returns expected values', async () => {
    const shardId = 11;
    await EpochStorage.addTokensToEpochRange(shardId, 2, 5, 4000);
    await EpochStorage.addTokensToEpochRange(shardId, 4, 6, 3000);

    const epoch4Pool = await EpochStorage.getEpochPool(shardId, 4);
    const epoch5Pool = await EpochStorage.getEpochPool(shardId, 5);
    const epoch6Pool = await EpochStorage.getEpochPool(shardId, 6);
    expect(epoch4Pool).to.be.equal(2000);
    expect(epoch5Pool).to.be.equal(2000);
    expect(epoch6Pool).to.be.equal(1000);
  });

  it('Add tokens to multiple ranges, then partially pay out tokens, check getEpochPool remains correct', async () => {
    const shardId = 12;
    await EpochStorage.addTokensToEpochRange(shardId, 3, 3, 1000);
    await EpochStorage.addTokensToEpochRange(shardId, 3, 4, 2000);

    const oldPool4 = await EpochStorage.getEpochPool(shardId, 4);

    // Pay out some tokens in epoch 3
    await EpochStorage.payOutEpochTokens(shardId, 3, 99, 500);
    const dist3 = await EpochStorage.getEpochDistributedPool(shardId, 3);
    const pool3 = await EpochStorage.getEpochPool(shardId, 3);
    expect(dist3).to.equal(500);
    expect(pool3).to.be.gte(dist3); // pool should be >= distributed

    // Check next epoch is still unaffected
    const newPool4 = await EpochStorage.getEpochPool(shardId, 4);
    expect(newPool4).to.be.equal(oldPool4);
  });

  it('Add tokens across multiple ranges, verify getEpochRangePool sums up properly', async () => {
    const shardId = 13;
    await EpochStorage.addTokensToEpochRange(shardId, 5, 7, 2100);
    await EpochStorage.addTokensToEpochRange(shardId, 6, 8, 1800);
    const fullRangePool = await EpochStorage.getEpochRangePool(shardId, 5, 8);
    expect(fullRangePool).to.be.equal(3900);
    expect(await EpochStorage.getEpochRangePool(shardId, 6, 7)).to.be.equal(
      2600,
    );
  });

  it('Check getPreviousEpochPool after adding tokens, then increment epoch to finalize', async () => {
    const shardId = 14;
    await EpochStorage.addTokensToEpochRange(shardId, 1, 1, 2000);
    // Move to next epoch
    await time.increase(3601);
    expect(await EpochStorage.getPreviousEpochPool(shardId)).to.equal(2000);
  });

  it('Complex overlapping ranges: verify expected epoch pools and compare getEpochPool vs getEpochRangePool', async () => {
    const shardId = 15;

    // Add two overlapping ranges: epochs 10-20 => 50000 tokens, epochs 15-25 => 60000 tokens
    await EpochStorage.addTokensToEpochRange(shardId, 10, 20, 50000);
    await EpochStorage.addTokensToEpochRange(shardId, 15, 25, 60000);

    // Check pools for a few key epochs in the overlapping region
    const pool15 = await EpochStorage.getEpochPool(shardId, 15);
    const pool20 = await EpochStorage.getEpochPool(shardId, 20);
    const pool25 = await EpochStorage.getEpochPool(shardId, 25);

    // Since epoch 15 and 20 are in both ranges, and epoch 25 is only in the second range,
    // we expect pool25 to be strictly less than pool20
    expect(pool15).to.be.gt(0);
    expect(pool20).to.be.gte(pool15);
    expect(pool25).to.be.lt(pool20);

    // Compare getEpochRangePool(15, 25) vs sum of getEpochPool for each epoch in [15..25]
    let summedEpochPools = 0;
    for (let e = 15; e <= 25; e++) {
      summedEpochPools += Number(await EpochStorage.getEpochPool(shardId, e));
    }
    const rangePool = Number(
      await EpochStorage.getEpochRangePool(shardId, 15, 25),
    );
    // Expect them to be reasonably close (allowing minor remainder differences)
    expect(rangePool).to.be.closeTo(summedEpochPools, 1);
  });

  it('Add tokens to a single long range, then retrieve getEpochPool vs getEpochRangePool for smaller sub-ranges', async () => {
    const shardId = 16;

    // Add a large range: 5-15 => 30000 tokens
    await EpochStorage.addTokensToEpochRange(shardId, 5, 15, 30000);

    // Pick a sub-range [7..10] and compare direct pool sums with getEpochRangePool
    let sumSubRange = 0;
    for (let e = 7; e <= 10; e++) {
      sumSubRange += Number(await EpochStorage.getEpochPool(shardId, e));
    }
    const subRangePool = Number(
      await EpochStorage.getEpochRangePool(shardId, 7, 10),
    );
    expect(subRangePool).to.be.closeTo(sumSubRange, 1);

    // Also check an epoch outside the range, expecting zero
    expect(await EpochStorage.getEpochPool(shardId, 20)).to.equal(0);
  });

  it('Verify getEpochPool remains correct after partial payouts', async () => {
    const shardId = 17;

    // Range: 2-4 => 6000 tokens total
    await EpochStorage.addTokensToEpochRange(shardId, 2, 4, 6000);

    // Pay out 100 tokens in epoch 3
    await EpochStorage.payOutEpochTokens(shardId, 3, 909, 100);
    const dist3 = await EpochStorage.getEpochDistributedPool(shardId, 3);
    expect(dist3).to.equal(100);

    const pool3 = await EpochStorage.getEpochPool(shardId, 3);
    // Pool 3 should still be >= distributed
    expect(pool3).to.be.gte(dist3);

    // Check that getEpochRangePool(2,4) is at least equal to sum of pay outs
    const rangePool = Number(
      await EpochStorage.getEpochRangePool(shardId, 2, 4),
    );
    expect(rangePool).to.be.gte(dist3);
  });

  it('Multiple non-overlapping ranges with partial remainders, ensuring getEpochPool and getEpochRangePool logic stays consistent', async () => {
    const shardId = 18;

    // Ranges: 5-6 => 1000, 7-8 => 2000, 9-10 => 3000
    await EpochStorage.addTokensToEpochRange(shardId, 5, 6, 1000);
    await EpochStorage.addTokensToEpochRange(shardId, 7, 8, 2000);
    await EpochStorage.addTokensToEpochRange(shardId, 9, 10, 3000);

    // Check each epoch's pool
    const p5 = await EpochStorage.getEpochPool(shardId, 5);
    const p6 = await EpochStorage.getEpochPool(shardId, 6);
    const p7 = await EpochStorage.getEpochPool(shardId, 7);
    const p8 = await EpochStorage.getEpochPool(shardId, 8);
    const p9 = await EpochStorage.getEpochPool(shardId, 9);
    const p10 = await EpochStorage.getEpochPool(shardId, 10);

    expect(p5).to.be.equal(500);
    expect(p6).to.be.equal(500);
    expect(p7).to.be.equal(1000);
    expect(p8).to.be.equal(1000);
    expect(p9).to.be.equal(1500);
    expect(p10).to.be.equal(1500);

    // Compare getEpochRangePool(5,10) with sum of individual getEpochPool(5..10)
    const totalInd =
      Number(p5) +
      Number(p6) +
      Number(p7) +
      Number(p8) +
      Number(p9) +
      Number(p10);
    const totalRange = Number(
      await EpochStorage.getEpochRangePool(shardId, 5, 10),
    );
    expect(totalRange).to.be.closeTo(totalInd, 1);
  });

  it('getCurrentEpochProducedKnowledgeValue, getPreviousEpochProducedKnowledgeValue', async () => {
    await EpochStorage.addEpochProducedKnowledgeValue(10, 1, 200);
    await time.increase(3600);
    await EpochStorage.addEpochProducedKnowledgeValue(20, 2, 300);
    expect(await EpochStorage.getCurrentEpochProducedKnowledgeValue()).to.equal(
      300,
    );
    expect(
      await EpochStorage.getPreviousEpochProducedKnowledgeValue(),
    ).to.equal(200);
  });

  it('getNodeCurrentEpochProducedKnowledgeValue, getNodePreviousEpochProducedKnowledgeValue', async () => {
    await EpochStorage.addEpochProducedKnowledgeValue(123, 1, 500);
    await time.increase(3600);
    await EpochStorage.addEpochProducedKnowledgeValue(123, 2, 700);
    expect(
      await EpochStorage.getNodeCurrentEpochProducedKnowledgeValue(123),
    ).to.equal(700);
    expect(
      await EpochStorage.getNodePreviousEpochProducedKnowledgeValue(123),
    ).to.equal(500);
  });

  it('getCurrentEpochNodeMaxProducedKnowledgeValue, getPreviousEpochNodeMaxProducedKnowledgeValue', async () => {
    await EpochStorage.addEpochProducedKnowledgeValue(1, 1, 1000);
    await EpochStorage.addEpochProducedKnowledgeValue(2, 1, 500);
    await time.increase(3600);
    await EpochStorage.addEpochProducedKnowledgeValue(1, 2, 300);
    await EpochStorage.addEpochProducedKnowledgeValue(2, 2, 800);
    expect(
      await EpochStorage.getCurrentEpochNodeMaxProducedKnowledgeValue(),
    ).to.equal(800);
    expect(
      await EpochStorage.getPreviousEpochNodeMaxProducedKnowledgeValue(),
    ).to.equal(1000);
  });

  it('getNodeCurrentEpochProducedKnowledgeValuePercentage, getNodePreviousEpochProducedKnowledgeValuePercentage', async () => {
    await EpochStorage.addEpochProducedKnowledgeValue(1111, 1, 500);
    await EpochStorage.addEpochProducedKnowledgeValue(2222, 1, 1500);
    await time.increase(3600);
    await EpochStorage.addEpochProducedKnowledgeValue(1111, 2, 1000);
    await EpochStorage.addEpochProducedKnowledgeValue(2222, 2, 2000);
    expect(
      await EpochStorage.getNodePreviousEpochProducedKnowledgeValuePercentage(
        1111,
      ),
    ).to.equal((500n * 1000000000000000000n) / 2000n);
    expect(
      await EpochStorage.getNodeCurrentEpochProducedKnowledgeValuePercentage(
        1111,
      ),
    ).to.equal((1000n * 1000000000000000000n) / 3000n);
  });
});
