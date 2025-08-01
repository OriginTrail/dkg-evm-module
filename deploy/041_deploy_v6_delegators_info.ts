import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await hre.helpers.deploy({
    newContractName: 'V6_DelegatorsInfo',
  });
};

export default func;
func.tags = ['V6_DelegatorsInfo'];
func.dependencies = ['Hub'];
