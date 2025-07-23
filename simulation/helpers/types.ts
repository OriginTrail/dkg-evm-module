/**
 * Epoch metadata for reward distribution
 */
export type EpochMetadata = {
  epoch: number;
  startTs: number;
  endTs: number;
  rewardPool: string | bigint;
};
