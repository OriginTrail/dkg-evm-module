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
  const ContractFactory = await hre.ethers.getContractFactory(contractName);
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
  contract: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  functionName: string,
  args: any[], // eslint-disable-line @typescript-eslint/no-explicit-any
  fromAddress: string,
): Promise<void> {
  try {
    // Get the impersonated signer for gas estimation
    const signer = await hre.ethers.getSigner(fromAddress);
    const contractWithSigner = contract.connect(signer);

    // Estimate gas for the specific transaction
    const estimatedGas = await contractWithSigner[functionName].estimateGas(
      ...args,
    );

    // Get current gas price (or use a reasonable default)
    const gasPrice =
      (await hre.ethers.provider.getFeeData()).gasPrice ||
      hre.ethers.parseUnits('20', 'gwei');

    // Calculate total gas cost with a 50% safety margin
    const estimatedGasCost = estimatedGas * gasPrice;
    const gasCostWithMargin = (BigInt(estimatedGasCost) * 150n) / 100n; // 50% safety margin

    // Check current balance
    const currentBalance = await hre.ethers.provider.getBalance(fromAddress);

    // Only add funds if current balance is insufficient for this transaction
    if (currentBalance < gasCostWithMargin) {
      const fundsNeeded = gasCostWithMargin - currentBalance;
      const newBalance = currentBalance + fundsNeeded;

      await hre.network.provider.request({
        method: 'hardhat_setBalance',
        params: [fromAddress, '0x' + newBalance.toString(16)],
      });

      console.log(
        `[GAS ESTIMATION] Added ${hre.ethers.formatEther(BigInt(fundsNeeded))} ETH for gas to ${fromAddress}`,
      );
    }
  } catch (error) {
    // If gas estimation fails, fall back to adding a small amount
    console.log(
      `[GAS ESTIMATION] ⚠️ Gas estimation failed for ${fromAddress}, adding default gas funds`,
    );
    console.log(`[GAS ESTIMATION] Gas estimation error: ${error}`);

    try {
      const currentBalance = await hre.ethers.provider.getBalance(fromAddress);
      const defaultGasFunds = hre.ethers.parseEther('0.05'); // 0.05 ETH fallback

      if (currentBalance < defaultGasFunds) {
        const newBalance = currentBalance + defaultGasFunds;
        await hre.network.provider.request({
          method: 'hardhat_setBalance',
          params: [fromAddress, '0x' + newBalance.toString(16)],
        });
        console.log(
          `[GAS ESTIMATION] Added ${hre.ethers.formatEther(defaultGasFunds)} ETH default gas funds to ${fromAddress}`,
        );
      } else {
        console.log(
          `[GAS ESTIMATION] ${fromAddress} already has sufficient balance: ${hre.ethers.formatEther(currentBalance)} ETH`,
        );
      }
    } catch (balanceError) {
      console.error(
        `[GAS ESTIMATION] ❌ Failed to set balance: ${balanceError}`,
      );
      throw balanceError;
    }
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
