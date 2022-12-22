# DKG evm module



### Installation

``` 
npm install
```

### Run local ganache node

``` 
npm run ganache
```
### Create .env file

Create .env file in root directory with the following content:
```
ACCESS_KEY = http://localhost:7545
PRIVATE_KEY = 02b39cac1532bef9dba3e36ec32d3de1e9a88f1dda597d3ac6e2130aed9adc4e
```

**Note:** Private key is publicly available! Don't use the provided private key in production! Only for testing purposes!

### Deploy contracts on blockchain

Update environment use OTP_DEVNET/OTP_TESTNET/OTP_MAINNET
```
OTP_DEVNET_RPC = 
OTP_DEVNET_EVM_PRIVATE_KEY = 
OTP_DEVNET_ACCOUNT_URI_WITH_OTP =
```
Devnet deployment command
``` 
npm run deploy:devnet
```
Testnet deployment command
``` 
npm run deploy:testnet
```
Mainnet deployment command
``` 
npm run deploy:mainnet
```
