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
import { extendEnvironment } from 'hardhat/config';
import { lazyObject } from 'hardhat/plugins';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import './tasks/address_converter';
import './tasks/clear_sharding_table';
import './tasks/deploy_test_token';
import './tasks/low_level_call_data_encoder';
import './tasks/mint_test_tokens';
import './tasks/selector_encoder';
import './tasks/send_otp';
import './utils/type-extensions';
import config from './hardhat.node.config';
import { Helpers } from './utils/helpers';
import { accounts, rpc } from './utils/network';

extendEnvironment((hre: HardhatRuntimeEnvironment) => {
  hre.helpers = lazyObject(() => new Helpers(hre));
});

config.networks = {
  ...config.networks,
  otp_alphanet: {
    environment: 'devnet',
    chainId: 2043,
    url: rpc('otp_alphanet'),
    gas: 10_000_000, // Gas limit used for deployments
    gasPrice: 20,
    accounts: accounts('otp_alphanet'),
    saveDeployments: false,
  },
  otp_devnet: {
    environment: 'devnet',
    chainId: 2160,
    url: rpc('otp_devnet'),
    gas: 10_000_000, // Gas limit used for deployments
    gasPrice: 1_000_000,
    accounts: accounts('otp_devnet'),
    saveDeployments: false,
  },
  otp_testnet: {
    environment: 'testnet',
    chainId: 20430,
    url: rpc('otp_testnet'),
    gas: 10_000_000, // Gas limit used for deploys
    gasPrice: 20,
    accounts: accounts('otp_testnet'),
    saveDeployments: false,
  },
  otp_mainnet: {
    environment: 'mainnet',
    chainId: 2043,
    url: rpc('otp_mainnet'),
    gas: 10_000_000, // Gas limit used for deploys
    gasPrice: 100,
    accounts: accounts('otp_mainnet'),
    saveDeployments: false,
  },
  gnosis_chiado_dev: {
    environment: 'devnet',
    chainId: 10200,
    url: rpc('gnosis_chiado_dev'),
    gasPrice: 1_000_000_000,
    accounts: accounts('gnosis_chiado_dev'),
    saveDeployments: false,
  },
  gnosis_chiado_test: {
    environment: 'testnet',
    chainId: 10200,
    url: rpc('gnosis_chiado_test'),
    gasPrice: 1_000_000_000,
    accounts: accounts('gnosis_chiado_test'),
    saveDeployments: false,
  },
  gnosis_mainnet: {
    environment: 'mainnet',
    chainId: 100,
    url: rpc('gnosis_mainnet'),
    accounts: accounts('gnosis_mainnet'),
    saveDeployments: false,
  },
  base_sepolia_dev: {
    environment: 'devnet',
    chainId: 84532,
    url: rpc('base_sepolia_dev'),
    gasPrice: 1_000_000_000,
    accounts: accounts('base_sepolia_dev'),
    saveDeployments: false,
  },
  base_sepolia_test: {
    environment: 'testnet',
    chainId: 84532,
    url: rpc('base_sepolia_test'),
    gasPrice: 1_000_000_000,
    accounts: accounts('base_sepolia_test'),
    saveDeployments: false,
  },
  base_mainnet: {
    environment: 'mainnet',
    chainId: 8453,
    url: rpc('base_mainnet'),
    accounts: accounts('base_mainnet'),
    saveDeployments: false,
  },
};

config.typechain = {
  outDir: 'typechain',
  target: 'ethers-v5',
};

config.mocha = {
  reporterOptions: {
    excludeContracts: [],
  },
  timeout: 100000000,
};

config.abiExporter = {
  path: './abi',
  runOnCompile: true,
  clear: true,
  flat: true,
  only: [],
  except: [
    'AccessControl.sol',
    'ERC20.sol',
    'ERC20Burnable.sol',
    'ERC165.sol',
    'ERC721.sol',
    'GeneralErrors.sol',
    'IERC20Metadata.sol',
    'IERC721.sol',
    'IERC721Metadata.sol',
    'IERC721Receiver.sol',
    'IERC734Extended.sol',
    'IERC4906.sol',
    'Ownable.sol',
    'CommitManagerErrorsV2.sol',
    'ContentAssetErrors.sol',
    'ParanetErrors.sol',
    'ProfileErrors.sol',
    'ServiceAgreementErrorsV1.sol',
    'ServiceAgreementErrorsV1U1.sol',
    'ServiceAgreementErrorsV2.sol',
    'ShardingTableErrors.sol',
    'StakingErrors.sol',
    'TokenErrors.sol',
    'Shares.sol',
  ],
  spacing: 2,
  format: 'json',
};

config.gasReporter = {
  enabled: process.env.GAS_REPORT ? true : false,
};

config.contractSizer = {
  alphaSort: true,
  runOnCompile: false,
  disambiguatePaths: false,
  strict: false,
  only: [],
  except: [],
};

export default config;
