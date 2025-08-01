import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await hre.helpers.deploy({
    newContractName: 'V6_RandomSampling',
  });
};

export default func;
func.tags = ['V6_RandomSampling'];
func.dependencies = [
  'Hub',
  'Chronos',
  'V6_RandomSamplingStorage',
  'StakingStorage',
  'ProfileStorage',
  'EpochStorage',
  'AskStorage',
  'DelegatorsInfo',
  'KnowledgeCollectionStorage',
  'IdentityStorage',
  'ShardingTableStorage',
  'ParametersStorage',
];
