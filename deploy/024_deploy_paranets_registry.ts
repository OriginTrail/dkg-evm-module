import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await hre.helpers.deploy({
    newContractName: 'ParanetsRegistry',
  });
};

export default func;
func.tags = ['ParanetsRegistry', 'v2'];
func.dependencies = ['HubV2'];
