import 'dotenv/config';
import { execSync } from 'child_process';
import * as fs from 'fs';

import { ApiPromise, HttpProvider } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';
import { u8aToHex } from '@polkadot/util';
import * as polkadotCryptoUtils from '@polkadot/util-crypto';
import { KeypairType } from '@polkadot/util-crypto/types';
import { Contract } from 'ethers';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

type AbiEntry = {
  inputs?: Array<{ internalType: string; name: string; type: string }>;
  name?: string;
  outputs?: Array<{ internalType: string; name: string; type: string }>;
  stateMutability?: string;
  type: string;
};

type ContractDeployments = {
  contracts: {
    [contractName: string]: {
      evmAddress: string;
      substrateAddress: string;
      deployed: boolean;
      variables?: {
        [variableName: string]: unknown;
      };
    };
  };
  deployedTimestamp: number;
};

type DeploymentParameters = {
  newContractName: string;
  newContractNameInHub?: string;
  passHubInConstructor?: boolean;
  setContractInHub?: boolean;
  setAssetStorageInHub?: boolean;
};

type EvmWallet = {
  address: string;
  mnemonic: string;
  privateKey: string;
};

type SubstrateWallet = {
  address: string;
  mnemonic: string;
  privateKey: string;
};

export class Helpers {
  hre: HardhatRuntimeEnvironment;
  provider: HttpProvider;
  contractDeployments: ContractDeployments;
  newContracts: Array<Array<string>>;
  newAssetStorageContracts: Array<Array<string>>;
  contractsForReinitialization: Array<string>;
  setParametersEncodedData: Array<string>;
  newHashFunctions: Array<string>;
  newScoreFunctions: Array<string>;

  constructor(hre: HardhatRuntimeEnvironment) {
    this.hre = hre;
    const endpoint = process.env[`RPC_${this.hre.network.name.toUpperCase()}`];
    this.provider = new HttpProvider(endpoint);

    const deploymentsConfig = `./deployments/${this.hre.network.name}_contracts.json`;

    if (fs.existsSync(deploymentsConfig)) {
      this.contractDeployments = JSON.parse(fs.readFileSync(deploymentsConfig).toString());
    } else {
      this.contractDeployments = { contracts: {}, deployedTimestamp: 0 };
    }

    this.newContracts = [];
    this.newAssetStorageContracts = [];
    this.contractsForReinitialization = [];
    this.setParametersEncodedData = [];
    this.newHashFunctions = [];
    this.newScoreFunctions = [];
  }

  public async deploy({
    newContractName,
    newContractNameInHub,
    passHubInConstructor = true,
    setContractInHub = true,
    setAssetStorageInHub = false,
  }: DeploymentParameters): Promise<Contract> {
    const { deployer } = await this.hre.getNamedAccounts();
    console.log('Starting deployment of: ', newContractName);
    try {
      console.log('Fetching sharding table');
      const contractInstance1 = await this.hre.ethers.getContractAt(
        'ShardingTable',
        '0xD8a5a9b31c3C0232E196d518E89Fd8bF83AcAd43',
        deployer,
      );
      console.log('sharding table instance');
      console.log(await contractInstance1.getShardingTable());
    } catch (error) {
      console.log('Error while fetching sharding table');
      console.log(error);
    }
    if (this.isDeployed(newContractName)) {
      console.log('Contract is already deployed');
      const contractInstance = await this.hre.ethers.getContractAt(
        newContractName,
        this.contractDeployments.contracts[newContractName].evmAddress,
        deployer,
      );

      if (this.hasFunction(newContractName, 'initialize')) {
        // TODO: Reinitialize only if any dependency contract was redeployed
        this.contractsForReinitialization.push(contractInstance.address);
      }

      return contractInstance;
    }
    console.log('Contract is not deployed');
    let hubAddress;
    if ('Hub' in this.contractDeployments.contracts) {
      hubAddress = this.contractDeployments.contracts['Hub'].evmAddress;
    } else {
      hubAddress = (await this.hre.deployments.get('Hub')).address;
    }

    let newContract;
    try {
      newContract = await this.hre.deployments.deploy(newContractName, {
        from: deployer,
        args: passHubInConstructor ? [hubAddress] : [],
        log: true,
      });
    } catch (error) {
      if (this.hre.network.name !== 'hardhat') {
        this.saveDeploymentsJson('deployments');
      }
      let message;
      if (error instanceof Error) message = error.message;
      else message = String(error);

      throw Error(message);
    }
    console.log('Contract is redeployed');
    const Hub = await this.hre.ethers.getContractAt('Hub', hubAddress, deployer);
    const hubControllerAddress = await Hub.owner();
    const HubController = await this.hre.ethers.getContractAt('HubController', hubControllerAddress, deployer);

    let tx;
    const nameInHub = newContractNameInHub ? newContractNameInHub : newContractName;
    if (setContractInHub) {
      if (this.hre.network.name === 'hardhat') {
        const rand = Math.random() * 10;
        for (let i = 0; i < rand; i++) {
          tx = await HubController.setContractAddress(`test${i}`, newContract.address);
          await tx.wait();
        }
        tx = await HubController.setContractAddress(nameInHub, newContract.address);
        await tx.wait();
      } else {
        this.newContracts.push([nameInHub, newContract.address]);
      }
    } else if (setAssetStorageInHub) {
      if (this.hre.network.name === 'hardhat') {
        tx = await HubController.setAssetStorageAddress(nameInHub, newContract.address);
        await tx.wait();
      } else {
        this.newAssetStorageContracts.push([nameInHub, newContract.address]);
      }
    }

    if (this.hasFunction(newContractName, 'initialize')) {
      if (this.hre.network.name === 'hardhat') {
        const newContractInterface = new this.hre.ethers.utils.Interface(this.getAbi(newContractName));
        const initializeTx = await HubController.forwardCall(
          newContract.address,
          newContractInterface.encodeFunctionData('initialize'),
        );
        await initializeTx.wait();
      }
      this.contractsForReinitialization.push(newContract.address);
    }

    this.updateDeploymentsJson(newContractName, newContract.address);

    // if (newContractName === 'ShardingTable') {
    //   const contr = await this.hre.ethers.getContractAt(newContractName, newContract.address, deployer);
    //   console.log(await contr.getShardingTable());
    // }

    return await this.hre.ethers.getContractAt(newContractName, newContract.address, deployer);
  }

