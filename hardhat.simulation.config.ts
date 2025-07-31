import 'hardhat-deploy';
import 'hardhat-deploy-ethers';
import '@nomicfoundation/hardhat-chai-matchers';
import '@nomicfoundation/hardhat-ethers';
import '@typechain/hardhat';
import { extendEnvironment } from 'hardhat/config';
import { lazyObject } from 'hardhat/plugins';
import { HardhatRuntimeEnvironment, HardhatUserConfig } from 'hardhat/types';

import { Helpers } from './utils/helpers';
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
    // Local hardhat network for testing simulation setup
    hardhat: {
      environment: 'mainnet',
      chainId: 31337,
      gas: 'auto',
      hardfork: 'shanghai',
      accounts: { count: 200 },
      throwOnTransactionFailures: true,
      throwOnCallFailures: true,
      loggingEnabled: true,
      allowUnlimitedContractSize: true,
      saveDeployments: false,
      mining: {
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
