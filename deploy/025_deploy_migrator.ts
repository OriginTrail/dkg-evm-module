import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (hre.network.config.environment === 'development') {
    return;
  }

  await hre.helpers.deploy({
    newContractName: 'Migrator',
  });
};

export default func;
func.tags = ['Migrator'];
func.dependencies = [
  'Hub',
  'IdentityStorage',
  'ProfileStorage',
  'StakingStorage',
];
