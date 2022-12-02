require('dotenv').config({ path: `${__dirname}/../.env` });
const { ApiPromise, HttpProvider } = require('@polkadot/api');
const { Keyring } = require("@polkadot/keyring");
const {execSync} = require('child_process')

const CONTRACTS_REQUIRED_MAPPING = [
    'ServiceAgreementStorageV1',
    'StakingStorage'
]

const environment = process.argv.slice(2)[1];
console.log(`Using environment: ${environment}`);

const INITIAL_TOKEN_AMOUNT = 2 * 1e12;
let api;

async function deploy() {
// # npm run truffle_deploy:otp_devnet
    console.log(`Executing npm deploy command`);
    execSync(`npm run truffle_deploy:${environment}`,{stdio: 'inherit'});
    console.log(`Contracts deployed`);
    const deployedContracts = require(`./../reports/${environment}_constracts.json`);
    await validateDeployedContracts(deployedContracts);
    for (const contract in deployedContracts.contracts) {
        if (CONTRACTS_REQUIRED_MAPPING.includes(contract.name)) {
            contract.substrateAddress = createSubstrateAddress(contract.evmAddress);
            // send tokens to substrate address
            await sendTokensToSubstrateAddress(contract.substrateAddress);
            await validateOTPTransfer(contract.substrateAddress)
        }
    }

}

async function validateDeployedContracts(deployedContracts) {
    // validate that we have deployed all contracts
    // validate all contracts are set in hub properly
}

async function validateOTPTransfer(address) {
    const addressBalance = (await api.query.system.account(address)).data.free;
    if (addressBalance < INITIAL_TOKEN_AMOUNT) {
        throw Error(`Validation failed for otp transfer for address: ${address}. Account balance: ${addressBalance}, required >= ${INITIAL_TOKEN_AMOUNT}`)
    }
}

function createSubstrateAddress(evmAddress) {
    let address = evmAddress.startsWith('0x')? evmAddress.slice(2): evmAddress;
    const substrateAddress = execSync(`./evm-contract-into-substrate-address ${address}`).toString();
    console.log(`Substrate address is ${substrateAddress} for evm address: ${evmAddress}`);
    return substrateAddress;
}

async function sendTokensToSubstrateAddress(address) {

    const transfer = api.tx.balances.transfer(address, INITIAL_TOKEN_AMOUNT);

    const keyring = new Keyring({ type: "sr25519" });
    const account = keyring.createFromUri(process.env.ACCOUNT_URI_WITH_OTP);

    await transfer.signAndSend(account);

}

async function initializeParachainRPC() {
    const endpoint = process.env[`${environment.toUpperCase()}_RPC`];
    console.log(`Using parachain rpc endpoint ${endpoint}`);
    const provider = new HttpProvider(endpoint);

    api = await ApiPromise.create({ provider });

    const [chain, nodeName, nodeVersion] = await Promise.all([
        api.rpc.system.chain(),
        api.rpc.system.name(),
        api.rpc.system.version()
    ]);

    console.log(`You are connected to chain ${chain} using ${nodeName} v${nodeVersion}`);
}

initializeParachainRPC().then(r=>{
    deploy()
        .then(r => console.log(`Deploying script completed with result: ${r}`))
        .catch(error => console.log(`Deploying script completed with error: ${error}`));
})
