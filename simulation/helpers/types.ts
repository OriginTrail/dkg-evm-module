/**
 * Epoch metadata for reward distribution
 */
export type EpochMetadata = {
  id: number;
  startTs: number;
  endTs: number;
  rewardPool: bigint;
};
