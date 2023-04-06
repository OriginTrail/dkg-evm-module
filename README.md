# DKG EVM Module

![License](https://img.shields.io/github/license/OriginTrail/dkg-evm-module)
![GitHub Actions Status](https://img.shields.io/github/actions/workflow/status/OriginTrail/dkg-evm-module/checks.yml)
![solidity - v0.8.16](https://img.shields.io/badge/solidity-v0.8.16-07a7930e?logo=solidity)
[![NPM Package](https://img.shields.io/npm/v/dkg-evm-module)](https://www.npmjs.com/package/dkg-evm-module)

This repository contains the smart contracts for OriginTrail V6, which serves as the core module for the Decentralized Knowledge Graph (DKG). The module handles various aspects, such as DKG Node profile management, Knowledge Asset ownership, consensus mechanisms, and others, in order to ensure the secure and efficient operation of the network. The contracts are written in Solidity and can be deployed on Ethereum and compatible networks.

## Repository Structure

This repository contains the following main components:

- `abi`: Stores the generated ABI files for the smart contracts.
- `contracts`: Contains the Solidity source files for the smart contracts.
- `deploy`: Contains deployment scripts for all contracts with additional helpers for automatic deployment on OriginTrail Parachain.
- `deployments`: Contains JSON files with addresses of the latest deployed contracts on OTP (Alphanet / Devnet / Testnet / Mainnet)
- `scripts`: Includes Hardhat scripts that can be run using the Hardhat CLI for specific purposes, such as deploying contracts, generating accounts, or interacting with the blockchain.
- `tasks`: Contains Hardhat tasks that can be executed through the Hardhat CLI to automate various actions and processes related to the project. These tasks can be helpful for interacting with smart contracts, managing deployments, or running custom scripts as needed.
- `test`: Includes the test files for the smart contracts.
- `utils`: Includes utility functions and files used throughout the repository.

## Prerequisites and Setup

Before running the commands, make sure you have the following prerequisites installed:

- [Node.js](https://nodejs.org/) (version 14.x or higher)
- [npm](https://www.npmjs.com/)
- [slither](https://github.com/crytic/slither) (Optional, needed for static Solidity code analysis)

Clone the repository and install the dependencies:

```sh
git clone https://github.com/OriginTrail/dkg-evm-module.git

cd dkg-evm-module

npm install
```

## NPM Scripts
This project utilizes a variety of NPM scripts to run various tasks and processes. The scripts are defined in the package.json file and are designed to be used with the Hardhat CLI, leveraging Hardhat plugins for additional functionality. Here's a brief description of the scripts:

- `clean`: Removes the cache and artifacts folders generated by Hardhat.
- `compile:size`: Compiles the smart contracts and analyzes the size of the compiled contracts using the hardhat-contract-sizer plugin.
- `compile`: Compiles the smart contracts using the Hardhat CLI.
- `coverage`: Generates a code coverage report for the smart contracts using the solidity-coverage plugin.
- `deploy:localhost`: Deploys the smart contracts to a local network.
- `deploy:otp_alphanet`, `deploy:otp_devnet`, `deploy:otp_testnet`, and `deploy:otp_mainnet`: Deploy the smart contracts to specific networks (alphanet, devnet, testnet, or mainnet).
- `dev`: Runs a local development node with Hardhat and automatically deploys all contracts.
- `export-abi`: Updates ABI files according to the current state of the smart contracts.
- `format:fix`: Automatically fixes code formatting issues for JSON, JavaScript, TypeScript, and Solidity files using Prettier.
- `format`: Checks code formatting for JSON, JavaScript, TypeScript, and Solidity files using Prettier.
- `generate-evm-account`: Generates a new Ethereum account using the scripts/generate_evm_account.ts script.
- `generate-otp-account`: Generates a new OriginTrail account using the scripts/generate_otp_account.ts script.
- `lint:fix`: Automatically fixes linting issues for both Solidity and TypeScript files.
- `lint`: Executes linters for both Solidity and TypeScript files.
- `mint-test-tokens`: Mints test tokens on the local - development network using the scripts/mint_test_tokens.ts script.
- `prepare`: Sets up the Husky Git hooks and generates TypeChain typings for the smart contracts.
- `slither:reentrancy`: Executes the Slither static analysis tool with a focus on reentrancy vulnerabilities in the smart contracts.
- `slither`: Runs the Slither static analysis tool on the smart contracts.
- `test:fulltrace`: Runs the test suite with full stack traces enabled for easier debugging.
- `test:gas:fulltrace`: Executes tests with gas usage reporting and full stack traces enabled.
- `test:gas:trace`: Runs tests with gas usage reporting and stack traces enabled.
- `test:gas`: Runs tests with gas usage reporting enabled, using the hardhat-gas-reporter plugin.
- `test:integration`: Executes only the integration tests.
- `test:unit`: Executes only the unit tests.
- `test`: Execute all tests for the smart contracts.
- `typechain`: Generates TypeChain typings for the smart contracts.
- `test:trace`: Executes tests with stack trace enabled for easier debugging.

These scripts can be run using the `npm run <script-name>` command. For example, to compile the smart contracts, you can run:

```sh
npm run compile
```

## Additional Hardhat tasks
Hardhat has plenty of other useful commands, extended by the installed plugins. Here's a brief description of the most useful tasks:

- `decode`: Decodes encoded ABI data (e.g. input data of transaction).
- `encode_data`: Encodes data for low-level function call (through HubController).

These tasks can be run using the `npx hardhat <task-name>` command. For example, to decode input data, you can run:

```sh
npx hardhat decode --data <bytes-data>
```

## Contracts deployment on parachains

Update environment use OTP_DEVNET/OTP_TESTNET/OTP_MAINNET
```dotenv
RPC_OTP_DEVNET='<https_endpoint>'
EVM_PRIVATE_KEY_OTP_DEVNET='<0x_ethereum_private_key>'
ACCOUNT_WITH_OTP_URI_OTP_DEVNET='<substrate_account_uri>'
```

Devnet deployment command
```sh
npm run deploy:otp_devnet
```
Testnet deployment command
```sh
npm run deploy:otp_testnet
```
Mainnet deployment command
```sh
npm run deploy:otp_mainnet
```

### Redeploy contract on parachain

In order to redeploy desired contract, set `deployed` to `false` in `deployments/<network>_contracts.json`.
