import { HardhatRuntimeEnvironment } from 'hardhat/types';

/**
 * Blockchain Helpers for DKG Simulation
 *
 * Handles contract deployments, address resolution, and chain-specific configurations
 */

// Known Hub addresses for each chain (from simulation spec)
const HUB_ADDRESSES = {
  // Base Mainnet
  '8453': '0x3abBB0D6ad848d64c8956edC9Bf6f18aC22E1485',
  // Neuroweb Mainnet
  '2043': '0x0957e25BD33034948abc28204ddA54b6E1142D6F',
  // Gnosis Mainnet
  '100': '0x882D0BF07F956b1b94BBfe9E77F47c6fc7D4EC8f',
} as const;

/**
 * Get the Hub contract address for the current forked network
 */
export async function getHubAddress(
  hre: HardhatRuntimeEnvironment,
): Promise<string> {
  try {
    // Method 1: Check if there are local deployments (for development/testing)
    const localHubAddress = await getLocalHubAddress(hre);
    if (localHubAddress) {
      console.log(`🏠 Using locally deployed Hub: ${localHubAddress}`);
      return localHubAddress;
    }

    // Method 2: Use mainnet Hub addresses for forked networks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const networkConfig = hre.network.config as any;
    let chainId: string;

    // Check network config for forking (hardhat network)
    if (networkConfig.forking && networkConfig.forking.url) {
      const forkUrl = networkConfig.forking.url;
      console.log(`🔗 Detected forked network from config: ${forkUrl}`);
      chainId = extractChainIdFromUrl(forkUrl);
    }
    // Check environment variables (localhost network)
    else if (process.env.HARDHAT_FORK_URL) {
      const forkUrl = process.env.HARDHAT_FORK_URL;
      console.log(`🔗 Detected forked network from env: ${forkUrl}`);
      chainId = extractChainIdFromUrl(forkUrl);
    }
    // Check if we're on localhost with chain ID 31337 (likely forked)
    else if (
      hre.network.name === 'localhost' ||
      hre.network.name === 'hardhat'
    ) {
      // For localhost, try to get chain ID from environment or default to Base
      chainId = process.env.HARDHAT_FORK_CHAIN_ID || '8453'; // Default to Base
      console.log(`🔗 Detected localhost network, using chain ID: ${chainId}`);
    }
    // Use actual network chain ID
    else {
      const network = await hre.ethers.provider.getNetwork();
      chainId = network.chainId.toString();
      console.log(`🔗 Using actual network chain ID: ${chainId}`);
    }

    console.log(`🔗 Using chain ID: ${chainId}`);

    // Look up the Hub address for this chain
    if (chainId in HUB_ADDRESSES) {
      const hubAddress = HUB_ADDRESSES[chainId as keyof typeof HUB_ADDRESSES];
      console.log(
        `📋 Using mainnet Hub address: ${hubAddress} for chain ${chainId}`,
      );
      return hubAddress;
    }

    throw new Error(`Hub address not configured for chain ID: ${chainId}`);
  } catch (error) {
    throw new Error(`Failed to get Hub address: ${error}`);
  }
}

/**
 * Check for locally deployed Hub contract (takes precedence over mainnet)
 */
