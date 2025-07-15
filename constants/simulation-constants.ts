/**
 * Block numbers and timestamps for V8.0 to V8.1 simulation period
 * These are based on the actual deployment blocks from the deployments/ directory
 */

export type ChainSimulationConfig = {
  chainId: number;
  v8_0StartBlock: number;
  v8_1StartBlock: number;
  gasPrice: number;
  gasLimit: number;
};

export const SIMULATION_CHAINS: Record<string, ChainSimulationConfig> = {
  base_mainnet: {
    chainId: 8453,
    v8_0StartBlock: 24450127, // 1.1.2025 (V8.0 start after all migrations)
    v8_1StartBlock: 32076123, // Staking deployment block (V8.1 start)
    gasPrice: 1_000_000_000, // 1 gwei
    gasLimit: 30_000_000,
  },
  neuroweb_mainnet: {
    chainId: 2043,
    v8_0StartBlock: 7237897, // Hub deployment block (V8.0 start)
    v8_1StartBlock: 9819203, // Staking deployment block (V8.1 start)
    gasPrice: 100, // Lower gas price for Neuroweb
    gasLimit: 10_000_000,
  },
  gnosis_mainnet: {
    chainId: 100,
    v8_0StartBlock: 37713034, // Hub deployment block (V8.0 start)
    v8_1StartBlock: 40781172, // Staking deployment block (V8.1 start)
    gasPrice: 2_000_000_000, // 2 gwei
    gasLimit: 17_000_000,
  },
};

/**
 * Simulation-specific constants
 */
export const SIMULATION_CONSTANTS = {
  PROOF_PERIOD_SECONDS: 30 * 60, // 30 minutes as specified in the SPEC
  BATCH_SIZE: 50, // Process blocks in batches of 50
  MAX_RETRIES: 3, // Max retries for failed transactions
};

/**
 * Helper function to get chain config by name
 */
export function getChainConfig(chainName: string): ChainSimulationConfig {
  const config = SIMULATION_CHAINS[chainName];
  if (!config) {
    throw new Error(`Chain configuration not found for: ${chainName}`);
  }
  return config;
}
