import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (!hre.network.name.startsWith('otp') && !hre.network.name.startsWith('hardhat')) {
    return;
  }

  await hre.helpers.deploy({
    newContractName: 'ParanetsRegistry',
  });
};

export default func;
func.tags = ['ParanetsRegistry', 'v2'];
func.dependencies = ['HubV2'];
