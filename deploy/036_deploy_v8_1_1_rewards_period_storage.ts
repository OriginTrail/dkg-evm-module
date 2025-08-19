import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await hre.helpers.deploy({
    newContractName: 'V8_1_1_Rewards_Period_Storage',
  });
};

export default func;
func.tags = ['V8_1_1_Rewards_Period_Storage'];
func.dependencies = ['Hub'];
