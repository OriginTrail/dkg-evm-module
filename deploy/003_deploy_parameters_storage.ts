import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await hre.helpers.deploy({
    newContractName: 'ParametersStorage',
  });
};

export default func;
func.tags = ['ParametersStorage'];
func.dependencies = ['Hub'];
