import hre from 'hardhat';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import { verifyContractDeployments } from './helpers/blockchain-helpers';
import { PROOF_PERIOD_SECONDS } from './helpers/constants';
import {
  SimulationDatabase,
  TransactionData,
  BlockData,
} from './helpers/db-helpers';
import { MiningController } from './helpers/mining-controller';
import { calculateScoresForActiveNodes } from './helpers/simulation-helpers';

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

    // Step 1: Disable auto-mining
    console.log('[INIT] Disabling auto-mining...');
    await this.mining.disableAutoMining();

    // Step 2: Get simulation status
    const unprocessedCount = this.db.getUnprocessedCount();
    const blockRange = this.db.getUnprocessedBlockRange();

    console.log(`[INIT] Simulation Status:`);
    console.log(`   Unprocessed transactions: ${unprocessedCount}`);
    console.log(
      `   Block range: ${blockRange.minBlock} - ${blockRange.maxBlock}`,
    );

    // Step 3: Get current fork status
    const currentBlock = await this.mining.getCurrentBlock();
    const currentTimestamp = await this.mining.getCurrentTimestamp();

    console.log(`\n[INIT] Fork Status:`);
    console.log(`   Current block: ${currentBlock}`);
    console.log(
      `   Current timestamp: ${currentTimestamp} (${new Date(currentTimestamp * 1000).toISOString()})`,
    );

    // Step 4: Verify contract deployments
    console.log('\n🔍 Verifying contract deployments...');
    // TODO: Make this verify all contracts with expected values
    await verifyContractDeployments(this.hre);

    // Step 5: Initialize proofing timestamp
    // TODO: Make sure this has the timestamp of the first block in the simulation - not today's timestamp
    this.lastProofingTimestamp = currentTimestamp;

    console.log(`\n✅ Simulation initialized successfully!`);
  }

  /**
   * Main simulation entry point
   * Replays historical transactions and calculates rewards
   */
  async runSimulation(): Promise<void> {
    console.log('\n[SIM] Starting Historical Transaction Replay...');

    // TODO: Implement main simulation logic
    // 1. Load transactions in chronological order
    // 2. Set up initial state at V8.0
    // 3. Replay transactions with proper timing
    // 4. Calculate rewards after each proof period
    // 5. Generate final report
  }

  /**
   * Process a batch of blocks
   * Replays blocks and manages state
   */
  async processBlockBatch(blockBatch: BlockData[]): Promise<void> {
    console.log(`[SIM] Processing batch of ${blockBatch.length} blocks...`);

    for (const block of blockBatch) {
      await this.processBlock(block);
    }
  }

  /**
   * Process a single block's transactions
   */
  async processBlock(block: BlockData): Promise<void> {
    console.log(
      `🔗 Processing block ${block.blockNumber} with ${block.txs.length} transactions`,
    );

    // Set EVM time to block timestamp
    await this.mining.setTime(block.timestamp);

    // Process each transaction in the block
    for (const tx of block.txs) {
      await this.processTransaction(tx);
    }

    // Mine the block
    await this.mining.mineBlock();
  }

  /**
   * Process a single transaction
   */
  async processTransaction(tx: TransactionData): Promise<void> {
    console.log(
      `[TX PROCESSING] Processing ${tx.contract}.${tx.functionName}(${tx.args}) tx: ${tx.hash}`,
    );

    // TODO: Implement transaction replay logic
    // 1. Call the contract function with historical args
    // 2. Update state tracking
    // 3. Mark transaction as processed
    // 4. Check if proof period has elapsed

    // Mark as processed for now
    this.db.markTxAsProcessed(tx.hash);
  }

  /**
   * Check if a proof period has elapsed and calculate rewards
   */
  async checkProofPeriod(): Promise<void> {
    const currentTime = await this.mining.getCurrentTimestamp();

    if (currentTime - this.lastProofingTimestamp >= PROOF_PERIOD_SECONDS) {
      console.log(
        '[PROOFING] Proof period elapsed - calculating scores for active nodes...',
      );

      await calculateScoresForActiveNodes(
        this.hre,
        this.lastProofingTimestamp + PROOF_PERIOD_SECONDS,
      );

      this.lastProofingTimestamp = currentTime;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    console.log('\n🧹 Cleaning up...');
    this.db.close();
    console.log('✅ Database connection closed');
  }
}

/**
 * Main function to run the simulation
 */
async function main() {
  // Path to the database file
  const dbPath = './decoded_transactions_base_mainnet.db';

  // Initialize simulation
  const simulation = new HistoricalRewardsSimulation(hre, dbPath);

  try {
    // Initialize and run simulation
    await simulation.initialize();
    await simulation.runSimulation();

    console.log('\n🎯 Simulation completed successfully!');
  } catch (error) {
    console.error('❌ Simulation failed:', error);
    process.exit(1);
  } finally {
    await simulation.cleanup();
  }
}

// Export for use in other scripts
export { HistoricalRewardsSimulation };

// Run the simulation
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
