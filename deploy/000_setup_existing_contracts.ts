import * as fs from 'fs';

import * as helpers from '@nomicfoundation/hardhat-network-helpers';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { NETWORK_HUBS } from '../constants/simulation-constants';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  // Workaround for hardfork issue on forked networks: mine a block to initialize hardfork history
  await helpers.mine();

  // Detect which chain we're forking by trying to connect to known Hub addresses
  let hubAddress: string;
  let chainName: string;
  let hubContract: any; // eslint-disable-line @typescript-eslint/no-explicit-any

  console.log(
    '[000 DEPLOYMENT] Detecting forked chain by checking Hub addresses...',
  );

  for (const [address, chain] of Object.entries(NETWORK_HUBS)) {
    try {
      const testHub = await hre.ethers.getContractAt('Hub', address);
      const hubName = await testHub.name();
      if (hubName === 'Hub') {
        hubAddress = address;
        chainName = chain;
        hubContract = testHub;
        console.log(
          `[000 DEPLOYMENT] Found active Hub at ${address} for ${chain}`,
        );
        break;
      }
    } catch {
      continue;
    }
  }

  if (!hubAddress! || !chainName! || !hubContract!) {
    throw new Error(
      '[000 DEPLOYMENT] Could not detect which chain is being forked. No known Hub addresses responded.',
    );
  }

  // Get all contracts registered in the Hub
  console.log('[000 DEPLOYMENT] Fetching all contracts from Hub...');
  const hubContracts = await hubContract.getAllContracts();
  const hubAssetStorages = await hubContract.getAllAssetStorages();

  console.log(
    `[000 DEPLOYMENT] Found ${hubContracts.length} contracts and ${hubAssetStorages.length} asset storages in Hub`,
  );

  // Load deployment JSON for cross-verification
  const contractsFilePath = `./deployments/${chainName}_contracts.json`;
  let deploymentContracts = {};

  if (fs.existsSync(contractsFilePath)) {
    const existingContractsData = JSON.parse(
      fs.readFileSync(contractsFilePath, 'utf-8'),
    );
    deploymentContracts = existingContractsData.contracts;
    console.log(
      `[000 DEPLOYMENT] Loaded ${Object.keys(deploymentContracts).length} contracts from ${contractsFilePath} for verification`,
    );
  } else {
    console.log(
      `⚠️  Deployment file not found: ${contractsFilePath} (will skip verification)`,
    );
  }

  // Combine all contracts from Hub
  const allHubContracts = [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...hubContracts.map((c: any) => ({
      name: c.name,
      address: c.addr,
      type: 'contract',
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...hubAssetStorages.map((c: any) => ({
      name: c.name,
      address: c.addr,
      type: 'assetStorage',
    })),
  ];

  console.log(
    `[000 DEPLOYMENT] Registering ${allHubContracts.length} contracts from Hub on ${chainName}...`,
  );

  // Register each contract from Hub with both hardhat-deploy and helpers system
  for (const hubContract of allHubContracts) {
    const contractName = hubContract.name;
    const contractAddress = hubContract.address;

    try {
      // Handle special contract name mappings
      let abiFileName = contractName;
      if (contractName === 'EpochStorageV8') {
        abiFileName = 'EpochStorage'; // EpochStorageV8 uses EpochStorage ABI
      }

      // Load ABI for the contract
      const abiPath = `./abi/${abiFileName}.json`;
      if (!fs.existsSync(abiPath)) {
        console.log(
          `[000 DEPLOYMENT]   ⚠️  ${contractName}: ABI file not found (${abiPath}), skipping`,
        );
        continue;
      }

      const abi = JSON.parse(fs.readFileSync(abiPath, 'utf-8'));

      // Register with hardhat-deploy registry
      await hre.deployments.save(contractName, {
        address: contractAddress,
        abi: abi,
        bytecode: '0x', // Not needed since we're not deploying
        deployedBytecode: '0x', // Not needed since we're not deploying
      });

      // Cross-check with deployment JSON if available
      // Handle special contract name mappings for verification
      let verificationName = contractName;
      if (contractName === 'EpochStorageV8') {
        // EpochStorageV8 should be verified against EpochStorage in JSON, but that doesn't exist in mainnet
        // So keep the original name for verification
        verificationName = contractName;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const deploymentContract = (deploymentContracts as any)[verificationName];
      let verificationStatus = '';
      if (deploymentContract) {
        // Compare addresses case-insensitively
        const hubAddress = contractAddress.toLowerCase();
        const jsonAddress = deploymentContract.evmAddress.toLowerCase();

        if (hubAddress === jsonAddress) {
          verificationStatus = ' ✅';
        } else {
          // Check if this is an expected difference
          const expectedDifferences = [
            'ParametersStorage',
            'Ask',
            'Staking',
            'Profile',
            'KnowledgeCollection',
          ];

          if (expectedDifferences.includes(contractName)) {
            verificationStatus = ` ⚠️ (JSON: ${deploymentContract.evmAddress} - Expected V8.1 upgrade)`;
          } else {
            verificationStatus = ` ⚠️ (JSON: ${deploymentContract.evmAddress})`;
          }
        }
      }

      // Also register with helpers system so it appears in simulation_contracts.json
      hre.helpers.contractDeployments.contracts[contractName] = {
        evmAddress: contractAddress,
        version: deploymentContract?.version || '1.0.0',
        gitBranch:
          deploymentContract?.gitBranch ||
          'feature/historical-rewards-simulation-script',
        gitCommitHash: deploymentContract?.gitCommitHash || 'forked-mainnet',
        deploymentBlock: deploymentContract?.deploymentBlock,
        deploymentTimestamp: Date.now(),
        deployed: true,
      };

      console.log(
        `[000 DEPLOYMENT]   ✅ ${contractName}: ${contractAddress}${verificationStatus}`,
      );
    } catch (error) {
      console.log(
        `[000 DEPLOYMENT]   ⚠️  ${contractName}: Failed to register (${error instanceof Error ? error.message : 'Unknown error'})`,
      );
    }
  }

  console.log(
    '[000 DEPLOYMENT] All Hub contracts registered with hardhat-deploy',
  );

  // Explicitly register the Hub contract itself too
  try {
    const hubAbi = JSON.parse(fs.readFileSync('./abi/Hub.json', 'utf-8'));
    await hre.deployments.save('Hub', {
      address: hubAddress,
      abi: hubAbi,
      bytecode: '0x',
      deployedBytecode: '0x',
    });
    console.log(
      `[000 DEPLOYMENT] Hub contract explicitly registered: ${hubAddress}`,
    );
  } catch (error) {
    console.log(
      `[000 DEPLOYMENT] ⚠️  Failed to explicitly register Hub: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }

  // Save the updated contracts to simulation_contracts.json
  await hre.helpers.saveDeploymentsJson('deployments');

  console.log(
    '[000 DEPLOYMENT] Hub contracts saved to simulation_contracts.json',
  );
};

export default func;
func.tags = ['Hub'];
func.dependencies = [];
