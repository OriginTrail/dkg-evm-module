import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await hre.helpers.deploy({
    newContractName: 'StakingKPI',
  });
};

export default func;
func.tags = ['StakingKPI'];
func.dependencies = [
  'Hub',
  'IdentityStorage',
  'ProfileStorage',
  'StakingStorage',
  'DelegatorsInfo',
  'RandomSamplingStorage',
  'EpochStorage',
  'ParametersStorage',
];
