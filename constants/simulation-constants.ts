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
    v8_0StartBlock: 7323300, // 1.1.2025
    v8_1StartBlock: 9819203, // Staking deployment block (V8.1 start)
    gasPrice: 100, // Lower gas price for Neuroweb
    gasLimit: 10_000_000,
  },
  gnosis_mainnet: {
    chainId: 100,
    v8_0StartBlock: 37812700, // 1.1.2025
    v8_1StartBlock: 40781172, // Staking deployment block (V8.1 start)
    gasPrice: 2_000_000_000, // 2 gwei
    gasLimit: 17_000_000,
  },
};

/**
 * Hub owner addresses for each chain (multisig wallets)
 * These are needed for impersonating hub owner during simulation setup
 * hub address -> hub owner address
 */
export const HUB_OWNERS = {
  '0x99Aa571fD5e681c2D27ee08A7b7989DB02541d13':
    '0x4Cd6467b797846E63a27c92350d040C428394068',
  '0x0957e25BD33034948abc28204ddA54b6E1142D6F':
    '0xDafb0Abaf750B97fB323c61Ec90cB038026eC6C1',
  '0x882D0BF07F956b1b94BBfe9E77F47c6fc7D4EC8f':
    '0xBF92638301f5d4c98c0B06750181B99E20F87F17',
} as const;

export const NETWORK_HUBS = {
  '0x99Aa571fD5e681c2D27ee08A7b7989DB02541d13': 'base_mainnet',
  '0x0957e25BD33034948abc28204ddA54b6E1142D6F': 'neuroweb_mainnet',
  '0x882D0BF07F956b1b94BBfe9E77F47c6fc7D4EC8f': 'gnosis_mainnet',
} as const;

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
