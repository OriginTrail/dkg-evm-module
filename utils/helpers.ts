/* eslint-disable @typescript-eslint/no-explicit-any */
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
      substrateAddress?: string;
      version: string;
      gitBranch: string;
      gitCommitHash: string;
      deploymentTimestamp: number;
      deployed: boolean;
    };
  };
};

type DeploymentParameters = {
  newContractName: string;
  newContractNameInHub?: string;
  passHubInConstructor?: boolean;
  setContractInHub?: boolean;
  setAssetStorageInHub?: boolean;
  additionalArgs?: Array<unknown>;
  deterministicDeployment?: boolean;
};

type ContractParameter = {
  getterArgs?: any[];
  desiredValue?: any[];
  setter?: string;
  setterArgs: any[];
};

type ContractParametersConfig = {
  [parameter: string]: ContractParameter | string | ContractParameter[];
};

type EnvironmentParametersConfig = {
  [contractName: string]: ContractParametersConfig;
};

type ParametersConfig = {
  [environment: string]: EnvironmentParametersConfig;
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
  repositoryPath: string;
  contractDeployments: ContractDeployments;
  parametersConfig: ParametersConfig;
  newContracts: Array<Array<string>>;
  newAssetStorageContracts: Array<Array<string>>;
  contractsForReinitialization: Array<string>;
  setParametersEncodedData: Array<[string, Array<string>]>;
  newHashFunctions: Array<string>;
  newScoreFunctions: Array<string>;

  constructor(hre: HardhatRuntimeEnvironment) {
    this.hre = hre;
    const endpoint = process.env[`RPC_${this.hre.network.name.toUpperCase()}`];
    this.provider = new HttpProvider(endpoint);

    this.repositoryPath = this._getGitRepositoryPath();

    const deploymentsConfig = `./deployments/${this.hre.network.name}_contracts.json`;

    if (fs.existsSync(deploymentsConfig)) {
      this.contractDeployments = JSON.parse(fs.readFileSync(deploymentsConfig).toString());
    } else {
      this.contractDeployments = { contracts: {} };
    }

    const parametersConfig = './deployments/parameters.json';

    if (fs.existsSync(parametersConfig)) {
      this.parametersConfig = JSON.parse(fs.readFileSync(parametersConfig).toString());
    } else {
      this.parametersConfig = {
        development: {},
        devnet: {},
        testnet: {},
        mainnet: {},
      };
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
    newContractNameInHub = undefined,
    passHubInConstructor = true,
    setContractInHub = true,
    setAssetStorageInHub = false,
    additionalArgs = [],
    deterministicDeployment = false,
  }: DeploymentParameters): Promise<Contract> {
    const { deployer } = await this.hre.getNamedAccounts();

    const nameInHub = newContractNameInHub ? newContractNameInHub : newContractName;

    if (this.isDeployed(nameInHub)) {
      const contractInstance = await this.hre.ethers.getContractAt(
        nameInHub,
        this.contractDeployments.contracts[nameInHub].evmAddress,
        deployer,
      );

      if (this.hasFunction(nameInHub, 'initialize')) {
        // TODO: Reinitialize only if any dependency contract was redeployed
        this.contractsForReinitialization.push(contractInstance.address);
      }

      return contractInstance;
    }

    let hubAddress;
    if ('Hub' in this.contractDeployments.contracts) {
      hubAddress = this.contractDeployments.contracts['Hub'].evmAddress;
    } else {
      hubAddress = (await this.hre.deployments.get('Hub')).address;
    }

    let newContract;
    try {
      newContract = await this.hre.deployments.deploy(nameInHub, {
        contract: newContractName,
        from: deployer,
        args: passHubInConstructor ? [hubAddress, ...additionalArgs] : additionalArgs,
        deterministicDeployment,
        log: true,
      });
    } catch (error) {
      if (this.hre.network.config.environment !== 'development') {
        this.saveDeploymentsJson('deployments');
      }
      let message;
      if (error instanceof Error) message = error.message;
      else message = String(error);

      throw Error(message);
    }

    const Hub = await this.hre.ethers.getContractAt('Hub', hubAddress, deployer);
    const hubControllerAddress = await Hub.owner();
    const HubController = await this.hre.ethers.getContractAt('HubController', hubControllerAddress, deployer);

    let tx;
    if (setContractInHub) {
      if (this.hre.network.config.environment === 'development') {
        tx = await HubController.setContractAddress(nameInHub, newContract.address);
        await tx.wait();
      } else {
        this.newContracts.push([nameInHub, newContract.address]);
      }
    } else if (setAssetStorageInHub) {
      if (this.hre.network.config.environment === 'development') {
        tx = await HubController.setAssetStorageAddress(nameInHub, newContract.address);
        await tx.wait();
      } else {
        this.newAssetStorageContracts.push([nameInHub, newContract.address]);
      }
    }

    if (this.hasFunction(nameInHub, 'initialize')) {
      if ((setContractInHub || setAssetStorageInHub) && this.hre.network.config.environment === 'development') {
        const newContractInterface = new this.hre.ethers.utils.Interface(this.getAbi(nameInHub));
        const initializeTx = await HubController.forwardCall(
          newContract.address,
          newContractInterface.encodeFunctionData('initialize'),
        );
        await initializeTx.wait();
      }
      this.contractsForReinitialization.push(newContract.address);
    }

    await this.updateDeploymentsJson(nameInHub, newContract.address);

    return await this.hre.ethers.getContractAt(newContractName, newContract.address, deployer);
  }

  public async updateContractParameters(contractName: string, contract: Contract) {
    const parameters =
      this.parametersConfig[this.hre.network.config.environment as keyof ParametersConfig]?.[contractName];
    if (!parameters) {
      return;
    }

    const encodedData: [string, string[]] = [contractName, []];
    for (const [getterName, paramValue] of Object.entries(parameters)) {
      const values = Array.isArray(paramValue) ? paramValue : [paramValue];

      for (const value of values) {
        let getterArgs = [];
        let desiredValue;
        let setterName;
        let setterArgs;

        if (value instanceof Object) {
          getterArgs = value.getterArgs ? value.getterArgs : [];
          desiredValue = value.setterArgs.length === 1 ? value.setterArgs[0] : value.desiredValue;
          setterName = value.setter ? value.setter : `set${getterName.charAt(0).toUpperCase() + getterName.slice(1)}`;
          setterArgs = value.setterArgs;
        } else {
          desiredValue = value;
          setterName = `set${getterName.charAt(0).toUpperCase() + getterName.slice(1)}`;
          setterArgs = [value];
        }

        if (getterName in contract.functions) {
          const currentValue = await contract[getterName](...getterArgs);

          if (currentValue.toString() !== desiredValue.toString()) {
            console.log(
              `Parameter '${getterName}' for ${contractName} in the contract isn't the same as define in config. Blockchain: ${currentValue}. Config: ${desiredValue}.`,
            );
            if (setterName in contract.functions) {
              const encodedFunctionData = contract.interface.encodeFunctionData(setterName, setterArgs);

              if (this.hre.network.config.environment === 'development') {
                console.log(`[${contractName}] Setting parameter '${getterName}' value to be ${desiredValue}.`);

                const { deployer } = await this.hre.getNamedAccounts();

                const targetContractAddress = this.contractDeployments.contracts[contractName].evmAddress;
                const hubControllerAddress = this.contractDeployments.contracts['HubController'].evmAddress;
                const HubController = await this.hre.ethers.getContractAt(
                  'HubController',
                  hubControllerAddress,
                  deployer,
                );

                const tx = await HubController.forwardCall(targetContractAddress, encodedFunctionData);
                await tx.wait();
              } else {
                console.log(
                  `[${contractName}] Adding parameter '${getterName}' value to be set to ${desiredValue} using HubController.`,
                );

                encodedData[1].push(encodedFunctionData);
              }
            } else {
              throw Error(`Setter '${setterName}' doesn't exist in the contract '${contractName}'.`);
            }
          }
        } else {
          throw Error(`Parameter '${getterName}' doesn't exist in the contract '${contractName}'.`);
        }

        if (encodedData[1].length !== 0) {
          this.setParametersEncodedData.push(encodedData);
        }
      }
    }
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

  public hasFunction(contractName: string, functionName: string): boolean {
    const contractAbi = this.getAbi(contractName);
    return contractAbi.some((entry) => entry.type === 'function' && entry.name === functionName);
  }

  public getAbi(contractName: string): AbiEntry[] {
    return JSON.parse(fs.readFileSync(`./abi/${contractName}.json`, 'utf-8'));
  }

  public resetDeploymentsJson() {
    this.contractDeployments = { contracts: {} };
  }

  public async updateDeploymentsJson(newContractName: string, newContractAddress: string) {
    const contractABI = this.getAbi(newContractName);
    const isVersionedContract = contractABI.some(
      (abiEntry) => abiEntry.type === 'function' && abiEntry.name === 'version',
    );

    let contractVersion;

    if (isVersionedContract) {
      const VersionedContract = await this.hre.ethers.getContractAt(newContractName, newContractAddress);
      contractVersion = await VersionedContract.version();
    } else {
      contractVersion = null;
    }

    this.contractDeployments.contracts[newContractName] = {
      evmAddress: newContractAddress,
      substrateAddress: this.hre.network.name.startsWith('otp') ? this.convertEvmWallet(newContractAddress) : undefined,
      version: contractVersion,
      gitBranch: this.getCurrentGitBranch(),
      gitCommitHash: this.getCurrentGitCommitHash(),
      deploymentTimestamp: Date.now(),
      deployed: true,
    };
  }

  public saveDeploymentsJson(folder: string) {
    fs.writeFileSync(
      `${folder}/${this.hre.network.name}_contracts.json`,
      JSON.stringify(this.contractDeployments, null, 4),
    );
  }

  public async sendOTP(address: string | undefined, tokenAmount = 2) {
    if (address === undefined) {
      throw Error('Address cannot be undefined!');
    }

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

  public getCurrentGitCommitHash(): string {
    return this._executeGitCommandSync('git rev-parse HEAD');
  }

  public getCurrentGitBranch(): string {
    return this._executeGitCommandSync('git rev-parse --abbrev-ref HEAD');
  }

  private _delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private _executeGitCommandSync(command: string): string {
    try {
      const stdout = execSync(command, { cwd: this.repositoryPath });
      return stdout.toString().trim();
    } catch (error) {
      throw new Error(`exec error: ${error}`);
    }
  }

  private _getGitRepositoryPath(): string {
    try {
      const stdout = execSync('git rev-parse --show-toplevel');
      return stdout.toString().trim();
    } catch (error) {
      throw new Error(`Could not determine the repository path: ${error}`);
    }
  }
}