  public inConfig(contractName: string): boolean {
    return contractName in this.contractDeployments.contracts;
  }

  public isDeployed(contractName: string): boolean {
    if (this.inConfig(contractName)) {
      this.contractDeployments.contracts[contractName].deployed;
      return false;
    } else {
      return false;
    }
  }

  public hasFunction(contractName: string, functionName: string): boolean {
    const contractAbi = this.getAbi(contractName);
    return contractAbi.some((entry) => entry.type === 'function' && entry.name === functionName);
  }

  public getAbi(contractName: string): AbiEntry[] {
    return JSON.parse(fs.readFileSync(`./abi/${contractName}.json`, 'utf-8'));
  }

  public async resetDeploymentsJson() {
    this.contractDeployments = { contracts: {}, deployedTimestamp: 0 };
    await this.hre.network.provider.send('hardhat_reset');
  }

  public updateDeploymentsJson(newContractName: string, newContractAddress: string) {
    const variables = this.contractDeployments.contracts[newContractName]?.variables ?? undefined;

    this.contractDeployments.contracts[newContractName] = {
      evmAddress: newContractAddress,
      substrateAddress: this.convertEvmWallet(newContractAddress),
      deployed: true,
      variables,
    };
  }

  public saveDeploymentsJson(folder: string) {
    fs.writeFileSync(
      `${folder}/${this.hre.network.name}_contracts.json`,
      JSON.stringify(this.contractDeployments, null, 4),
    );
  }

  public async sendOTP(address: string, tokenAmount = 2) {
    const api = await ApiPromise.create({ provider: this.provider, noInitWarn: true });
    const transfer = await api.tx.balances.transfer(
      address,
      Number(this.hre.ethers.utils.parseUnits(`${tokenAmount}`, 12)),
    );

    const keyring = new Keyring({ type: 'sr25519' });
    const accountUri = process.env[`ACCOUNT_WITH_OTP_URI_${this.hre.network.name.toUpperCase()}`];
    if (!accountUri) {
      throw Error('URI for account with OTP is required!');
    }
    const account = keyring.createFromUri(accountUri);

    const txHash = await transfer.signAndSend(account, { nonce: -1 });
    console.log(`2 OTPs sent to contract at address ${address}. Transaction hash: ${txHash.toHuman()}`);
    await this._delay(40000);
  }

  public generateEvmWallet(): EvmWallet {
    const wallet = this.hre.ethers.Wallet.createRandom();

    return {
      address: wallet.address,
      mnemonic: wallet.mnemonic.phrase,
      privateKey: wallet.privateKey,
    };
  }

  public async generateSubstrateWallet(type: KeypairType = 'sr25519', ss58Prefix = 101): Promise<SubstrateWallet> {
    await polkadotCryptoUtils.cryptoWaitReady();
    const keyring = new Keyring({ type: type, ss58Format: ss58Prefix });

    const mnemonic = polkadotCryptoUtils.mnemonicGenerate();
    const mnemonicMini = polkadotCryptoUtils.mnemonicToMiniSecret(mnemonic);
    const substratePrivateKey = u8aToHex(mnemonicMini);
    const substrateAddress = keyring.createFromUri(substratePrivateKey).address;

    return {
      address: substrateAddress,
      mnemonic: mnemonic,
      privateKey: substratePrivateKey,
    };
  }

  public convertEvmWallet(evmAddress: string): string {
    const address = evmAddress.startsWith('0x') ? evmAddress.slice(2) : evmAddress;

    const substrateAddress = execSync(
      `utils/converters/${process.platform}-evm-contract-into-substrate-address ${address}`,
    )
      .toString()
      .replace(/[\r\n]/gm, '');

    return substrateAddress;
  }

  private _delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
