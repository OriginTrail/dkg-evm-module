import hre from 'hardhat';

import {
  Chronos,
  RandomSamplingStorage,
  KnowledgeCollectionStorage,
} from '../../typechain';
import { RandomSamplingLib } from '../../typechain/contracts/storage/RandomSamplingStorage';

// Helper function to create a mock challenge
export async function createMockChallenge(
  randomSamplingStorage: RandomSamplingStorage,
  KnowledgeCollectionStorage: KnowledgeCollectionStorage,
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
    knowledgeCollectionStorageContract:
      await KnowledgeCollectionStorage.getAddress(),
    chunkId: 1n,
    epoch: currentEpoch,
    activeProofPeriodStartBlock: activeBlock,
    proofingPeriodDurationInBlocks: proofingPeriodDuration,
    solved: true,
  };

  return challenge;
}

// TODO: Move to common utils
export async function mineBlocks(blocks: number): Promise<void> {
  for (let i = 0; i < blocks; i++) {
    console.log('Mining block', i + 1);
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

  const blocksToMine = Number(proofingPeriodDuration) - diff;
  await mineBlocks(blocksToMine);

  return proofingPeriodDuration;
}
