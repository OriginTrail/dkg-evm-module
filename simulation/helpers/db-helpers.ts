import BetterSqlite3 from 'better-sqlite3';

// Types for database operations
export type TransactionData = {
  hash: string;
  from: string;
  contract: string;
  functionName: string;
  args: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
};

export type BlockData = {
  blockNumber: number;
  timestamp: number;
  txs: TransactionData[];
};

export type DatabaseRow = {
  block_number: number;
  tx_index: number;
  msg_sender: string;
  transaction_hash: string;
  contract_name: string;
  function_name: string;
  function_inputs: string;
  processed: boolean;
  error: string | null;
  block_timestamp: number; // Provided in the database
};

/**
 * Database Helper Class
 * Manages SQLite database operations for transaction processing
 */
export class SimulationDatabase {
  private db: BetterSqlite3.Database;

  constructor(dbPath: string) {
    this.db = new BetterSqlite3(dbPath);
    this.initializeDatabase();
  }

  private initializeDatabase(): void {
    // Create index for timestamp if needed
    try {
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_block_timestamp 
        ON enriched_events (block_timestamp);
      `);
    } catch {
      // Index might already exist, ignore error
    }
  }

  /**
   * Get ordered transactions by block in batches
   * Returns blocks with all their transactions in order
   */
  getOrderedTxsByBlockBatch(batchSize: number = 50): BlockData[] {
    // First, get the next batch of complete blocks
    const nextBlocks = this.db
      .prepare(
        `
        SELECT DISTINCT block_number 
        FROM enriched_events 
        WHERE processed = 0 
        ORDER BY block_number ASC 
        LIMIT ?
      `,
      )
      .all(batchSize) as { block_number: number }[];

    if (nextBlocks.length === 0) {
      return []; // No more blocks to process
    }

    const blockNumbers = nextBlocks.map((row) => row.block_number);
    const placeholders = blockNumbers.map(() => '?').join(',');

    // Get all transactions for these complete blocks
    const txs = this.db
      .prepare(
        `
        SELECT * FROM enriched_events 
        WHERE block_number IN (${placeholders})
        ORDER BY block_number ASC, tx_index ASC
      `,
      )
      .all(...blockNumbers) as DatabaseRow[];

    // Group transactions by block
    const blockGroups: { [key: number]: BlockData } = {};

    for (const tx of txs) {
      if (!blockGroups[tx.block_number]) {
        blockGroups[tx.block_number] = {
          blockNumber: tx.block_number,
          timestamp: tx.block_timestamp,
          txs: [],
        };
      }

      blockGroups[tx.block_number].txs.push({
        hash: tx.transaction_hash,
        from: tx.msg_sender,
        contract: tx.contract_name,
        functionName: tx.function_name,
        args: JSON.parse(tx.function_inputs),
      });
    }

    return Object.values(blockGroups);
  }

  /**
   * Check if a transaction has already been processed
   */
  isProcessedTx(txHash: string): boolean {
    const result = this.db
      .prepare(
        'SELECT processed FROM enriched_events WHERE transaction_hash = ?',
      )
      .get(txHash) as { processed: boolean } | undefined;

    return result?.processed || false;
  }

  /**
   * Mark a transaction as processed
   */
  markTxAsProcessed(txHash: string, success: boolean = true): void {
    this.db
      .prepare(
        'UPDATE enriched_events SET processed = ? WHERE transaction_hash = ?',
      )
      .run(success ? 1 : 0, txHash);
  }

  /**
   * Record an error for a failed transaction
   */
  recordTxError(txHash: string, error: string): void {
    this.db
      .prepare(
        'UPDATE enriched_events SET error = ? WHERE transaction_hash = ?',
      )
      .run(error, txHash);
  }

  /**
   * Get total unprocessed transaction count
   */
  getUnprocessedCount(): number {
    const result = this.db
      .prepare(
        'SELECT COUNT(*) as count FROM enriched_events WHERE processed = 0',
      )
      .get() as { count: number };

    return result.count;
  }

  /**
   * Get block range for unprocessed transactions
   */
  getUnprocessedBlockRange(): { minBlock: number; maxBlock: number } {
    const result = this.db
      .prepare(
        `
        SELECT 
          MIN(block_number) as minBlock, 
          MAX(block_number) as maxBlock 
        FROM enriched_events 
        WHERE processed = 0
      `,
      )
      .get() as { minBlock: number; maxBlock: number };

    return result;
  }

  /**
   * Get statistics about the database
   */
  getStats(): {
    totalTransactions: number;
    processedTransactions: number;
    unprocessedTransactions: number;
    uniqueBlocks: number;
    blockRange: { minBlock: number; maxBlock: number };
  } {
    const totalTxs = this.db
      .prepare('SELECT COUNT(*) as count FROM enriched_events')
      .get() as { count: number };

    const processedTxs = this.db
      .prepare(
        'SELECT COUNT(*) as count FROM enriched_events WHERE processed = 1',
      )
      .get() as { count: number };

    const uniqueBlocks = this.db
      .prepare(
        'SELECT COUNT(DISTINCT block_number) as count FROM enriched_events',
      )
      .get() as { count: number };

    const blockRange = this.db
      .prepare(
        `
        SELECT 
          MIN(block_number) as minBlock, 
          MAX(block_number) as maxBlock 
        FROM enriched_events
      `,
      )
      .get() as { minBlock: number; maxBlock: number };

    return {
      totalTransactions: totalTxs.count,
      processedTransactions: processedTxs.count,
      unprocessedTransactions: totalTxs.count - processedTxs.count,
      uniqueBlocks: uniqueBlocks.count,
      blockRange,
    };
  }

  /**
   * Reset all processed flags (useful for re-running simulation)
   */
  resetProcessedFlags(): void {
    this.db
      .prepare('UPDATE enriched_events SET processed = 0, error = NULL')
      .run();
  }

  /**
   * Get contracts and functions distribution
   */
  getContractFunctionStats(): {
    contract: string;
    function: string;
    count: number;
  }[] {
    const results = this.db
      .prepare(
        `
        SELECT 
          contract_name as contract,
          function_name as function,
          COUNT(*) as count
        FROM enriched_events 
        GROUP BY contract_name, function_name
        ORDER BY count DESC
      `,
      )
      .all() as { contract: string; function: string; count: number }[];

    return results;
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}
