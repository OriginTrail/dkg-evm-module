import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (hre.helpers.isDeployed('ContentAssetStorageV2')) {
    return;
  }

  console.log('Deploying ContentAssetStorage V1...');

  await hre.helpers.deploy({
    newContractName: 'ContentAssetStorage',
    setContractInHub: false,
    setAssetStorageInHub: true,
  });
};

export default func;
func.tags = ['ContentAssetStorage', 'v1'];
func.dependencies = ['Hub'];
