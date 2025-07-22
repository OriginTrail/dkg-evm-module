import hre from 'hardhat';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import {
  getDeployedContract,
  impersonateAccount,
  stopImpersonatingAccount,
  ensureSufficientGasFunds,
  getHubContract,
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
} from './helpers/simulation-constants';
import {
  calculateScoresForActiveNodes,
  setupStakingAllowances,
  setupMigratorAllowances,
  loadEpochMetadata,
} from './helpers/simulation-helpers';
import { EpochMetadata } from './helpers/types';

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
  private lastClaimedEpoch: number = 0;
  private epochMetadata: EpochMetadata[] = [];
  private contracts: { [key: string]: any } = {}; // eslint-disable-line @typescript-eslint/no-explicit-any

  constructor(hre: HardhatRuntimeEnvironment, dbPath: string) {
    this.hre = hre;
    this.db = new SimulationDatabase(dbPath);
    this.mining = new MiningController(hre);
  }

  /**
   * Initialize the simulation
   */
  async initialize(): Promise<void> {
    console.log(
      '🚀 Initializing DKG V8.0 to V8.1 Historical Rewards Simulation\n',
    );

    // Load contracts
    this.contracts = {
      staking: await getDeployedContract(this.hre, 'Staking'),
      stakingStorage: await getDeployedContract(this.hre, 'StakingStorage'),
      token: await getDeployedContract(this.hre, 'Token'),
      migrator: await getDeployedContract(this.hre, 'Migrator'),
      delegatorsInfo: await getDeployedContract(this.hre, 'DelegatorsInfo'),
      hub: await getHubContract(this.hre),
      chronos: await getDeployedContract(this.hre, 'Chronos'),
      identityStorage: await getDeployedContract(this.hre, 'IdentityStorage'),
      profileStorage: await getDeployedContract(this.hre, 'ProfileStorage'),
      shardingTableStorage: await getDeployedContract(
        this.hre,
        'ShardingTableStorage',
      ),
      randomSampling: await getDeployedContract(this.hre, 'RandomSampling'),
      randomSamplingStorage: await getDeployedContract(
        this.hre,
        'RandomSamplingStorage',
      ),
    };

    // Step 1: Disable auto-mining
    // console.log('[INIT] Disabling auto-mining...');
    // await this.mining.disableAutoMining();

    // Step 2: Get simulation status
    const unprocessedCount = this.db.getUnprocessedCount();
    const blockRange = this.db.getUnprocessedBlockRange();

    console.log(`[INIT] Simulation Status:`);
    console.log(`[INIT] Unprocessed transactions: ${unprocessedCount}`);
    console.log(
      `[INIT] Block range: ${blockRange.minBlock} - ${blockRange.maxBlock}`,
    );

    // Step 3: Get current fork status
    const currentBlock = await this.mining.getCurrentBlock();
    const currentTimestamp = await this.mining.getCurrentTimestamp();

    console.log(`\n[INIT] Fork Status:`);
    console.log(`[INIT] Current block: ${currentBlock}`);
    console.log(
      `[INIT] Current timestamp: ${currentTimestamp} (${new Date(currentTimestamp * 1000).toISOString()})`,
    );

    // Step 5: Load epoch metadata
    console.log('\n[INIT] Loading epoch metadata...');
    this.epochMetadata = await loadEpochMetadata(this.hre, this.contracts);

    // Step 6: Initialize proofing timestamp
    // TODO: Make sure this has the timestamp of the first block in the simulation - not today's timestamp
    this.lastProofingTimestamp = currentTimestamp;

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
      await this.mining.setTime(block.timestamp);
      console.log(
        `[PROCESS BLOCK] Advanced time to ${new Date(block.timestamp * 1000).toISOString()}`,
      );

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
        );
        this.lastProofingTimestamp = proofingTime;
        // TODO: Evaluate this
        await this.mining.mineBlock();
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
        await this.mining.setTime(
          await chronos.timestampForEpoch(epochAtTimestamp),
        );
        await this.mining.mineBlock();
        currentEpoch = epochAtTimestamp;
      }

      while (this.lastClaimedEpoch + 1 < currentEpoch) {
        const epochToDistribute = this.lastClaimedEpoch + 1;
        console.log(
          `[EPOCH TRANSITION] Distributing rewards for epoch ${epochToDistribute}`,
        );

        await this.distributeRewards(epochToDistribute);
        this.lastClaimedEpoch = epochToDistribute;
      }
    } catch (error) {
      console.error(
        `[EPOCH TRANSITION] ❌ Failed to handle epoch transitions:`,
        error,
      );
      // Continue simulation even if epoch handling fails
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

    console.log(
      `[PROCESS TRANSACTION] ${tx.contract}.${tx.functionName}(${tx.functionInputs
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

      // Impersonate the original transaction sender FIRST
      await impersonateAccount(this.hre, tx.from);

      // Estimate gas cost and ensure sufficient funds for this specific transaction
      await ensureSufficientGasFunds(this.hre, tx.from);

      // Special handling for transactions that need token allowances
      // (Must be done AFTER impersonation and gas funding)
      if (
        tx.contract === 'Migrator' &&
        tx.functionName === 'migrateDelegatorData'
      ) {
        await setupMigratorAllowances(
          this.hre,
          this.contracts,
          tx.from,
          tx.functionInputs[0],
        );
      } else if (tx.contract === 'Staking' && tx.functionName === 'stake') {
        await setupStakingAllowances(
          this.hre,
          this.contracts,
          tx.from,
          tx.functionInputs[1],
        ); // Amount is second parameter
      }

      // Get the signer for the transaction sender
      const signer = await this.hre.ethers.getSigner(tx.from);
      const contractWithSigner = contract.connect(signer);

      // Execute the transaction with original arguments
      try {
        const txResponse = await contractWithSigner[tx.functionName](
          ...tx.functionInputs,
        );

        // Mine a block to confirm the transaction since auto-mining is disabled
        // await this.mining.mineBlock();

        await txResponse.wait();

        if (
          tx.contract === 'Migrator' &&
          tx.functionName === 'migrateDelegatorData'
        ) {
          // Add the new address to the DelegatorsInfo contract
          const identityId = tx.functionInputs[0];
          const hub = await getHubContract(this.hre);
          const hubOwner = await hub.owner();
          await impersonateAccount(this.hre, hubOwner);
          const signer = await this.hre.ethers.getSigner(hubOwner);
          const delegatorsInfoWithSigner =
            this.contracts.delegatorsInfo.connect(signer);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (delegatorsInfoWithSigner as any).addDelegator(
            identityId,
            tx.from,
          );
          await stopImpersonatingAccount(this.hre, hubOwner);
        }

        console.log(
          `[PROCESS TRANSACTION] ✅ Transaction confirmed: ${txResponse.hash}`,
        );

        // Mark as successfully processed
        this.db.markTxAsProcessed(tx.hash, true);

        // Stop impersonating
        await stopImpersonatingAccount(this.hre, tx.from);
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
   * Distribute rewards for a completed epoch
   */
  private async distributeRewards(epochId: number): Promise<void> {
    try {
      // For MVP, just log the reward distribution
      // TODO: Implement actual reward distribution logic
      const epochMeta = this.epochMetadata.find((e) => e.id === epochId);
      if (epochMeta) {
        console.log(
          `[DISTRIBUTE REWARDS] Epoch ${epochId} rewards: ${this.hre.ethers.formatEther(epochMeta.rewardPool)} TRAC`,
        );
      } else {
        console.log(
          `[DISTRIBUTE REWARDS] Epoch ${epochId} rewards: (metadata not found)`,
        );
      }
    } catch (error) {
      console.error(
        `[DISTRIBUTE REWARDS] ❌ Failed to distribute rewards for epoch ${epochId}:`,
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
      // TODO: Check if current timestamp is the timestamp now or the timestamp of the last block
      const currentTime = await this.mining.getCurrentTimestamp();
      await this.catchUpProofPeriods(currentTime);

      // Final epoch reward distribution
      await this.handleEpochTransitions(currentTime);

      // TODO: Export V8.json, V6.json, and globals.json
      console.log(
        '[SIMULATION END] Exporting results (TODO: implement export logic)',
      );

      console.log('[SIMULATION END] Simulation wrap-up completed');
    } catch (error) {
      console.error('[SIMULATION END] ❌ Failed to wrap up simulation:', error);
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
  const dbPath = DEFAULT_DB_PATHS.base_mainnet;
  const simulation = new HistoricalRewardsSimulation(hre, dbPath);

  try {
    // Initialize and run simulation
    await simulation.initialize();
    await simulation.runSimulation();

    console.log('\n[MAIN] ✅ Simulation completed successfully!');
  } catch (error) {
    console.error('[MAIN] ❌ Simulation failed:', error);
    process.exit(1);
  } finally {
    await simulation.cleanup();
  }
}

// Export for use in other scripts
export { HistoricalRewardsSimulation };

// Run the simulation
main().catch((error) => {
  console.error('[MAIN] Fatal error:', error);
  process.exit(1);
});
