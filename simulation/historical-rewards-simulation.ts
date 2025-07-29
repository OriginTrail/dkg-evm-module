import fs from 'fs';

import { expect } from 'chai';
import hre from 'hardhat';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import '@nomicfoundation/hardhat-ethers';

import {
  getDeployedContract,
  impersonateAccount,
  stopImpersonatingAccount,
  ensureSufficientGasFunds,
  getHubAddress,
} from './helpers/blockchain-helpers';
import {
  SimulationDatabase,
  TransactionData,
  BlockData,
} from './helpers/db-helpers';
import { MiningController } from './helpers/mining-controller';
import {
  PROOF_PERIOD_SECONDS,
  DEFAULT_BATCH_SIZE,
  DEFAULT_DB_PATHS,
  NETWORK_HUBS,
  HUB_OWNERS,
} from './helpers/simulation-constants';
import {
  calculateScoresForActiveNodes,
  initializeProofingTimestamp,
  getNodeEpochPublishingFactors,
  initializeContracts,
  getNetNodeRewards,
  getOperatorRewards,
  getDelegatorReward,
  initializeEpochMetadata,
  migrateV6Delegators,
  setupAllowances,
  calculateScoresForMigratedDelegators,
} from './helpers/simulation-helpers';
import {
  validateDelegatorsCount,
  validateStakingTransaction,
  validateStartTimeAndEpochLength,
  verifyMainnetStakingStorageState,
  initializeValidationVariables,
} from './helpers/validation';

/**
 * DKG V8.0 to V8.1 Historical Rewards Simulation
 *
 * This script replays historical transactions from V8.0 to V8.1
 * to calculate accurate delegator rewards and operator fees.
 */

/**
 * Main Simulation Class
 */
class HistoricalRewardsSimulation {
  private db: SimulationDatabase;
  private mining: MiningController;
  private hre: HardhatRuntimeEnvironment;
  private lastProofingTimestamp: number = 0;
  private contracts: { [key: string]: any } = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  private chain: string;
  private nodeEpochDelegatorRewards: {
    [key: number]: { [key: number]: { [key: string]: bigint } };
  } = {};
  private nodeDelegatorTotalRewards: { [key: number]: bigint } = {};
  private delegatorEpochRewards: {
    [key: string]: { [key: number]: bigint };
  } = {};
  private delegatorTotalRewards: { [key: string]: bigint } = {};
  private verifyMainnetState: boolean = false;
  private nodeEpochPublishingFactors: {
    [key: number]: { [key: number]: bigint };
  } = {};
  private nodeOperatorRewards: {
    [key: number]: { [key: number]: bigint };
  } = {};
  private operatorTotalRewards: { [key: number]: bigint } = {};
  private totalEpochNetNodeRewards: { [key: number]: bigint } = {};
  private totalEpochOperatorRewards: { [key: number]: bigint } = {};
  private epochMetadata: {
    epoch: number;
    startTs: number;
    endTs: number;
    rewardPool: string;
  }[] = [];

  constructor(hre: HardhatRuntimeEnvironment, dbPath: string) {
    this.hre = hre;
    this.db = new SimulationDatabase(dbPath);
    this.mining = new MiningController(hre);
    this.verifyMainnetState = true;
  }

  /**
   * Helper methods for auto-initializing nested reward objects
   */
  private setNodeEpochDelegatorReward(
    identityId: number,
    epoch: number,
    delegator: string,
    reward: bigint,
  ): void {
    if (!this.nodeEpochDelegatorRewards[identityId]) {
      this.nodeEpochDelegatorRewards[identityId] = {};
    }
    if (!this.nodeEpochDelegatorRewards[identityId][epoch]) {
      this.nodeEpochDelegatorRewards[identityId][epoch] = {};
    }
    this.nodeEpochDelegatorRewards[identityId][epoch][delegator] = reward;
  }

  private addNodeDelegatorTotalReward(
    identityId: number,
    reward: bigint,
  ): void {
    if (!this.nodeDelegatorTotalRewards[identityId]) {
      this.nodeDelegatorTotalRewards[identityId] = 0n;
    }
    this.nodeDelegatorTotalRewards[identityId] += reward;
  }

