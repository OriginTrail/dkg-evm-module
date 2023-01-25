import 'dotenv/config';
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

    const endpoint = process.env[`${this.hre.network.name.toUpperCase()}_RPC`];
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

      if (this.reinitialization) {
        contractInstance.initialize();
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

    const newContract = await this.hre.deployments.deploy(newContractName, {
      from: deployer,
      args: passHubInConstructor ? [hub.address] : [],
      log: true,
    });

    const nameInHub = newContractNameInHub ? newContractNameInHub : newContractName;
    if (setContractInHub) {
      await hub.setContractAddress(nameInHub, newContract.address);
    } else if (setAssetStorageInHub) {
      await hub.setAssetStorageAddress(nameInHub, newContract.address);
    }

    this.reinitialization = true;

    this.contractDeployments.contracts[newContractName] = {
      evmAddress: newContract.address,
      substrateAddress: this.convertEvmWallet(newContract.address),
      deployed: true,
    };

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

  public async sendOTP(address: string, tokenAmount = 2) {
    const api = await ApiPromise.create({ provider: this.provider });
    const transfer = api.tx.balances.transfer(address, this.hre.ethers.utils.parseEther(`${tokenAmount}`));

    const keyring = new Keyring({ type: 'sr25519' });
    const accountUri = process.env[`${this.hre.network.name.toUpperCase()}_ACCOUNT_URI_WITH_OTP`];
    if (!accountUri) {
      throw Error('URI for account with OTP is required!');
    }
    const account = keyring.createFromUri(accountUri);

    await transfer.signAndSend(account, { nonce: -1 });
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

  public convertEvmWallet(evmAddress: string, ss58Prefix = 101): string {
    if (!polkadotCryptoUtils.isEthereumAddress(evmAddress)) {
      throw Error('Invalid EVM address.');
    }

    return polkadotCryptoUtils.evmToAddress(evmAddress, ss58Prefix);
  }

  private _delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
