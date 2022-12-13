require('dotenv').config({ path: __dirname.join('/../.env') });
const ethers = require('ethers');
const WhitelistStorage = require('./../build/contracts/WhitelistStorage.json');

const environment = process.argv.slice(2)[1];
console.log(`Using environment: ${environment}`);

const deployedContracts = require(`./../reports/${environment}_contracts.json`);
const whitelistWalletList = require('./whitelist-wallet-list.json');
const endpoint = process.env[`${environment.toUpperCase()}_RPC`];

async function sleep (ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function whitelist () {
  console.log(`Using endpoint ${endpoint}`);
  const provider = new ethers.providers.JsonRpcProvider(endpoint);
  const whitelistStorageAddress = deployedContracts.contracts.WhitelistStorage.evmAddress;
  console.log(`Using ${whitelistStorageAddress} for whitelist storage`);
  const deployerWallet = new ethers.Wallet(process.env.PRIVATE_KEY);
  console.log(`Using deployer wallet: ${deployerWallet.address}`);
  const signerWallet = deployerWallet.connect(provider);
  const whitelistStorageContract = new ethers.Contract(whitelistStorageAddress, WhitelistStorage.abi, provider);

  for (const wallet of whitelistWalletList) {
    console.log(`Whitelisting wallet: ${wallet}`);
    await whitelistStorageContract.connect(signerWallet)
      .whitelistAddress(wallet, {
        gasLimit: 100000,
        gasPrice: 10,
      });
    console.log(`Wallet: ${wallet} whitelisted`);
    await sleep(2000);
  }
}

whitelist();
