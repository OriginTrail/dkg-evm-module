import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await hre.helpers.deploy({
    newContractName: 'IdentityStorage',
  });
};

export default func;
func.tags = ['IdentityStorage'];
func.dependencies = ['Hub'];
