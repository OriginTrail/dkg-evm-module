import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

// Define an interface for the expected config structure
type RandomSamplingNetworkConfig = {
  avgBlockTimeInSeconds: string;
  W1: string;
  W2: string;
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const randomSamplingParametersConfig = hre.helpers.parametersConfig[
    hre.network.config.environment
  ].RandomSampling[hre.network.name] as unknown as RandomSamplingNetworkConfig;

  if (!randomSamplingParametersConfig) {
    throw new Error(
      `RandomSampling parameters config not found for network: ${hre.network.name}`,
    );
  }

  await hre.helpers.deploy({
    newContractName: 'RandomSampling',
    additionalArgs: [
      randomSamplingParametersConfig.avgBlockTimeInSeconds,
      randomSamplingParametersConfig.W1,
      randomSamplingParametersConfig.W2,
    ],
  });
};

export default func;
func.tags = ['RandomSampling'];
func.dependencies = [
  'Hub',
  'Chronos',
  'RandomSamplingStorage',
  'StakingStorage',
  'ProfileStorage',
  'EpochStorageV8',
  'AskStorage',
  'DelegatorsInfo',
  'KnowledgeCollectionStorage',
  'IdentityStorage',
  'ShardingTableStorage',
  'ParametersStorage',
];
