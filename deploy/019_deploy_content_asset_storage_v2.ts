import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log('Deploying ContentAssetStorage V2...');

  await hre.helpers.deploy({
    newContractName: 'ContentAssetStorageV2',
    newContractNameInHub: 'ContentAssetStorage',
    setContractInHub: false,
    setAssetStorageInHub: true,
    additionalArgs: [hre.network.name.split('_')[0]],
  });
};

export default func;
func.tags = ['ContentAssetStorageV2', 'v2'];
func.dependencies = ['HubV2'];
