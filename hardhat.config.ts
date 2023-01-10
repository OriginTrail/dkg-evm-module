import 'dotenv/config';
import { HardhatUserConfig } from 'hardhat/config';
import '@typechain/hardhat'
import '@nomicfoundation/hardhat-chai-matchers'
import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-solhint';
import 'solidity-coverage';
import {extendEnvironment} from 'hardhat/config';
import { lazyObject } from "hardhat/plugins";
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import 'hardhat-abi-exporter';
import 'hardhat-deploy';
import 'hardhat-deploy-ethers';
import 'hardhat-gas-reporter';
import 'hardhat-contract-sizer';
import 'hardhat-tracer';
import {Helpers} from './utils/helpers';
import {accounts, rpc} from './utils/network';
import './utils/type-extensions';

extendEnvironment((hre: HardhatRuntimeEnvironment) => {
  hre.helpers = lazyObject(() => new Helpers());
});

const config: HardhatUserConfig = {
  defaultNetwork: "localhost",
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
      gasPrice: "auto",
      gasMultiplier: 1,
      blockGasLimit: 30_000_000,
      hardfork: "merge",
      throwOnTransactionFailures: true,
      throwOnCallFailures: true,
      loggingEnabled: false,
      allowUnlimitedContractSize: false,
      mining: {
        auto: true,
        interval: 0,
      },
      saveDeployments: false,
    },
    otp_devnet: {
      chainId: 2160,
      url: rpc("otp_devnet"),
      gas: 10_000_000, // Gas limit used for deployments
      gasPrice: 1_000_000,
      accounts: accounts("otp_devnet"),
    },
    otp_testnet: {
      chainId: 20430,
      url: rpc("otp_testnet"),
      gas: 10_000_000, // Gas limit used for deploys
      gasPrice: 20,
      accounts: accounts("otp_testnet"),
    },
    otp_mainnet: {
      chainId: 2043,
      url: rpc("otp_mainnet"),
      gas: 10_000_000, // Gas limit used for deploys
      gasPrice: 10,
      accounts: accounts("otp_mainnet"),
    },
  },
  solidity: {
    version: "0.8.16",
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
            stackAllocation: true
          }
        }
      },
      viaIR: true
      // Optional: Debugging settings
      // debug: {
        // How to treat revert (and require) reason strings. Settings are
        // "default", "strip", "debug" and "verboseDebug".
        // "default" does not inject compiler-generated revert strings and keeps user-supplied ones.
        // "strip" removes all revert strings (if possible, i.e. if literals are used) keeping side-effects
        // "debug" injects strings for compiler-generated internal reverts, implemented for ABI encoders V1 and V2 for now.
        // "verboseDebug" even appends further information to user-supplied revert strings (not yet implemented)
        // revertStrings: default,
        // Optional: How much extra debug information to include in comments in the produced EVM
        // assembly and Yul code. Available components are:
        // - `location`: Annotations of the form `@src <index>:<start>:<end>` indicating the
        //    location of the corresponding element in the original Solidity file, where:
        //     - `<index>` is the file index matching the `@use-src` annotation,
        //     - `<start>` is the index of the first byte at that location,
        //     - `<end>` is the index of the first byte after that location.
        // - `snippet`: A single-line code snippet from the location indicated by `@src`.
        //     The snippet is quoted and follows the corresponding `@src` annotation.
        // - `*`: Wildcard value that can be used to request everything.
        // debugInfo: [location, snippet]
      // }
    }
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  mocha: {
    reporter: "hardhat-gas-reporter",
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
    enabled: (process.env.GAS_REPORT) ? true : false
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
