import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await hre.helpers.deploy({
    newContractName: 'UnfinalizedStateStorage',
  });
};

export default func;
func.tags = ['UnfinalizedStateStorage', 'v1'];
func.dependencies = ['Hub'];
