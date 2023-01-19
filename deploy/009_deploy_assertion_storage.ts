import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await hre.helpers.deploy({
    hre,
    newContractName: 'AssertionStorage',
  });
};

export default func;
func.tags = ['AssertionStorage'];
func.dependencies = ['Hub'];
