/**
 * Simulation Constants
 * Configuration values for the DKG V8.0 to V8.1 historical rewards simulation
 */

// Timing constants
export const PROOF_PERIOD_SECONDS = 30 * 60; // 30 minutes

// Batch processing constants
export const DEFAULT_BATCH_SIZE = 50;

// Database file paths (these can be overridden)
export const DEFAULT_DB_PATHS = {
  base: './decoded_transactions_base_mainnet.db',
  neuroweb: './decoded_transactions_neuroweb_mainnet.db',
  gnosis: './decoded_transactions_gnosis_mainnet.db',
} as const;

// Export type for supported chains
export type SupportedChain = keyof typeof DEFAULT_DB_PATHS;
