import hre from 'hardhat';

import { Chronos, RandomSamplingStorage } from '../../typechain';
import { RandomSamplingLib } from '../../typechain/contracts/storage/RandomSamplingStorage';

// Helper function to create a mock challenge
export async function createMockChallenge(
  randomSamplingStorage: RandomSamplingStorage,
  chronos: Chronos,
): Promise<RandomSamplingLib.ChallengeStruct> {
  // Get all values as BigNumberish
  const activeBlockTx =
    await randomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
  await activeBlockTx.wait();

  const activeBlockStatus =
    await randomSamplingStorage.getActiveProofPeriodStatus();
  const activeBlock = activeBlockStatus.activeProofPeriodStartBlock;

  const currentEpochTx = await chronos.getCurrentEpoch();
  const currentEpoch = BigInt(currentEpochTx.toString());

  const proofingPeriodDurationTx =
    await randomSamplingStorage.getActiveProofingPeriodDurationInBlocks();
  const proofingPeriodDuration = BigInt(proofingPeriodDurationTx.toString());

  const challenge: RandomSamplingLib.ChallengeStruct = {
    knowledgeCollectionId: 1n,
    chunkId: 1n,
    epoch: currentEpoch,
    activeProofPeriodStartBlock: activeBlock,
    proofingPeriodDurationInBlocks: proofingPeriodDuration,
    solved: true,
  };

  return challenge;
}

async function mineBlocks(blocks: number): Promise<void> {
  for (let i = 0; i < blocks; i++) {
    await hre.network.provider.send('evm_mine');
  }
}

export async function mineProofPeriodBlocks(
  periodStartBlock: bigint,
  RandomSamplingStorage: RandomSamplingStorage,
): Promise<bigint> {
  const currentBlock = await hre.ethers.provider.getBlockNumber();
  const diff = currentBlock - Number(periodStartBlock);
  const proofingPeriodDuration =
    await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks();

  const blocksToMine = Number(proofingPeriodDuration) + 1 - diff;
  await mineBlocks(blocksToMine);

  return proofingPeriodDuration + 1n;
}
