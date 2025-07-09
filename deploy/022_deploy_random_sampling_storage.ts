import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

type RandomSamplingStorageNetworkConfig = {
  proofingPeriodDurationInBlocks: string;
  W1: string;
  W2: string;
};

// Helper function to detect which chain is being forked
function detectForkedChain(hre: HardhatRuntimeEnvironment): string {
  // Check if we're forking and get the RPC URL
  const forkUrl = process.env.HARDHAT_FORK_URL;

  if (!forkUrl) {
    // If not forking, use the network name
    return hre.network.name === 'hardhat' ? 'base_mainnet' : hre.network.name;
  }

  // Map RPC URLs to chain configuration names
  if (forkUrl.includes('base')) {
    return 'base_mainnet';
  } else if (
    forkUrl.includes('neuroweb') ||
    forkUrl.includes('origintrail.network') ||
    forkUrl.includes('origin-trail.network')
  ) {
    return 'neuroweb_mainnet';
  } else if (forkUrl.includes('gnosis') || forkUrl.includes('xdai')) {
    return 'gnosis_mainnet';
  } else {
    throw new Error(`Unknown fork URL: ${forkUrl}`);
  }
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  // Detect which chain configuration to use
  const chainConfigName = detectForkedChain(hre);
  console.log(`🔍 Using RandomSamplingStorage config for: ${chainConfigName}`);

  const randomSamplingStorageParametersConfig = hre.helpers.parametersConfig[
    'mainnet'
  ].RandomSamplingStorage[
    chainConfigName
  ] as unknown as RandomSamplingStorageNetworkConfig;

  if (!randomSamplingStorageParametersConfig) {
    throw new Error(
      `RandomSamplingStorage parameters config not found for network: ${chainConfigName} (original: ${hre.network.name})`,
    );
  }

  await hre.helpers.deploy({
    newContractName: 'RandomSamplingStorage',
    additionalArgs: [
      randomSamplingStorageParametersConfig.proofingPeriodDurationInBlocks,
      randomSamplingStorageParametersConfig.W1,
      randomSamplingStorageParametersConfig.W2,
    ],
  });
};

export default func;
func.tags = ['RandomSamplingStorage'];
func.dependencies = ['Hub'];
