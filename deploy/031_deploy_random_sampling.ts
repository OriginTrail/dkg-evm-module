import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const randomSamplingParametersConfig =
    hre.helpers.parametersConfig[hre.network.config.environment].RandomSampling;

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
];
