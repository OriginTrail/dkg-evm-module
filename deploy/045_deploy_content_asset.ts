import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (
    hre.helpers.isDeployed('ContentAsset') &&
    (hre.helpers.contractDeployments.contracts['ContentAsset'].version === undefined ||
      hre.helpers.contractDeployments.contracts['ContentAsset'].version?.startsWith('2.'))
  ) {
    return;
  }

  console.log('Deploying ContentAsset V1...');

  await hre.helpers.deploy({
    newContractName: 'ContentAsset',
  });
};

export default func;
func.tags = ['ContentAsset', 'v1'];
func.dependencies = [
  'Assertion',
  'ContentAssetStorage',
  'Hub',
  'ServiceAgreementV1',
  'HashingProxy',
  'SHA256',
  'UnfinalizedStateStorage',
];