async function getLocalHubAddress(
  hre: HardhatRuntimeEnvironment,
): Promise<string | null> {
  try {
    const fs = await import('fs');
    const path = await import('path');

    // Method 1: Check hardhat_contracts.json (most reliable for hardhat deployments)
    const hardhatContractsPath = path.join(
      process.cwd(),
      'deployments',
      'hardhat_contracts.json',
    );

    if (fs.existsSync(hardhatContractsPath)) {
      const hardhatContracts = JSON.parse(
        fs.readFileSync(hardhatContractsPath, 'utf8'),
      );
      if (hardhatContracts.contracts && hardhatContracts.contracts.Hub) {
        const hubAddress = hardhatContracts.contracts.Hub.evmAddress;
        console.log(`🔨 Found Hub in hardhat_contracts.json: ${hubAddress}`);
        return hubAddress;
      }
    }

    // Method 2: Check localhost deployments directory
    const deploymentsPath = path.join(
      process.cwd(),
      'deployments',
      'localhost',
    );
    const hubPath = path.join(deploymentsPath, 'Hub.json');

    if (fs.existsSync(hubPath)) {
      const hubDeployment = JSON.parse(fs.readFileSync(hubPath, 'utf8'));
      console.log(`📁 Found local Hub deployment: ${hubDeployment.address}`);
      return hubDeployment.address;
    }

    // Method 3: Check environment variable for explicit Hub override
    if (process.env.SIMULATION_HUB_ADDRESS) {
      console.log(
        `🎯 Using explicit Hub from env: ${process.env.SIMULATION_HUB_ADDRESS}`,
      );
      return process.env.SIMULATION_HUB_ADDRESS;
    }

    // Method 4: Try to find recent Hub deployments on the network
    const hubAddress = await findHubFromRecentDeployments(hre);
    if (hubAddress) {
      console.log(`🔍 Found recent Hub deployment: ${hubAddress}`);
      return hubAddress;
    }

    return null;
  } catch {
    // If local check fails, continue to mainnet addresses
    return null;
  }
}

/**
 * Try to find Hub contract from recent deployments by scanning recent blocks
 */
async function findHubFromRecentDeployments(
  hre: HardhatRuntimeEnvironment,
): Promise<string | null> {
  try {
    const currentBlock = await hre.ethers.provider.getBlockNumber();
    console.log(`🔍 Scanning last 100 blocks for Hub deployment...`);

    // Scan last 100 blocks for Hub deployment
    const startBlock = Math.max(currentBlock - 100, 0);

    for (
      let blockNumber = currentBlock;
      blockNumber >= startBlock;
      blockNumber--
    ) {
      const block = await hre.ethers.provider.getBlock(blockNumber, true);
      if (!block || !block.transactions) continue;

      for (const txHash of block.transactions) {
        const receipt = await hre.ethers.provider.getTransactionReceipt(txHash);

        if (receipt && receipt.contractAddress) {
          // Check if this deployed contract has a Hub-like interface
          try {
            const contractCode = await hre.ethers.provider.getCode(
              receipt.contractAddress,
            );
            if (contractCode.length > 2) {
              // Has bytecode
              const Hub = await hre.ethers.getContractFactory('Hub');
              const testHub = Hub.attach(receipt.contractAddress);

              // Test if it responds to Hub methods
              const name = await testHub.name();
              if (name === 'Hub') {
                return receipt.contractAddress;
              }
            }
          } catch {
            // Not a Hub contract, continue
          }
        }
      }
    }

    return null;
  } catch (error) {
    console.log(`⚠️  Could not scan for recent deployments: ${error.message}`);
    return null;
  }
}

/**
 * Extract chain ID from RPC URL patterns
 */
function extractChainIdFromUrl(url: string): string {
  // Determine chain ID from fork URL patterns
  if (url.includes('base')) {
    return '8453'; // Base Mainnet
  } else if (url.includes('neuroweb') || url.includes('neuro')) {
    return '2043'; // Neuroweb Mainnet
  } else if (url.includes('gnosis') || url.includes('xdai')) {
    return '100'; // Gnosis Mainnet
  } else {
    // Check environment variables for explicit chain ID
    const envChainId = process.env.HARDHAT_FORK_CHAIN_ID;
    if (envChainId) {
      return envChainId;
    } else {
      throw new Error(
        `Cannot determine chain ID from URL: ${url}. Set HARDHAT_FORK_CHAIN_ID environment variable.`,
      );
    }
  }
}

/**
 * Get all deployed contract instances from the forked network
 */
