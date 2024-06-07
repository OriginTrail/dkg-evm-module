import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (!hre.network.name.startsWith('otp') && !hre.network.name.startsWith('hardhat')) {
    return;
  }

  await hre.helpers.deploy({
    newContractName: 'Paranet',
  });
};

export default func;
func.tags = ['Paranet', 'v2'];
func.dependencies = [
  'ContentAssetStorageV2',
  'ContentAssetV2',
  'HubV2',
  'HashingProxy',
  'ParanetKnowledgeAssetsRegistry',
  'ParanetKnowledgeMinersRegistry',
  'ParanetsRegistry',
  'ParanetServicesRegistry',
  'ServiceAgreementStorageProxy',
];
