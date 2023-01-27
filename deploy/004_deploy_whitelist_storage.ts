import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await hre.helpers.deploy({
    newContractName: 'WhitelistStorage',
  });
};

export default func;
func.tags = ['WhitelistStorage'];
func.dependencies = ['Hub'];