  private setDelegatorEpochReward(
    delegator: string,
    epoch: number,
    reward: bigint,
  ): void {
    if (!this.delegatorEpochRewards[delegator]) {
      this.delegatorEpochRewards[delegator] = {};
    }
    this.delegatorEpochRewards[delegator][epoch] = reward;
  }

  private addDelegatorTotalReward(delegator: string, reward: bigint): void {
    if (!this.delegatorTotalRewards[delegator]) {
      this.delegatorTotalRewards[delegator] = 0n;
    }
    this.delegatorTotalRewards[delegator] += reward;
  }

  private setNodeOperatorReward(
    identityId: number,
    epoch: number,
    reward: bigint,
  ): void {
    if (!this.nodeOperatorRewards[identityId]) {
      this.nodeOperatorRewards[identityId] = {};
    }
    if (!this.nodeOperatorRewards[identityId][epoch]) {
      this.nodeOperatorRewards[identityId][epoch] = 0n;
    }
    this.nodeOperatorRewards[identityId][epoch] += reward;
  }

  private addNodeOperatorTotalReward(identityId: number, reward: bigint): void {
    if (!this.operatorTotalRewards[identityId]) {
      this.operatorTotalRewards[identityId] = 0n;
    }
    this.operatorTotalRewards[identityId] += reward;
  }

  private addTotalEpochNetNodeReward(epoch: number, reward: bigint): void {
    if (!this.totalEpochNetNodeRewards[epoch]) {
      this.totalEpochNetNodeRewards[epoch] = 0n;
    }
    this.totalEpochNetNodeRewards[epoch] += reward;
  }

  private addTotalEpochOperatorReward(epoch: number, reward: bigint): void {
    if (!this.totalEpochOperatorRewards[epoch]) {
      this.totalEpochOperatorRewards[epoch] = 0n;
    }
    this.totalEpochOperatorRewards[epoch] += reward;
  }

  /**
   * Initialize the simulation
   */
  async initialize(): Promise<void> {
    console.log(
      'Initializing DKG V8.0 to V8.1 Historical Rewards Simulation\n',
    );

    const hubAddress = await getHubAddress(this.hre);
    this.chain = NETWORK_HUBS[hubAddress];

    this.lastProofingTimestamp = await initializeProofingTimestamp(this.chain);

    const currentTimestamp = await this.mining.getCurrentTimestamp();
    expect(this.lastProofingTimestamp).to.be.lessThanOrEqual(
      currentTimestamp,
      `[INIT] ❌ Start block timestamp ${this.lastProofingTimestamp} is greater than current timestamp ${currentTimestamp}`,
    );

    // Get current fork status
    console.log(`\n[INIT] Fork Status:`);
    console.log(`[INIT] Current block: ${await this.mining.getCurrentBlock()}`);
    console.log(
      `[INIT] Current timestamp: ${currentTimestamp} (${new Date(currentTimestamp * 1000).toISOString()})`,
    );
    console.log(
      `[INIT] Last proofing timestamp: ${this.lastProofingTimestamp} (${new Date(this.lastProofingTimestamp * 1000).toISOString()})`,
    );

    // Load contracts
    this.contracts = await initializeContracts(this.hre);

    this.epochMetadata = await initializeEpochMetadata(
      this.contracts,
      this.chain,
    );

    await migrateV6Delegators(this.contracts, this.chain);

    this.nodeEpochPublishingFactors = await getNodeEpochPublishingFactors(
      this.contracts,
      this.chain,
    );

    await validateStartTimeAndEpochLength(this.contracts, 1736812800, 2592000);

    // Disable auto-mining
    // console.log('[INIT] Disabling auto-mining...');
    // await this.mining.disableAutoMining();

    // Get simulation status
    const unprocessedCount = this.db.getUnprocessedCount();
    const blockRange = this.db.getUnprocessedBlockRange();

    console.log(`[INIT] Simulation Status:`);
    console.log(`[INIT] Unprocessed transactions: ${unprocessedCount}`);
    console.log(
      `[INIT] Block range: ${blockRange.minBlock} - ${blockRange.maxBlock}`,
    );

    const hubOwner =
      HUB_OWNERS[
        (await this.contracts.hub.getAddress()) as keyof typeof HUB_OWNERS
      ];
    await impersonateAccount(this.hre, hubOwner);
    const hubOwnerSigner = await this.hre.ethers.getSigner(hubOwner);
    await this.contracts.migratorM1V8
      .connect(hubOwnerSigner)
      .initiateDelegatorsMigration();
    await stopImpersonatingAccount(this.hre, hubOwner);

    console.log(`\n[INIT] Simulation initialized successfully!`);
  }

