import hre from 'hardhat';

/**
 * Mines a specified number of blocks
 * @param blocks Number of blocks to mine
 */
export async function mineBlocks(blocks: number) {
  for (let i = 0; i < blocks; i++) {
    await hre.network.provider.send("evm_mine");
  }
}

/**
 * Mines blocks until a specific block number is reached
 * @param targetBlockNumber Target block number to mine to
 */
export async function mineToBlock(targetBlockNumber: number) {
  const currentBlock = await hre.ethers.provider.getBlockNumber();
  if (currentBlock >= targetBlockNumber) {
    return;
  }
  await mineBlocks(targetBlockNumber - currentBlock);
}

/**
 * Mines blocks for a proof period
 * @param startBlock Starting block number
 * @param randomSamplingStorage RandomSamplingStorage contract instance
 * @returns The number of blocks mined
 */
export async function mineProofPeriodBlocks(
  startBlock: bigint,
  randomSamplingStorage: any
): Promise<bigint> {
  const proofingPeriodDuration = await randomSamplingStorage.getActiveProofingPeriodDurationInBlocks();
  await mineBlocks(Number(proofingPeriodDuration));
  return BigInt(proofingPeriodDuration);
} 