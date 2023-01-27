# DKG evm module

[![solidity - v0.8.16](https://img.shields.io/badge/solidity-v0.8.16-e28d00a7?logo=solidity)](https://github.com/manifoldfinance)

## Commands

### Installation

```sh
npm install
```

### Compile
```shell
npm run compile
```

### Run tests

Run all tests
```sh
npm run test
```

Run specific test file
```sh
npm run test test/filename.test.ts
```

Run tests with gas report
```sh
npm run test:gas
```

Run tests with trace flag
```sh
npm run test:trace
```

### Run local network

```sh
npm run dev
```

### Deploy contracts on parachains

Update environment use OTP_DEVNET/OTP_TESTNET/OTP_MAINNET
```dotenv
RPC_OTP_DEVNET='<https_endpoint>'
EVM_PRIVATE_KEY_OTP_DEVNET='<0x_ethereum_private_key>'
OTP_DEVNET_ACCOUNT_URI_WITH_OTP='<substrate_account_uri>'
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

To redeploy desired contract, set `deployed` to `true` in `deployments/network_contracts.json`.