export async function getDeployedContracts(hre: HardhatRuntimeEnvironment) {
  const hubAddress = await getHubAddress(hre);

  // Get contract factories (needed for ABIs)
  const Hub = await hre.ethers.getContractFactory('Hub');
  const ProfileStorage = await hre.ethers.getContractFactory('ProfileStorage');
  const ShardingTableStorage = await hre.ethers.getContractFactory(
    'ShardingTableStorage',
  );
  const RandomSampling = await hre.ethers.getContractFactory('RandomSampling');
  const RandomSamplingStorage = await hre.ethers.getContractFactory(
    'RandomSamplingStorage',
  );
  const StakingStorage = await hre.ethers.getContractFactory('StakingStorage');
  const Chronos = await hre.ethers.getContractFactory('Chronos');

  // Connect to the Hub contract on the forked network
  const hub = Hub.attach(hubAddress);

  // Get all contract addresses from the Hub registry
  console.log('📋 Loading contract addresses from Hub registry...');

  try {
    const [
      profileStorageAddress,
      shardingTableStorageAddress,
      randomSamplingAddress,
      randomSamplingStorageAddress,
      stakingStorageAddress,
      chronosAddress,
    ] = await Promise.all([
      hub.getContractAddress('ProfileStorage'),
      hub.getContractAddress('ShardingTableStorage'),
      hub.getContractAddress('RandomSampling'),
      hub.getContractAddress('RandomSamplingStorage'),
      hub.getContractAddress('StakingStorage'),
      hub.getContractAddress('Chronos'),
    ]);

    console.log(`   ProfileStorage: ${profileStorageAddress}`);
    console.log(`   ShardingTableStorage: ${shardingTableStorageAddress}`);
    console.log(`   RandomSampling: ${randomSamplingAddress}`);
    console.log(`   RandomSamplingStorage: ${randomSamplingStorageAddress}`);
    console.log(`   StakingStorage: ${stakingStorageAddress}`);
    console.log(`   Chronos: ${chronosAddress}`);

    // Return contract instances attached to their deployed addresses
    return {
      Hub: hub,
      ProfileStorage: ProfileStorage.attach(profileStorageAddress),
      ShardingTableStorage: ShardingTableStorage.attach(
        shardingTableStorageAddress,
      ),
      RandomSampling: RandomSampling.attach(randomSamplingAddress),
      RandomSamplingStorage: RandomSamplingStorage.attach(
        randomSamplingStorageAddress,
      ),
      StakingStorage: StakingStorage.attach(stakingStorageAddress),
      Chronos: Chronos.attach(chronosAddress),
    };
  } catch (error) {
    console.error('❌ Error loading contract addresses from Hub:');
    console.error(error);

    // Fallback: Try to get addresses from hardhat_contracts.json
    console.log('🔄 Falling back to hardhat_contracts.json...');
    return await getContractsFromHardhatDeployments(hre);
  }
}

/**
 * Get contract instances from hardhat_contracts.json when Hub registry is empty
 */
