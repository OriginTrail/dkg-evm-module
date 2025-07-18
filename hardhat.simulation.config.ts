import 'hardhat-deploy';
import 'hardhat-deploy-ethers';
import '@nomicfoundation/hardhat-chai-matchers';
import '@nomicfoundation/hardhat-ethers';
import '@typechain/hardhat';
import { extendEnvironment } from 'hardhat/config';
import { lazyObject } from 'hardhat/plugins';
import { HardhatRuntimeEnvironment, HardhatUserConfig } from 'hardhat/types';

import { getChainConfig } from './constants/simulation-constants';
import { Helpers } from './utils/helpers';
import { rpc } from './utils/network';
import './utils/type-extensions';

extendEnvironment((hre: HardhatRuntimeEnvironment) => {
  hre.helpers = lazyObject(() => new Helpers(hre));
});

/**
 * Hardhat configuration specifically for V8.0 to V8.1 simulation
 * This config forks mainnet chains from their V8.0 start blocks
 */
const config: HardhatUserConfig = {
  defaultNetwork: 'hardhat',
  namedAccounts: {
    deployer: 0,
    minter: 0,
  },
  networks: {
    // Base mainnet simulation fork
    base_mainnet_simulation: {
      environment: 'mainnet',
      chainId: getChainConfig('base_mainnet').chainId,
      url: rpc('base_mainnet'),
      // No accounts config - use forked chain accounts directly
      forking: {
        url: rpc('base_mainnet'),
        blockNumber: getChainConfig('base_mainnet').v8_0StartBlock,
        enabled: true,
      },
      gas: getChainConfig('base_mainnet').gasLimit,
      gasPrice: getChainConfig('base_mainnet').gasPrice,
      blockGasLimit: getChainConfig('base_mainnet').gasLimit,
      allowUnlimitedContractSize: true,
      throwOnTransactionFailures: true,
      throwOnCallFailures: true,
      loggingEnabled: false,
      mining: {
        auto: true, // Enable auto-mining for deployments, but no interval for simulation control
        mempool: {
          order: 'fifo',
        },
      },
      hardfork: 'shanghai',
      saveDeployments: false,
    },

    // Neuroweb mainnet simulation fork
    neuroweb_mainnet_simulation: {
      environment: 'mainnet',
      chainId: getChainConfig('neuroweb_mainnet').chainId,
      url: rpc('neuroweb_mainnet'),
      // No accounts config - use forked chain accounts directly
      forking: {
        url: rpc('neuroweb_mainnet'),
        blockNumber: getChainConfig('neuroweb_mainnet').v8_0StartBlock,
        enabled: true,
      },
      gas: getChainConfig('neuroweb_mainnet').gasLimit,
      gasPrice: getChainConfig('neuroweb_mainnet').gasPrice,
      blockGasLimit: getChainConfig('neuroweb_mainnet').gasLimit,
      allowUnlimitedContractSize: true,
      throwOnTransactionFailures: true,
      throwOnCallFailures: true,
      loggingEnabled: false,
      mining: {
        auto: true, // Enable auto-mining for deployments, but no interval for simulation control
        mempool: {
          order: 'fifo',
        },
      },
      hardfork: 'shanghai',
      saveDeployments: false,
    },

    // Gnosis mainnet simulation fork
    gnosis_mainnet_simulation: {
      environment: 'mainnet',
      chainId: getChainConfig('gnosis_mainnet').chainId,
      url: rpc('gnosis_mainnet'),
      // No accounts config - use forked chain accounts directly
      forking: {
        url: rpc('gnosis_mainnet'),
        blockNumber: getChainConfig('gnosis_mainnet').v8_0StartBlock,
        enabled: true,
      },
      gas: getChainConfig('gnosis_mainnet').gasLimit,
      gasPrice: getChainConfig('gnosis_mainnet').gasPrice,
      blockGasLimit: getChainConfig('gnosis_mainnet').gasLimit,
      allowUnlimitedContractSize: true,
      throwOnTransactionFailures: true,
      throwOnCallFailures: true,
      loggingEnabled: false,
      mining: {
        auto: true, // Enable auto-mining for deployments, but no interval for simulation control
        mempool: {
          order: 'fifo',
        },
      },
      hardfork: 'shanghai',
      saveDeployments: false,
    },

    // Local hardhat network for testing simulation setup
    hardhat: {
      environment: 'mainnet',
      chainId: 31337,
      gas: 30_000_000,
      gasMultiplier: 1,
      blockGasLimit: 30_000_000,
      hardfork: 'shanghai',
      accounts: { count: 200 },
      throwOnTransactionFailures: true,
      throwOnCallFailures: true,
      loggingEnabled: false,
      allowUnlimitedContractSize: true,
      saveDeployments: false,
      mining: {
        auto: true, // Enable auto-mining for deployments, but no interval for simulation control
        mempool: {
          order: 'fifo',
        },
      },
      // Support for forking from command line
      forking: process.env.HARDHAT_FORK_URL
        ? {
            url: process.env.HARDHAT_FORK_URL,
            blockNumber: process.env.HARDHAT_FORK_BLOCK
              ? parseInt(process.env.HARDHAT_FORK_BLOCK)
              : undefined,
            enabled: true,
          }
        : undefined,
    },

    // Localhost connection for when running hardhat node in terminal
    localhost: {
      environment: 'mainnet',
      url: 'http://localhost:8545',
      // Use accounts from the forked chain when connecting to localhost
      saveDeployments: false,
      timeout: 60000,
      // Mark as simulation network for testing
      chainId: 31337, // Will be overridden by forked chain
    },
  },

  // Solidity compiler configuration
  solidity: {
    compilers: [
      {
        version: '0.8.20',
        settings: {
          evmVersion: 'london',
          optimizer: {
            enabled: true,
            runs: 200,
            details: {
              peephole: true,
              inliner: true,
              jumpdestRemover: true,
              orderLiterals: true,
              deduplicate: true,
              cse: true,
              constantOptimizer: true,
              yul: true,
              yulDetails: {
                stackAllocation: true,
              },
            },
          },
          viaIR: true,
        },
      },
    ],
  },

  // Paths configuration
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },

  // Mocha configuration for simulation tests
  mocha: {
    timeout: 300000, // 5 minutes timeout for simulation tests
    reporterOptions: {
      excludeContracts: [],
    },
  },

  // TypeChain configuration
  typechain: {
    outDir: 'typechain',
    target: 'ethers-v6',
  },
};

export default config;
