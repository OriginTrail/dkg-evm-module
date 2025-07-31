/**
 * Block numbers and timestamps for V8.0 to V8.1 simulation period
 * These are based on the actual deployment blocks from the deployments/ directory
 */

export const SIMULATION_CHAINS_START_BLOCK: Record<string, number> = {
  base_mainnet: 24277327, // 28.12.2024 (V8.0 start after all migrations)
  neuroweb_mainnet: 7266256, // 28.12.2024
  gnosis_mainnet: 37746315, // 28.12.2024
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

export const OLD_HUB_ADDRESSES = {
  base_mainnet: '0xaBfcf2ad1718828E7D3ec20435b0d0b5EAfbDf2c',
  neuroweb_mainnet: '0x5fA7916c48Fe6D5F1738d12Ad234b78c90B4cAdA',
  gnosis_mainnet: '0xbEF14fc04F870c2dD65c13Df4faB6ba01A9c746b',
} as const;

/**
 * Simulation-specific constants
 */
export const SIMULATION_CONSTANTS = {
  PROOF_PERIOD_SECONDS: 30 * 60, // 30 minutes as specified in the SPEC
  BATCH_SIZE: 50, // Process blocks in batches of 50
  MAX_RETRIES: 3, // Max retries for failed transactions
};

// Timing constants
export const PROOF_PERIOD_SECONDS = 30 * 60; // 30 minutes

// Batch processing constants
export const DEFAULT_BATCH_SIZE = 50;

// Database file paths (these can be overridden)
export const DEFAULT_DB_PATHS = {
  base_mainnet: './simulation/db/decoded_transactions_base_mainnet.db',
  neuroweb_mainnet: './simulation/db/decoded_transactions_neuroweb_mainnet.db',
  gnosis_mainnet: './simulation/db/decoded_transactions_gnosis_mainnet.db',
} as const;

export const RPC_URLS = {
  base_mainnet: process.env.RPC_BASE_MAINNET,
  neuroweb_mainnet: process.env.RPC_NEUROWEB_MAINNET,
  gnosis_mainnet: process.env.RPC_GNOSIS_MAINNET,
} as const;

export const DELEGATORS_INFO_MAINNET_ADDRESSES = {
  base_mainnet: '0xbc50dAB30f5f549eAAeFF6738fc62013F3011589',
  neuroweb_mainnet: '0x1fa06DC62de288A1DB21B39afc93e44EE2a8623d',
  gnosis_mainnet: '0x1fa06DC62de288A1DB21B39afc93e44EE2a8623d',
} as const;

// Export type for supported chains
export type SupportedChain = keyof typeof DEFAULT_DB_PATHS;
