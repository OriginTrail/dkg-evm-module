import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  // TODO: Remove when paranets V2 are finished
  return;

  await hre.helpers.deploy({
    newContractName: 'ParanetServicesRegistry',
  });
};

export default func;
func.tags = ['ParanetServicesRegistry'];
func.dependencies = ['Hub'];
