import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (
    hre.helpers.isDeployed('ContentAsset') &&
    (hre.helpers.contractDeployments.contracts['ContentAsset'].version === undefined ||
      hre.helpers.contractDeployments.contracts['ContentAsset'].version?.startsWith('1.'))
  ) {
    return;
  }

  console.log('Deploying ContentAsset V2...');

  await hre.helpers.deploy({
    newContractName: 'ContentAssetV2',
    newContractNameInHub: 'ContentAsset',
  });
};

export default func;
func.tags = ['ContentAssetV2', 'v2'];
func.dependencies = [
  'Assertion',
  'ContentAssetStorageV2',
  'HubV2',
  'ParanetKnowledgeAssetsRegistry',
  'ParanetKnowledgeMinersRegistry',
  'ParanetsRegistry',
  'ServiceAgreementV1',
  'HashingProxy',
  'SHA256',
  'UnfinalizedStateStorage',
];
