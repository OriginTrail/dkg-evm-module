import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await hre.helpers.deploy({
    newContractName: 'Assertion',
  });
};

export default func;
func.tags = ['Assertion', 'v1'];
func.dependencies = ['Hub', 'AssertionStorage'];
