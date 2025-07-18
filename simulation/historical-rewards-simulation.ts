import { expect } from 'chai';
import hre from 'hardhat';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import {
  getDeployedContracts,
  verifyContractDeployments,
} from './helpers/blockchain-helpers';
import { PROOF_PERIOD_SECONDS } from './helpers/constants';
import {
  SimulationDatabase,
  TransactionData,
  BlockData,
} from './helpers/db-helpers';
import { MiningController } from './helpers/mining-controller';

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
    console.log('🛑 Disabling auto-mining...');
    await this.mining.disableAutoMining();

    // Step 2: Get simulation status
    const unprocessedCount = this.db.getUnprocessedCount();
    const blockRange = this.db.getUnprocessedBlockRange();

    console.log(`📊 Simulation Status:`);
    console.log(`   Unprocessed transactions: ${unprocessedCount}`);
    console.log(
      `   Block range: ${blockRange.minBlock} - ${blockRange.maxBlock}`,
    );

    // Step 3: Get current fork status
    const currentBlock = await this.mining.getCurrentBlock();
    const currentTimestamp = await this.mining.getCurrentTimestamp();

    console.log(`\n🔗 Fork Status:`);
    console.log(`   Current block: ${currentBlock}`);
    console.log(
      `   Current timestamp: ${currentTimestamp} (${new Date(currentTimestamp * 1000).toISOString()})`,
    );

    // Step 4: Verify contract deployments
    console.log('\n🔍 Verifying contract deployments...');
    await verifyContractDeployments(this.hre);

    // Step 5: Initialize proofing timestamp
    // TODO: This should be loaded from epoch metadata
    this.lastProofingTimestamp = currentTimestamp;

    console.log(`\n✅ Simulation initialized successfully!`);
  }

  /**
   * Main simulation entry point
   * Replays historical transactions and calculates rewards
   */
  async runSimulation(): Promise<void> {
    console.log('\n🚀 Starting Historical Transaction Replay...');

    // TODO: Implement main simulation logic
    // 1. Load transactions in chronological order
    // 2. Set up initial state at V8.0
    // 3. Replay transactions with proper timing
    // 4. Calculate rewards after each proof period
    // 5. Generate final report

    console.log('💡 Core simulation logic to be implemented...');
  }

  /**
   * Process a batch of transactions
   * Replays transactions and manages state
   */
  async processTransactionBatch(blockBatch: BlockData[]): Promise<void> {
    console.log(`📦 Processing batch of ${blockBatch.length} blocks...`);

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
      `📋 Processing ${tx.contract}.${tx.functionName}() tx: ${tx.hash}`,
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
      console.log('⏰ Proof period elapsed - calculating rewards...');

      await this.calculateScoresForActiveNodes(
        this.lastProofingTimestamp + PROOF_PERIOD_SECONDS,
      );

      this.lastProofingTimestamp = currentTime;
    }
  }

  /**
   * Calculate scores for all active nodes in the sharding table
   * This implements the core scoring logic from the V8.1 Random Sampling system
   */
  async calculateScoresForActiveNodes(
    proofingTimestamp: number,
  ): Promise<void> {
    console.log(
      `📊 Calculating scores for active nodes at timestamp ${proofingTimestamp}`,
    );

    try {
      // Get contract instances from the deployed contracts
      const deployments = await getDeployedContracts(this.hre);

      const profileStorage = deployments.ProfileStorage;
      const shardingTableStorage = deployments.ShardingTableStorage;
      const randomSampling = deployments.RandomSampling;
      const randomSamplingStorage = deployments.RandomSamplingStorage;
      const stakingStorage = deployments.StakingStorage;
      const chronos = deployments.Chronos;

      // Get current epoch and proof period start block
      const currentEpoch = await chronos.getCurrentEpoch();

      // Get the total number of nodes to iterate through
      // We'll use a reasonable upper bound and check each identity ID
      const maxIdentityId = await profileStorage.lastIdentityId();

      let activeNodesCount = 0;

      // Iterate through all possible identity IDs
      for (let identityId = 1; identityId <= maxIdentityId; identityId++) {
        try {
          // Check if profile exists
          const profileExists = await profileStorage.profileExists(identityId);
          if (!profileExists) {
            continue;
          }

          // Check if node is active in sharding table
          const nodeExists = await shardingTableStorage.nodeExists(identityId);
          if (!nodeExists) {
            continue;
          }

          // Node is active - calculate score
          const score18 = await randomSampling.calculateNodeScore(identityId);

          if (score18 > 0) {
            // Add to node epoch score
            await randomSamplingStorage.addToNodeEpochScore(
              currentEpoch,
              identityId,
              score18,
            );

            // Add to all nodes epoch score
            await randomSamplingStorage.addToAllNodesEpochScore(
              currentEpoch,
              score18,
            );

            // Calculate and add score per stake
            const totalNodeStake =
              await stakingStorage.getNodeStake(identityId);
            if (totalNodeStake > 0) {
              // score18 * SCALE18 / totalNodeStake = nodeScorePerStake36
              const SCALE18 = BigInt('1000000000000000000'); // 10^18
              const nodeScorePerStake36 = (score18 * SCALE18) / totalNodeStake;

              await randomSamplingStorage.addToNodeEpochScorePerStake(
                currentEpoch,
                identityId,
                nodeScorePerStake36,
              );
            }

            activeNodesCount++;

            console.log(
              `   ✅ Node ${identityId}: score=${this.hre.ethers.formatEther(score18)}`,
            );
          }
        } catch (error) {
          console.error(`   ⚠️  Error processing node ${identityId}: ${error}`);
          // Continue with next node
        }
      }

      console.log(`   📈 Processed ${activeNodesCount} active nodes`);
      expect(activeNodesCount).to.equal(
        await shardingTableStorage.nodesCount(),
        `Active nodes count ${activeNodesCount} should match the number of nodes in the sharding table ${await shardingTableStorage.nodesCount()}`,
      );
    } catch (error) {
      console.error(`❌ Error calculating scores for active nodes: ${error}`);
      throw error;
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
