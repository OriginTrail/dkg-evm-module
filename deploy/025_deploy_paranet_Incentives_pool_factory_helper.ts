import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (
    !hre.network.name.startsWith('neuroweb') &&
    !hre.network.name.startsWith('hardhat')
  ) {
    return;
  }

  await hre.helpers.deploy({
    newContractName: 'ParanetIncentivesPoolFactoryHelper',
  });
};

export default func;
func.tags = ['ParanetIncentivesPoolFactoryHelper'];
func.dependencies = ['Hub'];
