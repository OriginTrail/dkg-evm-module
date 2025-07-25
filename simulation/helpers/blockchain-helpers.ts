import { HardhatRuntimeEnvironment } from 'hardhat/types';

import { NETWORK_HUBS } from './simulation-constants';

/**
 * Get the Hub contract address for the current forked network
 */
export async function getHubAddress(
  hre: HardhatRuntimeEnvironment,
): Promise<string> {
  try {
    // Method 1: Check if there are local deployments (for development/testing)
    try {
      const hubDeployment = await hre.deployments.get('Hub');
      if (hubDeployment && hubDeployment.address) {
        console.log(
          `[GET HUB ADDRESS] Using locally deployed Hub: ${hubDeployment.address}`,
        );
        return hubDeployment.address;
      }
    } catch {
      // No local deployment, continue to mainnet detection
    }

    const knownHubAddresses = Object.keys(NETWORK_HUBS);

    for (const hubAddress of knownHubAddresses) {
      try {
        // Check if there's contract code at this address
        const code = await hre.ethers.provider.getCode(hubAddress);
        if (code && code !== '0x') {
          // Try to call the Hub's name() function to verify it's actually a Hub
          const Hub = await hre.ethers.getContractFactory('Hub');
          const hubContract = Hub.attach(hubAddress);

          if ((await hubContract.name()) === 'Hub') {
            return hubAddress;
          }
        }
      } catch {
        // This Hub address doesn't work, try the next one
        continue;
      }
    }

    throw new Error('[GET HUB ADDRESS] No working Hub found');
  } catch (error) {
    throw new Error(`[GET HUB ADDRESS] Failed to get Hub address: ${error}`);
  }
}

export async function getHubContract(hre: HardhatRuntimeEnvironment) {
  const hubAddress = await getHubAddress(hre);
  const Hub = await hre.ethers.getContractFactory('Hub');
  console.log(
    `[GET HUB CONTRACT] Found Hub at: ${hubAddress} for network: ${NETWORK_HUBS[hubAddress as keyof typeof NETWORK_HUBS]}`,
  );
  return Hub.attach(hubAddress);
}

/**
 * Get a deployed contract from the Hub
 */
export async function getDeployedContract(
  hre: HardhatRuntimeEnvironment,
  contractName: string,
) {
  const hubAddress = await getHubAddress(hre);
  const Hub = await hre.ethers.getContractFactory('Hub');

  // Handle special contract name mappings for artifacts
  let artifactName = contractName;
  if (contractName === 'EpochStorageV8') {
    artifactName = 'EpochStorage'; // EpochStorageV8 uses EpochStorage ABI
  }

  const ContractFactory = await hre.ethers.getContractFactory(artifactName);
  const hub = Hub.attach(hubAddress);

  try {
    const contractAddress = await hub.getContractAddress(contractName);
    const deployedContract = ContractFactory.attach(contractAddress);
    console.log(
      `[GET DEPLOYED CONTRACT] Found ${contractName} contract address: ${contractAddress} on Hub: ${hubAddress} for network: ${NETWORK_HUBS[hubAddress as keyof typeof NETWORK_HUBS]}`,
    );
    return deployedContract;
  } catch (error) {
    throw new Error(
      `[GET DEPLOYED CONTRACT] Failed to get ${contractName}: ${error}`,
    );
  }
}

/**
 * Estimate gas cost for a transaction and ensure the account has sufficient funds
 */
export async function ensureSufficientGasFunds(
  hre: HardhatRuntimeEnvironment,
  fromAddress: string,
): Promise<void> {
  try {
    // For simulation, always ensure accounts have generous ETH balance since gas estimation is unreliable
    const currentBalance = await hre.ethers.provider.getBalance(fromAddress);
    const requiredBalance = hre.ethers.parseEther('1.0'); // 1 ETH should cover any transaction

    if (currentBalance < requiredBalance) {
      await hre.network.provider.request({
        method: 'hardhat_setBalance',
        params: [fromAddress, '0x' + requiredBalance.toString(16)],
      });

      console.log(`[GAS ESTIMATION] Set balance to 1.0 ETH for ${fromAddress}`);
    }
  } catch (error) {
    console.error(
      `[GAS ESTIMATION] ❌ Failed to ensure sufficient gas funds: ${error}`,
    );
    throw error;
  }
}

/**
 * Impersonate an account for transaction replay and ensure sufficient gas funds
 */
export async function impersonateAccount(
  hre: HardhatRuntimeEnvironment,
  address: string,
) {
  await hre.network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [address],
  });
}

/**
 * Stop impersonating an account
 */
export async function stopImpersonatingAccount(
  hre: HardhatRuntimeEnvironment,
  address: string,
) {
  await hre.network.provider.request({
    method: 'hardhat_stopImpersonatingAccount',
    params: [address],
  });
}