async function getContractsFromHardhatDeployments(
  hre: HardhatRuntimeEnvironment,
) {
  const fs = await import('fs');
  const path = await import('path');

  const hardhatContractsPath = path.join(
    process.cwd(),
    'deployments',
    'hardhat_contracts.json',
  );

  if (!fs.existsSync(hardhatContractsPath)) {
    throw new Error(
      'No hardhat_contracts.json found and Hub registry is empty',
    );
  }

  const hardhatContracts = JSON.parse(
    fs.readFileSync(hardhatContractsPath, 'utf8'),
  );

  if (!hardhatContracts.contracts) {
    throw new Error('Invalid hardhat_contracts.json format');
  }

  // Get contract factories (needed for ABIs)
  const Hub = await hre.ethers.getContractFactory('Hub');
  const ProfileStorage = await hre.ethers.getContractFactory('ProfileStorage');
  const ShardingTableStorage = await hre.ethers.getContractFactory(
    'ShardingTableStorage',
  );
  const RandomSampling = await hre.ethers.getContractFactory('RandomSampling');
  const RandomSamplingStorage = await hre.ethers.getContractFactory(
    'RandomSamplingStorage',
  );
  const StakingStorage = await hre.ethers.getContractFactory('StakingStorage');
  const Chronos = await hre.ethers.getContractFactory('Chronos');

  // Get addresses from hardhat_contracts.json
  const contracts = hardhatContracts.contracts;

  console.log('📂 Loading contract addresses from hardhat_contracts.json:');
  console.log(`   Hub: ${contracts.Hub?.evmAddress}`);
  console.log(`   ProfileStorage: ${contracts.ProfileStorage?.evmAddress}`);
  console.log(
    `   ShardingTableStorage: ${contracts.ShardingTableStorage?.evmAddress}`,
  );
  console.log(`   RandomSampling: ${contracts.RandomSampling?.evmAddress}`);
  console.log(
    `   RandomSamplingStorage: ${contracts.RandomSamplingStorage?.evmAddress}`,
  );
  console.log(`   StakingStorage: ${contracts.StakingStorage?.evmAddress}`);
  console.log(`   Chronos: ${contracts.Chronos?.evmAddress}`);

  // Check required contracts exist
  const requiredContracts = [
    'Hub',
    'ProfileStorage',
    'ShardingTableStorage',
    'RandomSampling',
    'RandomSamplingStorage',
    'StakingStorage',
    'Chronos',
  ];
  for (const contractName of requiredContracts) {
    if (!contracts[contractName]?.evmAddress) {
      throw new Error(
        `${contractName} address not found in hardhat_contracts.json`,
      );
    }
  }

  // Return contract instances (we know they exist now)
  return {
    Hub: Hub.attach(contracts.Hub.evmAddress),
    ProfileStorage: ProfileStorage.attach(contracts.ProfileStorage.evmAddress),
    ShardingTableStorage: ShardingTableStorage.attach(
      contracts.ShardingTableStorage.evmAddress,
    ),
    RandomSampling: RandomSampling.attach(contracts.RandomSampling.evmAddress),
    RandomSamplingStorage: RandomSamplingStorage.attach(
      contracts.RandomSamplingStorage.evmAddress,
    ),
    StakingStorage: StakingStorage.attach(contracts.StakingStorage.evmAddress),
    Chronos: Chronos.attach(contracts.Chronos.evmAddress),
  };
}

/**
 * Verify that all contracts are properly deployed and accessible
 */
export async function verifyContractDeployments(
  hre: HardhatRuntimeEnvironment,
): Promise<void> {
  console.log('🔍 Verifying contract deployments...');

  try {
    const contracts = await getDeployedContracts(hre);

    // Test basic contract calls to verify they're working
    const [
      hubName,
      profileStorageName,
      chronosCurrentEpoch,
      shardingTableNodesCount,
    ] = await Promise.all([
      contracts.Hub.name(),
      contracts.ProfileStorage.name(),
      contracts.Chronos.getCurrentEpoch(),
      contracts.ShardingTableStorage.nodesCount(),
    ]);

    console.log('✅ Contract verification successful:');
    console.log(`   Hub: ${hubName}`);
    console.log(`   ProfileStorage: ${profileStorageName}`);
    console.log(`   Current Epoch: ${chronosCurrentEpoch}`);
    console.log(`   Nodes in Sharding Table: ${shardingTableNodesCount}`);
  } catch (error) {
    throw new Error(`Contract verification failed: ${error}`);
  }
}

/**
 * Get network-specific configuration
 */
export function getNetworkConfig(chainId: string) {
  const configs = {
    '8453': {
      // Base Mainnet
      name: 'Base Mainnet',
      avgBlockTime: 2, // seconds
      currency: 'ETH',
    },
    '2043': {
      // Neuroweb Mainnet
      name: 'Neuroweb Mainnet',
      avgBlockTime: 12, // seconds
      currency: 'NEURO',
    },
    '100': {
      // Gnosis Mainnet
      name: 'Gnosis Mainnet',
      avgBlockTime: 5, // seconds
      currency: 'xDAI',
    },
  } as const;

  return (
    configs[chainId as keyof typeof configs] || {
      name: `Unknown Chain ${chainId}`,
      avgBlockTime: 12,
      currency: 'ETH',
    }
  );
}

/**
 * Impersonate an account for transaction replay
 */
export async function impersonateAccount(
  hre: HardhatRuntimeEnvironment,
  address: string,
): Promise<void> {
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
): Promise<void> {
  await hre.network.provider.request({
    method: 'hardhat_stopImpersonatingAccount',
    params: [address],
  });
}