  /**
   * Main simulation entry point
   * Replays historical transactions and calculates rewards
   */
  async runSimulation(): Promise<void> {
    console.log('\n[RUN SIMULATION] Starting Historical Transaction Replay...');

    try {
      let processedBlocks = 0;
      let totalTransactions = 0;

      // Main replay loop - process blocks in batches
      // eslint-disable-next-line no-constant-condition
      while (true) {
        // Get next batch of blocks with transactions
        const blockBatch =
          this.db.getOrderedTxsByBlockBatch(DEFAULT_BATCH_SIZE);

        if (blockBatch.length === 0) {
          console.log('\n[SIMULATION END] No more blocks to process');
          break;
        }

        console.log(
          `\n[RUN SIMULATION] Processing batch: ${blockBatch.length} blocks`,
        );

        // Process each block in the batch
        for (const block of blockBatch) {
          await this.processBlock(block);
          processedBlocks++;
          totalTransactions += block.txs.length;
        }

        // Progress update
        console.log(
          `\n[RUN SIMULATION] Progress: ${processedBlocks} blocks, ${totalTransactions} transactions processed`,
        );
      }

      // Final wrap-up
      await this.wrapUpSimulation();

      console.log(
        '\n[SIMULATION END] Historical replay completed successfully!',
      );
      console.log(
        `[SIMULATION END] Total blocks processed: ${processedBlocks}`,
      );
      console.log(
        `[SIMULATION END] Total transactions processed: ${totalTransactions}`,
      );
    } catch (error) {
      console.error('[RUN SIMULATION] Simulation failed:', error);
      throw error;
    }
  }

