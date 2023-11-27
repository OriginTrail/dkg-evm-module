import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (
    hre.helpers.isDeployed('IdentityStorage') &&
    (hre.helpers.contractDeployments.contracts['IdentityStorage'].version === undefined ||
      hre.helpers.contractDeployments.contracts['IdentityStorage'].version?.startsWith('1.'))
  ) {
    return;
  }

  console.log('Deploying IdentityStorage V2...');

  await hre.helpers.deploy({
    newContractName: 'IdentityStorageV2',
    newContractNameInHub: 'IdentityStorage',
  });
};

export default func;
func.tags = ['IdentityStorageV2', 'v2'];
func.dependencies = ['HubV2'];
