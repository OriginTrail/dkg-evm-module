import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (
    hre.helpers.isDeployed('ContentAssetStorage') &&
    (hre.helpers.contractDeployments.contracts['ContentAssetStorage'].version === undefined ||
      hre.helpers.contractDeployments.contracts['ContentAssetStorage'].version?.startsWith('1.'))
  ) {
    return;
  }

  console.log('Deploying ContentAssetStorage V2...');

  await hre.helpers.deploy({
    newContractName: 'ContentAssetStorageV2',
    newContractNameInHub: 'ContentAssetStorage',
    passHubInConstructor: true,
    setContractInHub: false,
    setAssetStorageInHub: true,
    additionalArgs: [hre.network.name.split('_')[0]],
  });
};

export default func;
func.tags = ['ContentAssetStorageV2', 'v2'];
func.dependencies = ['HubV2'];
