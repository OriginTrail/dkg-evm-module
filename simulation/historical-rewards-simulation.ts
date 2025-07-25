import { expect } from 'chai';
import hre from 'hardhat';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import {
  getDeployedContract,
  impersonateAccount,
  stopImpersonatingAccount,
  ensureSufficientGasFunds,
  getHubContract,
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
  EPOCH_METADATA,
  NETWORK_HUBS,
} from './helpers/simulation-constants';
import {
  calculateScoresForActiveNodes,
  setupStakingAllowances,
  setupMigratorAllowances,
  initializeProofingTimestamp,
  getNodeEpochPublishingFactors,
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
  private v8nodeEpochDelegatorRewards: {
    [key: number]: { [key: number]: { [key: string]: bigint } };
  } = {};
  private v8NodeDelegatorTotalRewards: { [key: number]: bigint } = {};
  private v8DelegatorEpochRewards: {
    [key: string]: { [key: number]: bigint };
  } = {};
  private v8DelegatorTotalRewards: { [key: string]: bigint } = {};
  private verifyMainnetState: boolean = false;
  private nodeEpochPublishingFactors: {
    [key: number]: { [key: number]: bigint };
  } = {};

  constructor(hre: HardhatRuntimeEnvironment, dbPath: string) {
    this.hre = hre;
    this.db = new SimulationDatabase(dbPath);
    this.mining = new MiningController(hre);
    this.verifyMainnetState = true;
  }

  /**
   * Helper methods for auto-initializing nested reward objects
   */
  private setV8NodeEpochDelegatorReward(
    identityId: number,
    epoch: number,
    delegator: string,
    reward: bigint,
  ): void {
    if (!this.v8nodeEpochDelegatorRewards[identityId]) {
      this.v8nodeEpochDelegatorRewards[identityId] = {};
    }
    if (!this.v8nodeEpochDelegatorRewards[identityId][epoch]) {
      this.v8nodeEpochDelegatorRewards[identityId][epoch] = {};
    }
    this.v8nodeEpochDelegatorRewards[identityId][epoch][delegator] = reward;
  }

  private addV8NodeDelegatorTotalReward(
    identityId: number,
    reward: bigint,
  ): void {
    if (!this.v8NodeDelegatorTotalRewards[identityId]) {
      this.v8NodeDelegatorTotalRewards[identityId] = 0n;
    }
    this.v8NodeDelegatorTotalRewards[identityId] += reward;
  }

  private setV8DelegatorEpochReward(
    delegator: string,
    epoch: number,
    reward: bigint,
  ): void {
    if (!this.v8DelegatorEpochRewards[delegator]) {
      this.v8DelegatorEpochRewards[delegator] = {};
    }
    this.v8DelegatorEpochRewards[delegator][epoch] = reward;
  }

  private addV8DelegatorTotalReward(delegator: string, reward: bigint): void {
    if (!this.v8DelegatorTotalRewards[delegator]) {
      this.v8DelegatorTotalRewards[delegator] = 0n;
    }
    this.v8DelegatorTotalRewards[delegator] += reward;
  }

  /**
   * Initialize the simulation
   */
  async initialize(): Promise<void> {
    console.log(
      '🚀 Initializing DKG V8.0 to V8.1 Historical Rewards Simulation\n',
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
    this.contracts = {
      staking: await getDeployedContract(this.hre, 'Staking'),
      stakingStorage: await getDeployedContract(this.hre, 'StakingStorage'),
      stakingKPI: await getDeployedContract(this.hre, 'StakingKPI'),
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
      parametersStorage: await getDeployedContract(
        this.hre,
        'ParametersStorage',
      ),
      epochStorage: await getDeployedContract(this.hre, 'EpochStorageV8'),
    };

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

        // TODO: call _prepareForStakeChange for all nodes and their delegators for currentEpoch - 1 - make it public in Staking contract
        console.log(
          `[EPOCH TRANSITION] Calling _prepareForStakeChange for all nodes and their delegators for currentEpoch - 1`,
        );
        const maxIdentityId = Number(
          await this.contracts.identityStorage.lastIdentityId(),
        );

        for (let identityId = 1; identityId <= maxIdentityId; identityId++) {
          const delegators =
            await this.contracts.delegatorsInfo.getDelegators(identityId);

          for (const delegator of delegators) {
            const delegatorKey = this.hre.ethers.keccak256(
              this.hre.ethers.solidityPacked(['address'], [delegator]),
            );
            await this.contracts.staking._prepareForStakeChange(
              Number(currentEpoch) - 1,
              identityId,
              delegatorKey,
            );
          }
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

    console.log(
      `[PROCESS TRANSACTION] msg.sender: ${tx.from} is calling ${tx.contract}.${tx.functionName}(${tx.functionInputs
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
      } = await initializeValidationVariables(this.contracts, tx);

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
        );
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
   * Distribute rewards for all epochs at the end of the simulation
   */
  private async distributeRewards(): Promise<void> {
    try {
      const epochMetadata = EPOCH_METADATA[this.chain];
      const epochs = epochMetadata.map((e) => e.epoch);
      for (const epoch of epochs) {
        let totalNodeRewards = 0n;

        const epochMeta = epochMetadata.find((e) => e.epoch === epoch);
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
          const nodeRewards = BigInt(
            await this.contracts.stakingKPI.getNetNodeRewards(
              identityId,
              epoch,
            ),
          );
          totalNodeRewards += nodeRewards;

          const delegators =
            await this.contracts.delegatorsInfo.getDelegators(identityId);

          for (const delegator of delegators) {
            const reward = await this.contracts.stakingKPI.getDelegatorReward(
              identityId,
              epoch,
              delegator,
            );

            if (reward > 0n) {
              // Set rewards using helper methods that auto-initialize
              this.setV8NodeEpochDelegatorReward(
                identityId,
                epoch,
                delegator,
                reward,
              );
              this.addV8NodeDelegatorTotalReward(identityId, reward);
              this.setV8DelegatorEpochReward(delegator, epoch, reward);
              this.addV8DelegatorTotalReward(delegator, reward);
            }
          }
        }
        expect(totalNodeRewards).to.equal(
          rewardPool,
          `Total node rewards for epoch ${epoch} do not match the reward pool`,
        );
      }
    } catch (error) {
      console.error(
        `[DISTRIBUTE REWARDS] ❌ Failed to distribute rewards for epoch ${epoch}:`,
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

      // TODO: Export V8.json, and globals.json
      console.log('[SIMULATION END] Exporting results');

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
