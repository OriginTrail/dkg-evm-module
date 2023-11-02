import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (hre.helpers.isDeployed('IdentityStorageV2')) {
    return;
  }

  await hre.helpers.deploy({
    newContractName: 'IdentityStorage',
  });
};

export default func;
func.tags = ['IdentityStorage', 'v1'];
func.dependencies = ['Hub'];
