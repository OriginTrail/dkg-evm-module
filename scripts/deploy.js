require('dotenv').config({ path: `${__dirname}/../.env` });
const { ApiPromise, HttpProvider } = require('@polkadot/api');
const { Keyring } = require("@polkadot/keyring");
const {execSync} = require('child_process')
const fs = require("fs");

const CONTRACTS_REQUIRED_MAPPING = [
    'ServiceAgreementStorageV1',
    'StakingStorage',
    'ProfileStorage'
]

const environment = process.argv.slice(2)[1];
console.log(`Using environment: ${environment}`);
const filePath = `reports/${environment}_contracts.json`;
let deployedContracts;
const INITIAL_TOKEN_AMOUNT = 2 * 1e12;
let api;

class Deployer{

    async start() {
        try {
            try {
                await this.deploy();
            } catch (error) {
                console.log(`Error while deploying contracts, will retry again`);
                await this.deploy();
            }
            deployedContracts = require(`./../reports/${environment}_contracts.json`);
            console.log('Contracts deployed');
            await this.mapNewContracts();
        } finally {
            fs.writeFileSync(filePath, JSON.stringify(deployedContracts, null, 4));
        }
    }

    async deploy() {

        console.log(`Executing npm deploy command`);
        execSync(`npm run truffle_deploy:${environment}`,{stdio: 'inherit'});
        deployedContracts = require(`./../reports/${environment}_contracts.json`);
        await this.validateDeployedContracts(deployedContracts);
        return deployedContracts;

    }

    async mapNewContracts() {
        await this.initializeParachainRPC();
        for (const name in deployedContracts.contracts) {
            const contract = deployedContracts.contracts[name];
            if (CONTRACTS_REQUIRED_MAPPING.includes(name)) {
                contract.substrateAddress = this.createSubstrateAddress(contract.evmAddress);
                // send tokens to substrate address
                if (await this.shouldSendTokens(contract.substrateAddress)) {
                    await this.sendTokensToSubstrateAddress(contract.substrateAddress);
                    await this.validateOTPTransfer(contract.substrateAddress)
                } else {
                    console.log(`Skipping funding for address: ${contract.substrateAddress}`);
                }

            }
        }
        return deployedContracts;
    }

    async validateDeployedContracts(deployedContracts) {
        // validate that we have deployed all contracts
        // validate all contracts are set in hub properly
        // are all contracts connected correctly
    }

    async shouldSendTokens(address) {
        const addressBalance = (await api.query.system.account(address)).data.free;
        return addressBalance.toNumber() === 0;
    }

    async validateOTPTransfer(address) {
        const addressBalance = (await api.query.system.account(address)).data.free;
        if (addressBalance.toNumber() < INITIAL_TOKEN_AMOUNT) {
            throw Error(`Validation failed for otp transfer for address: ${address}. Account balance: ${addressBalance.toNumber()}, required >= ${INITIAL_TOKEN_AMOUNT}`)
        }
        console.log(`Balance for address: ${address} is ${addressBalance.toNumber()}`)
    }

    createSubstrateAddress(evmAddress) {
        let address = evmAddress.startsWith('0x')? evmAddress.slice(2): evmAddress;
        const substrateAddress = execSync(`scripts/evm-contract-into-substrate-address ${address}`).toString().replace(/[\r\n]/gm, '');;
        console.log(`Substrate address is ${substrateAddress} for evm address: ${evmAddress}`);
        return substrateAddress;
    }

    async sendTokensToSubstrateAddress(address) {
        const transfer = api.tx.balances.transfer(address, INITIAL_TOKEN_AMOUNT);

        const keyring = new Keyring({ type: "sr25519" });
        const account = keyring.createFromUri(process.env.ACCOUNT_URI_WITH_OTP);

        await transfer.signAndSend(account, {nonce: -1});
        console.log('Waiting for 15 sec until transfer is completed');
        await this.sleep(15000);
    }

    async initializeParachainRPC() {
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

    sleep(ms) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }
}

const deployer = new Deployer();
deployer.start();



// transfer ownership after deployment
