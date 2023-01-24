import 'dotenv/config';
import { ApiPromise, HttpProvider } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';
import { u8aToHex } from '@polkadot/util';
import * as polkadotCryptoUtils from '@polkadot/util-crypto';
import { KeypairType } from '@polkadot/util-crypto/types';
import { Contract } from 'ethers';
import { DeployResult } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import devnet_deployments from '../deployments/otp_devnet_contracts.json';
import mainnet_deployments from '../deployments/otp_mainnet_contracts.json';
import testnet_deployments from '../deployments/otp_testnet_contracts.json';

type ContractDeployments = {
  otp_devnet: typeof devnet_deployments;
  otp_testnet: typeof testnet_deployments;
  otp_mainnet: typeof mainnet_deployments;
};

const contract_deployments: ContractDeployments = {
  otp_devnet: devnet_deployments,
  otp_testnet: testnet_deployments,
  otp_mainnet: mainnet_deployments,
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
  reinitialization: boolean;

  constructor(hre: HardhatRuntimeEnvironment) {
    this.hre = hre;

    const endpoint = process.env[`${this.hre.network.name.toUpperCase()}_RPC`];
    this.provider = new HttpProvider(endpoint);

    this.reinitialization = false;
  }

  public async deploy({
    newContractName,
    newContractNameInHub,
    passHubInConstructor = true,
    setContractInHub = true,
    setAssetStorageInHub = false,
  }: DeploymentParameters): Promise<DeployResult | Contract> {
    const nameInHub = newContractNameInHub ? newContractNameInHub : newContractName;
    const networkName = this.hre.network.name;

    const { deployer } = await this.hre.getNamedAccounts();

    if (networkName in contract_deployments) {
      const deployedContracts = contract_deployments[networkName as keyof ContractDeployments].contracts;
      const contract = deployedContracts[nameInHub as keyof typeof deployedContracts];

      if (contract.deployed && !this.reinitialization) {
        this.reinitialization = true;
        const contractFactory = this.hre.ethers.getContractFactory(nameInHub, deployer);
        return (await contractFactory).attach(contract.evmAddress);
      } else if (contract.deployed && this.reinitialization) {
        const contractFactory = this.hre.ethers.getContractFactory(nameInHub, deployer);
        const contractInstance = (await contractFactory).attach(contract.evmAddress);
        await contractInstance.initialize();
        return contractInstance;
      }
    }

    const hub = await this.hre.deployments.get('Hub');

    const newContract = await this.hre.deployments.deploy(newContractName, {
      from: deployer,
      args: passHubInConstructor ? [hub.address] : [],
      log: true,
    });

    if (setContractInHub) {
      await this.hre.deployments.execute(
        'Hub',
        { from: deployer, log: true },
        'setContractAddress',
        nameInHub,
        newContract.address,
      );
    } else if (setAssetStorageInHub) {
      await this.hre.deployments.execute(
        'Hub',
        { from: deployer, log: true },
        'setAssetStorageAddress',
        nameInHub,
        newContract.address,
      );
    }

    return newContract;
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
