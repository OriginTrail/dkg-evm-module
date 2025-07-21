import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { NETWORK_HUBS } from '../simulation/helpers/simulation-constants';

type RandomSamplingStorageNetworkConfig = {
  proofingPeriodDurationInBlocks: string;
  W1: string;
  W2: string;
};

// Helper function to detect which chain is being forked
async function detectForkedChain(
  hre: HardhatRuntimeEnvironment,
): Promise<string> {
  // Get the Hub address from hardhat-deploy registry
  const hubDeployment = await hre.deployments.get('Hub');
  const hubAddress = hubDeployment.address;

  const configName = NETWORK_HUBS[hubAddress as keyof typeof NETWORK_HUBS];
  if (!configName) {
    throw new Error(
      `[022 DEPLOYMENT] Unknown Hub address for RandomSamplingStorage config: ${hubAddress}`,
    );
  }

  return configName;
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  // Detect which chain configuration to use
  const chainConfigName = await detectForkedChain(hre);
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
