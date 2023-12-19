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

  const isDeployed = hre.helpers.isDeployed('ContentAssetStorage');

  const ContentAssetStorage = await hre.helpers.deploy({
    newContractName: 'ContentAssetStorageV2',
    newContractNameInHub: 'ContentAssetStorage',
    passHubInConstructor: true,
    setContractInHub: false,
    setAssetStorageInHub: true,
  });

  if (!isDeployed) {
    const encodedData = ContentAssetStorage.interface.encodeFunctionData('setBaseURI', [
      `did:dkg:${hre.network.name.split('_')[0]}:${hre.network.config.chainId}/${ContentAssetStorage.address}/`,
    ]);

    if (hre.network.config.environment === 'development') {
      const { deployer } = await hre.getNamedAccounts();

      const hubControllerAddress = hre.helpers.contractDeployments.contracts['HubController'].evmAddress;
      const HubController = await hre.ethers.getContractAt('HubController', hubControllerAddress, deployer);

      const setBaseURITx = await HubController.forwardCall(ContentAssetStorage.address, encodedData);
      await setBaseURITx.wait();
    } else {
      hre.helpers.setParametersEncodedData.push(['ContentAssetStorage', [encodedData]]);
    }
  }
};

export default func;
func.tags = ['ContentAssetStorageV2', 'v2'];
func.dependencies = ['HubV2'];
