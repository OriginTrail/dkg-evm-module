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
  reinitialization: boolean;

  constructor(hre: HardhatRuntimeEnvironment) {
    this.hre = hre;
    const endpoint = process.env[`RPC_${this.hre.network.name.toUpperCase()}`];
    this.provider = new HttpProvider(endpoint);

    const deploymentsConfig = `deployments/${this.hre.network.name}_contracts.json`;

    if (fs.existsSync(deploymentsConfig)) {
      this.contractDeployments = JSON.parse(fs.readFileSync(deploymentsConfig).toString());
    } else {
      this.contractDeployments = { contracts: {}, deployedTimestamp: 0 };
    }

    this.reinitialization = false;
  }

  public async deploy({
    newContractName,
    newContractNameInHub,
    passHubInConstructor = true,
    setContractInHub = true,
    setAssetStorageInHub = false,
  }: DeploymentParameters): Promise<Contract> {
    const { deployer } = await this.hre.getNamedAccounts();

    if (this.isDeployed(newContractName)) {
      const contractInstance = await this.hre.ethers.getContractAt(
        newContractName,
        this.contractDeployments.contracts[newContractName].evmAddress,
        deployer,
      );

      // TODO: Implement check if specific contract should be reinitialized
      if (this.reinitialization && contractInstance.initialize !== undefined) {
        const reinitializationTx = await contractInstance.initialize();
        await reinitializationTx.wait();
        console.log(`${newContractName} contract reinitialized.`);
      }

      return contractInstance;
    }

    let hubAddress;
    if ('Hub' in this.contractDeployments.contracts) {
      hubAddress = this.contractDeployments.contracts['Hub'].evmAddress;
    } else {
      hubAddress = (await this.hre.deployments.get('Hub')).address;
    }

    const hub = await this.hre.ethers.getContractAt('Hub', hubAddress, deployer);

    let newContract;
    try {
      newContract = await this.hre.deployments.deploy(newContractName, {
        from: deployer,
        args: passHubInConstructor ? [hub.address] : [],
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

    let tx;
    const nameInHub = newContractNameInHub ? newContractNameInHub : newContractName;
    if (setContractInHub) {
      tx = await hub.setContractAddress(nameInHub, newContract.address);
      await tx.wait();
    } else if (setAssetStorageInHub) {
      tx = await hub.setAssetStorageAddress(nameInHub, newContract.address);
      await tx.wait();
    }

    this.reinitialization = true;

    if (this.hre.network.name !== 'hardhat') {
      this.updateDeploymentsJson(newContractName, newContract?.address);
    }

    return await this.hre.ethers.getContractAt(newContractName, newContract.address, deployer);
  }

  public inConfig(contractName: string): boolean {
    return contractName in this.contractDeployments.contracts;
  }

  public isDeployed(contractName: string): boolean {
    if (this.inConfig(contractName)) {
      return this.contractDeployments.contracts[contractName].deployed;
    } else {
      return false;
    }
  }

  public updateDeploymentsJson(newContractName: string, newContractAddress: string) {
    this.contractDeployments.contracts[newContractName] = {
      evmAddress: newContractAddress,
      substrateAddress: this.convertEvmWallet(newContractAddress),
      deployed: true,
    };
  }

  public saveDeploymentsJson(folder: string) {
    fs.writeFileSync(
      `${folder}/${this.hre.network.name}_contracts.json`,
      JSON.stringify(this.hre.helpers.contractDeployments, null, 4),
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
