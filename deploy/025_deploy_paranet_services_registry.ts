import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (!hre.network.name.startsWith('otp') && !hre.network.name.startsWith('hardhat')) {
    return;
  }

  await hre.helpers.deploy({
    newContractName: 'ParanetServicesRegistry',
  });
};

export default func;
func.tags = ['ParanetServicesRegistry', 'v2'];
func.dependencies = ['HubV2'];
