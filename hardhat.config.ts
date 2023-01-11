import 'dotenv/config';
import 'hardhat-abi-exporter';
import 'hardhat-deploy';
import 'hardhat-deploy-ethers';
import 'hardhat-gas-reporter';
import 'hardhat-contract-sizer';
import 'hardhat-tracer';
import 'solidity-coverage';
import '@typechain/hardhat';
import '@nomicfoundation/hardhat-chai-matchers';
import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-solhint';
import { HardhatUserConfig, extendEnvironment } from 'hardhat/config';
import { lazyObject } from 'hardhat/plugins';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import './tasks/address_converter';
import './utils/type-extensions';
import { Helpers } from './utils/helpers';
import { accounts, rpc } from './utils/network';

extendEnvironment((hre: HardhatRuntimeEnvironment) => {
  hre.helpers = lazyObject(() => new Helpers());
});

const config: HardhatUserConfig = {
  defaultNetwork: 'hardhat',
  namedAccounts: {
    deployer: 0,
    minter: 0,
  },
  networks: {
    localhost: {
      url: rpc('localhost'),
      accounts: accounts('localhost'),
      saveDeployments: false,
    },
    hardhat: {
      chainId: 31337,
      gas: 6_000_000,
      gasMultiplier: 1,
      blockGasLimit: 30_000_000,
      hardfork: 'merge',
      throwOnTransactionFailures: true,
      throwOnCallFailures: true,
      loggingEnabled: false,
      allowUnlimitedContractSize: false,
      saveDeployments: false,
    },
    otp_devnet: {
      chainId: 2160,
      url: rpc('otp_devnet'),
      gas: 10_000_000, // Gas limit used for deployments
      gasPrice: 1_000_000,
      accounts: accounts('otp_devnet'),
    },
    otp_testnet: {
      chainId: 20430,
      url: rpc('otp_testnet'),
      gas: 10_000_000, // Gas limit used for deploys
      gasPrice: 20,
      accounts: accounts('otp_testnet'),
    },
    otp_mainnet: {
      chainId: 2043,
      url: rpc('otp_mainnet'),
      gas: 10_000_000, // Gas limit used for deploys
      gasPrice: 10,
      accounts: accounts('otp_mainnet'),
    },
  },
  solidity: {
    version: '0.8.16',
    settings: {
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
      viaIR: process.env.COVERAGE_REPORT ? false : true,
    },
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
  typechain: {
    outDir: 'typechain',
    target: 'ethers-v5',
  },
  mocha: {
    reporterOptions: {
      excludeContracts: [],
    },
  },
  abiExporter: {
    path: './abi',
    runOnCompile: true,
    clear: true,
    flat: true,
    only: [],
    except: [],
    spacing: 2,
    pretty: true,
  },
  gasReporter: {
    enabled: process.env.GAS_REPORT ? true : false,
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: false,
    disambiguatePaths: false,
    strict: false,
    only: [],
    except: [],
  },
};

export default config;
