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
import './tasks/low_level_call_data_encoder';
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
    chainId: 2043,
    url: rpc('otp_alphanet'),
    gas: 10_000_000, // Gas limit used for deployments
    gasPrice: 20,
    accounts: accounts('otp_alphanet'),
    saveDeployments: false,
  },
  otp_devnet: {
    chainId: 2160,
    url: rpc('otp_devnet'),
    gas: 10_000_000, // Gas limit used for deployments
    gasPrice: 1_000_000,
    accounts: accounts('otp_devnet'),
    saveDeployments: false,
  },
  otp_testnet: {
    chainId: 20430,
    url: rpc('otp_testnet'),
    gas: 10_000_000, // Gas limit used for deploys
    gasPrice: 20,
    accounts: accounts('otp_testnet'),
    saveDeployments: false,
  },
  otp_mainnet: {
    chainId: 2043,
    url: rpc('otp_mainnet'),
    gas: 10_000_000, // Gas limit used for deploys
    gasPrice: 10,
    accounts: accounts('otp_mainnet'),
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
    'Ownable.sol',
    'ContentAssetErrors.sol',
    'ServiceAgreementErrorsV1.sol',
    'ServiceAgreementErrorsV1U1.sol',
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
