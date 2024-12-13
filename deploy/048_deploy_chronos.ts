import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await hre.helpers.deploy({
    newContractName: 'Chronos',
    passHubInConstructor: false,
  });
};

export default func;
func.tags = ['Chronos', 'v1', 'v2'];
func.dependencies = [];