  /**
   * Process a single block's transactions
   */
  async processBlock(block: BlockData): Promise<void> {
    console.log(
      `[PROCESS BLOCK] Processing block ${block.blockNumber} (${new Date(block.timestamp * 1000).toISOString()}) with ${block.txs.length} transactions`,
    );

    try {
      // 1. Catch up on missing 30-min proof periods
      await this.catchUpProofPeriods(block.timestamp);

      // 2. Check for epoch transitions and distribute rewards
      await this.handleEpochTransitions(block.timestamp);

      // 3. Warp VM clock to this block's timestamp
      // Skip setting time if processing MigratorM1V8 transactions, those blocks are too close to each other which breaks the simulation - proof periods will be calculated correctly in the end
      if (block.txs.some((tx) => tx.contract === 'MigratorM1V8')) {
        console.log(
          `[PROCESS BLOCK] Skipping time advancement for block ${block.blockNumber} because it contains MigratorM1V8 transactions`,
        );
      } else {
        await this.mining.setTime(block.timestamp);
        console.log(
          `[PROCESS BLOCK] Advanced time to ${new Date(block.timestamp * 1000).toISOString()}`,
        );
      }

      // 4. Process all transactions in the block
      let successfulTxs = 0;
      let failedTxs = 0;

      for (const tx of block.txs) {
        try {
          await this.processTransaction(tx);
          successfulTxs++;
        } catch (error) {
          console.error(
            `[PROCESS BLOCK] ❌ Failed to process tx ${tx.hash}: ${error}`,
          );
          this.db.recordTxError(tx.hash, String(error));
          failedTxs++;
        }
      }

      // 5. Mine the block
      await this.mining.mineBlock();

      console.log(
        `[PROCESS BLOCK] Block processed: ${successfulTxs} successful, ${failedTxs} failed transactions`,
      );
    } catch (error) {
      console.error(
        `[PROCESS BLOCK] ❌ Failed to process block ${block.blockNumber}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Catch up on missing 30-minute proof periods
   */
  private async catchUpProofPeriods(blockTimestamp: number): Promise<void> {
    const epochAtTimestamp =
      await this.contracts.chronos.epochAtTimestamp(blockTimestamp);
    // TODO: Change for V6 simulation
    if (epochAtTimestamp > 5) {
      console.log(
        `[CATCH UP PROOF PERIODS] Skipping proof period calculation for epoch ${epochAtTimestamp}`,
      );
      return;
    }

    while (
      blockTimestamp >=
      this.lastProofingTimestamp + PROOF_PERIOD_SECONDS
    ) {
      const proofingTime = this.lastProofingTimestamp + PROOF_PERIOD_SECONDS;

      // If proofing time is in a new epoch, handle epoch transitions
      await this.handleEpochTransitions(proofingTime);

      console.log(
        `[CATCH UP PROOF PERIODS] Calculating scores for proof period ending at ${new Date(proofingTime * 1000).toISOString()}`,
      );

      try {
        await calculateScoresForActiveNodes(
          this.hre,
          this.contracts,
          proofingTime,
          this.nodeEpochPublishingFactors,
        );

        this.lastProofingTimestamp = proofingTime;
      } catch (error) {
        console.error(
          `[CATCH UP PROOF PERIODS] ❌ Failed to calculate scores for timestamp ${proofingTime}:`,
          error,
        );
        // Continue with next proof period rather than stopping simulation
        this.lastProofingTimestamp = proofingTime;
      }
    }
  }

  /**
   * Handle epoch transitions and distribute rewards
   */
  private async handleEpochTransitions(timestamp: number): Promise<void> {
    try {
      const chronos = this.contracts.chronos;

      // If the timestamp is in a new epoch, move to the start of the new epoch and mine a block to make the timestamp effective
      let currentEpoch = await chronos.getCurrentEpoch();
      const epochAtTimestamp = await chronos.epochAtTimestamp(timestamp);
      if (epochAtTimestamp > currentEpoch) {
        console.log(
          `[EPOCH TRANSITION] Epoch transition from ${currentEpoch} to ${epochAtTimestamp}`,
        );
        await this.mining.setTime(
          Number(await chronos.timestampForEpoch(epochAtTimestamp)),
        );
        await this.mining.mineBlock();
        currentEpoch = epochAtTimestamp;
        expect(currentEpoch).to.equal(await chronos.getCurrentEpoch());

        console.log(
          `[EPOCH TRANSITION] Calling _prepareForStakeChange for all nodes and their delegators for currentEpoch - 1`,
        );
        const maxIdentityId = Number(
          await this.contracts.identityStorage.lastIdentityId(),
        );

        for (let identityId = 1; identityId <= maxIdentityId; identityId++) {
          const delegators =
            await this.contracts.delegatorsInfo.getDelegators(identityId);

          const nodeScorePerStake36 =
            await this.contracts.randomSamplingStorage.getNodeEpochScorePerStake(
              Number(currentEpoch) - 1,
              identityId,
            );

          const nodeScore18 =
            await this.contracts.randomSamplingStorage.getNodeEpochScore(
              Number(currentEpoch) - 1,
              identityId,
            );

          const nodeStake =
            await this.contracts.stakingStorage.getNodeStake(identityId);

          let totalDelegatorScore18 = 0n;
          let totalDelegatorStake = 0n;

          for (const delegator of delegators) {
            const delegatorKey = this.hre.ethers.keccak256(
              this.hre.ethers.solidityPacked(['address'], [delegator]),
            );
            await this.contracts.staking._prepareForStakeChange(
              Number(currentEpoch) - 1,
              identityId,
              delegatorKey,
            );
            const delegatorLastSettledNodeEpochScorePerStake36 =
              await this.contracts.randomSamplingStorage.getDelegatorLastSettledNodeEpochScorePerStake(
                Number(currentEpoch) - 1,
                identityId,
                delegatorKey,
              );
            const diff36 =
              BigInt(nodeScorePerStake36) -
              BigInt(delegatorLastSettledNodeEpochScorePerStake36); // scaled 1e36
            console.log(
              `[EPOCH TRANSITION] identityId: ${identityId}, epoch: ${currentEpoch - 1n} --> nodeScorePerStake36: ${nodeScorePerStake36}, delegatorLastSettledNodeEpochScorePerStake36: ${delegatorLastSettledNodeEpochScorePerStake36}`,
            );
            if (diff36 > 0n) {
              console.log(
                `[EPOCH TRANSITION] ⚠️ identityId: ${identityId}, epoch: ${currentEpoch - 1n} --> nodeScorePerStake36: ${nodeScorePerStake36}, delegatorLastSettledNodeEpochScorePerStake36: ${delegatorLastSettledNodeEpochScorePerStake36}, diff36: ${diff36} for address ${delegator}. The diff should be 0.`,
              );
            }
            const delegatorScore18 =
              await this.contracts.randomSamplingStorage.getEpochNodeDelegatorScore(
                Number(currentEpoch) - 1,
                identityId,
                delegatorKey,
              );
            totalDelegatorScore18 += BigInt(delegatorScore18);

            const delegatorStake =
              await this.contracts.stakingStorage.getDelegatorStakeBase(
                identityId,
                delegatorKey,
              );
            totalDelegatorStake += BigInt(delegatorStake);

            console.log(
              `[EPOCH TRANSITION] Delegator score: ${delegatorScore18} for address ${delegator} in epoch ${currentEpoch - 1n} for identity ${identityId}`,
            );
          }
          console.log(
            `[EPOCH TRANSITION] Node score: ${nodeScore18}, total delegator scores: ${totalDelegatorScore18}, difference: ${BigInt(nodeScore18) - totalDelegatorScore18}. It should not be negative.`,
          );
          console.log(
            `[EPOCH TRANSITION] Node stake: ${nodeStake}, total delegator stake: ${totalDelegatorStake}, difference: ${BigInt(nodeStake) - totalDelegatorStake}. It should not be negative.`,
          );
        }
        console.log(
          `[EPOCH TRANSITION] _prepareForStakeChange for all nodes and their delegators for currentEpoch - 1 completed`,
        );
      }
    } catch (error) {
      console.error(
        `[EPOCH TRANSITION] ❌ Failed to handle epoch transitions:`,
        error,
      );
      process.exit(1);
    }
  }

  /**
   * Process a single transaction
   */
  async processTransaction(tx: TransactionData): Promise<void> {
    // Check if already processed
    if (this.db.isProcessedTx(tx.hash)) {
      return;
    }

    const sender =
      tx.contract === 'MigratorM1V8'
        ? HUB_OWNERS[
            (await this.contracts.hub.getAddress()) as keyof typeof HUB_OWNERS
          ]
        : tx.from;

    console.log(
      `[PROCESS TRANSACTION] msg.sender: ${sender} is calling ${tx.contract}.${tx.functionName}(${tx.functionInputs
        .map((input) => JSON.stringify(input))
        .join(', ')}) - tx: ${tx.hash}`,
    );

    try {
      // Get the contract instance
      const contract = await getDeployedContract(this.hre, tx.contract);

      if (!contract) {
        throw new Error(
          `[PROCESS TRANSACTION] Contract ${tx.contract} not found`,
        );
      }

      // Validation variables
      const {
        nodeStake,
        isNodeDelegator,
        toNodeStake,
        delegatorsCount,
        requestWithdrawalAmount,
      } = await initializeValidationVariables(this.hre, this.contracts, tx);

      // Impersonate the original transaction sender or hub owner, depending on access control
      await impersonateAccount(this.hre, sender);

      // Ensure sufficient funds for this specific transaction
      await ensureSufficientGasFunds(this.hre, sender);

      // Special handling for transactions that need token allowances
      await setupAllowances(this.hre, this.contracts, tx);

      // Get the signer for the transaction sender
      const signer = await this.hre.ethers.getSigner(sender);
      const contractWithSigner = contract.connect(signer);

      // Execute the transaction with original arguments
      try {
        const txResponse = await contractWithSigner[tx.functionName](
          ...tx.functionInputs,
        );

        await txResponse.wait();

        await validateStakingTransaction(
          this.contracts,
          tx,
          toNodeStake,
          nodeStake,
          requestWithdrawalAmount,
        );

        await validateDelegatorsCount(
          this.hre,
          this.contracts,
          tx,
          isNodeDelegator,
          delegatorsCount,
        );

        await calculateScoresForMigratedDelegators(this.contracts, tx);

        // Verify on-chain state after stake-changing transactions
        if (this.verifyMainnetState) {
          await verifyMainnetStakingStorageState(
            this.contracts,
            this.chain,
            tx,
            tx.functionInputs[0],
            tx.from,
            this.db.getTxBlockNumber(tx.hash) as number,
          );
        }

        console.log(
          `[PROCESS TRANSACTION] Transaction confirmed: ${txResponse.hash}`,
        );

        // Mark as successfully processed
        this.db.markTxAsProcessed(tx.hash, true);

        // Stop impersonating
        await stopImpersonatingAccount(this.hre, sender);
      } catch (error) {
        // Mark as failed and record error
        this.db.markTxAsProcessed(tx.hash, false);
        throw error;
      }
    } catch (error) {
      console.error(
        `[PROCESS TRANSACTION] ❌ Failed to process transaction ${tx.hash}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Distribute rewards for all epochs at the end of the simulation
   */
  private async distributeRewards(): Promise<void> {
    try {
      const epochs = this.epochMetadata.map((e) => e.epoch);
      for (const epoch of epochs) {
        const epochMeta = this.epochMetadata.find((e) => e.epoch === epoch);
        if (!epochMeta) {
          throw new Error(
            `[DISTRIBUTE REWARDS] ❌ Epoch metadata not found for epoch ${epoch}`,
          );
        }
        const rewardPool = BigInt(epochMeta.rewardPool);
        console.log(
          `[DISTRIBUTE REWARDS] Epoch ${epoch} rewards: ${this.hre.ethers.formatEther(rewardPool)} TRAC`,
        );

        const maxIdentityId = Number(
          await this.contracts.identityStorage.lastIdentityId(),
        );

        for (let identityId = 1; identityId <= maxIdentityId; identityId++) {
          const netNodeRewards = await getNetNodeRewards(
            this.contracts,
            identityId,
            epoch,
            rewardPool,
          );

          this.addTotalEpochNetNodeReward(epoch, netNodeRewards);

          const operatorRewards = await getOperatorRewards(
            this.contracts,
            identityId,
            epoch,
            rewardPool,
          );

          this.addTotalEpochOperatorReward(epoch, operatorRewards);
          this.setNodeOperatorReward(identityId, epoch, operatorRewards);
          this.addNodeOperatorTotalReward(identityId, operatorRewards);

          const delegators =
            await this.contracts.delegatorsInfo.getDelegators(identityId);

          console.log(
            `[DISTRIBUTE REWARDS] Processing ${delegators.length} delegators for identity ${identityId} and epoch ${epoch}`,
          );

          let epochNodeDelegatorTotalRewards = 0n;
          let totalDelegatorScores = 0n;
          const nodeScore18 =
            await this.contracts.randomSamplingStorage.getNodeEpochScore(
              epoch,
              identityId,
            );

          const nodeScorePerStake36 =
            await this.contracts.randomSamplingStorage.getNodeEpochScorePerStake(
              epoch,
              identityId,
            );

          for (const delegator of delegators) {
            const reward = await getDelegatorReward(
              this.contracts,
              identityId,
              epoch,
              delegator,
              rewardPool,
            );

            if (reward > 0n) {
              epochNodeDelegatorTotalRewards += reward;
              // Track delegator score for validation
              const delegatorKey = this.hre.ethers.keccak256(
                this.hre.ethers.solidityPacked(['address'], [delegator]),
              );
              const delegatorLastSettledNodeEpochScorePerStake36 =
                await this.contracts.randomSamplingStorage.getDelegatorLastSettledNodeEpochScorePerStake(
                  epoch,
                  identityId,
                  delegatorKey,
                );
              const diff36 =
                BigInt(nodeScorePerStake36) -
                BigInt(delegatorLastSettledNodeEpochScorePerStake36); // scaled 1e36
              console.log(
                `[DISTRIBUTE REWARDS] identityId: ${identityId}, epoch: ${epoch} --> nodeScorePerStake36: ${nodeScorePerStake36}, delegatorLastSettledNodeEpochScorePerStake36: ${delegatorLastSettledNodeEpochScorePerStake36}`,
              );
              if (diff36 > 0n) {
                console.log(
                  `[DISTRIBUTE REWARDS] ⚠️ identityId: ${identityId}, epoch: ${epoch} --> nodeScorePerStake36: ${nodeScorePerStake36}, delegatorLastSettledNodeEpochScorePerStake36: ${delegatorLastSettledNodeEpochScorePerStake36}, diff36: ${diff36} for address ${delegator}. The diff should be 0.`,
                );
              }
              const delegatorScore18 =
                await this.contracts.randomSamplingStorage.getEpochNodeDelegatorScore(
                  epoch,
                  identityId,
                  delegatorKey,
                );
              console.log(
                `[DISTRIBUTE REWARDS] Delegator score: ${delegatorScore18} for address ${delegator} in epoch ${epoch} for identity ${identityId}`,
              );
              totalDelegatorScores += BigInt(delegatorScore18);

              this.setNodeEpochDelegatorReward(
                identityId,
                epoch,
                delegator,
                reward,
              );
              this.addNodeDelegatorTotalReward(identityId, reward);
              this.setDelegatorEpochReward(delegator, epoch, reward);
              this.addDelegatorTotalReward(delegator, reward);
            }
          }

          // Validate total delegator scores don't exceed node score
          if (nodeScore18 > 0n) {
            console.log(
              `[DISTRIBUTE REWARDS] Node score: ${nodeScore18}, total delegator scores: ${totalDelegatorScores}, difference: ${BigInt(nodeScore18) - totalDelegatorScores}. It should not be negative.`,
            );
            // expect(totalDelegatorScores <= BigInt(nodeScore18)).to.be.true(
            //   `Total delegator scores (${totalDelegatorScores}) exceed node score (${nodeScore18}) for identity ${identityId} in epoch ${epoch}`,
            // );
          }
          // const tolerance = 1000; // 1000 wei tolerance for rounding differences
          const difference =
            BigInt(netNodeRewards) - epochNodeDelegatorTotalRewards;
          console.log(
            `[DISTRIBUTE REWARDS] ⚠️ Difference between net node rewards and delegator rewards for identity ${identityId}: ${difference} wei, ${this.hre.ethers.formatEther(difference)} TRAC`,
          );

          // // Validate that delegator rewards never exceed net node rewards
          // expect(Number(difference)).to.be.greaterThanOrEqual(
          //   0,
          //   `Delegator rewards exceed net node rewards for identity ${identityId}. This should never happen. Negative difference: ${difference} wei`,
          // );

          // expect(Number(difference)).to.be.lessThanOrEqual(
          //   tolerance,
          //   `Total delegator rewards for identity ${identityId} do not match the node rewards within tolerance. Difference: ${difference} wei`,
          // );
        }
        const totalNodeRewards =
          (this.totalEpochNetNodeRewards[epoch] || 0n) +
          (this.totalEpochOperatorRewards[epoch] || 0n);
        // const tolerance = 1000; // 1000 wei tolerance for rounding differences
        const difference = BigInt(rewardPool) - (totalNodeRewards || 0n);
        console.log(
          `[DISTRIBUTE REWARDS] ⚠️ Difference between reward pool and total node rewards: ${difference} wei, ${this.hre.ethers.formatEther(difference)} TRAC`,
        );
        // expect(Number(difference)).to.be.lessThanOrEqual(
        //   tolerance,
        //   `Total node rewards for epoch ${epoch} do not match the reward pool within tolerance. Difference: ${difference} wei`,
        // );
      }
    } catch (error) {
      console.error(
        `[DISTRIBUTE REWARDS] ❌ Failed to distribute rewards:`,
        error,
      );
    }
  }

  /**
   * Wrap up the simulation with final calculations
   */
  private async wrapUpSimulation(): Promise<void> {
    console.log('\n[SIMULATION END] Wrapping up simulation...');

    try {
      // Final proof period calculations
      const currentTime = await this.mining.getCurrentTimestamp();
      await this.catchUpProofPeriods(currentTime);

      // Final epoch reward distribution
      await this.handleEpochTransitions(currentTime);

      await this.distributeRewards();

      // TODO: Export csv for KPIs
      console.log('[SIMULATION END] Exporting results');
      await this.exportResults();

      console.log('[SIMULATION END] Simulation wrap-up completed');
    } catch (error) {
      console.error('[SIMULATION END] ❌ Failed to wrap up simulation:', error);
      throw error;
    }
  }

  async exportResults(): Promise<void> {
    console.log('[SIMULATION END] Exporting results...');

    try {
      const results = {
        nodeEpochDelegatorRewards: this.nodeEpochDelegatorRewards,
        nodeDelegatorTotalRewards: this.nodeDelegatorTotalRewards,
        delegatorEpochRewards: this.delegatorEpochRewards,
        delegatorTotalRewards: this.delegatorTotalRewards,
        nodeEpochPublishingFactors: this.nodeEpochPublishingFactors,
        nodeOperatorRewards: this.nodeOperatorRewards,
        operatorTotalRewards: this.operatorTotalRewards,
        totalEpochNetNodeRewards: this.totalEpochNetNodeRewards,
        totalEpochOperatorRewards: this.totalEpochOperatorRewards,
      };

      // Custom replacer function to handle BigInt serialization
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bigIntReplacer = (key: string, value: any) => {
        if (typeof value === 'bigint') {
          return value.toString();
        }
        return value;
      };

      const outputPath = 'v8-results.json';
      fs.writeFileSync(outputPath, JSON.stringify(results, bigIntReplacer, 4));

      console.log(
        `[SIMULATION END] ✅ Results exported successfully to ${outputPath}`,
      );

      // Log some statistics about the exported data
      const totalDelegators = Object.keys(this.delegatorTotalRewards).length;
      const totalNodes = Object.keys(this.nodeDelegatorTotalRewards).length;
      const totalEpochs = Object.keys(this.totalEpochNetNodeRewards).length;

      console.log(`[SIMULATION END] 📊 Export summary:`);
      console.log(`[SIMULATION END]    - Total delegators: ${totalDelegators}`);
      console.log(`[SIMULATION END]    - Total nodes: ${totalNodes}`);
      console.log(`[SIMULATION END]    - Total epochs: ${totalEpochs}`);
    } catch (error) {
      console.error('[SIMULATION END] ❌ Failed to export results:', error);
      throw error;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    console.log('\n[CLEANUP] Cleaning up...');
    this.db.close();
    console.log('[CLEANUP] Database connection closed');
  }
}

/**
 * Main function to run the simulation
 */
async function main() {
  // Record start time
  const startTime = Date.now();
  console.log(
    `[MAIN] Starting simulation at ${new Date(startTime).toISOString()}`,
  );

  const chain = NETWORK_HUBS[await getHubAddress(hre)];
  const dbPath = DEFAULT_DB_PATHS[chain];
  const simulation = new HistoricalRewardsSimulation(hre, dbPath);

  try {
    // Initialize and run simulation
    await simulation.initialize();
    await simulation.runSimulation();

    console.log('\n[MAIN] ✅ Simulation completed successfully!');
  } catch (error) {
    console.error('[MAIN] ❌ Simulation failed:', error);
    // Record end time
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    console.log(
      `[MAIN] Simulation completed in ${duration / 3600} hours at ${new Date(endTime).toISOString()}`,
    );
    await simulation.exportResults();
    process.exit(1);
  } finally {
    await simulation.cleanup();
  }

  // Record end time
  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;
  console.log(
    `[MAIN] Simulation completed in ${duration / 3600} hours at ${new Date(endTime).toISOString()}`,
  );
}

// Export for use in other scripts
export { HistoricalRewardsSimulation };

// Run the simulation
main().catch((error) => {
  console.error('[MAIN] Fatal error:', error);
  // Record end time
  const endTime = Date.now();
  console.log(`[MAIN] Simulation ended at ${new Date(endTime).toISOString()}`);
  process.exit(1);
});
