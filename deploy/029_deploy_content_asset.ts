import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const hasOldVersion = hre.helpers.inConfig('ContentAsset');

  let deprecatedContentAssetAddress = '';
  if (hasOldVersion) {
    deprecatedContentAssetAddress = hre.helpers.contractDeployments.contracts['ContentAsset'].evmAddress;
  }

  await hre.helpers.deploy({
    newContractName: 'ContentAsset',
  });

  if (hasOldVersion) {
    hre.helpers.newContracts.push(['ContentAssetDeprecated', deprecatedContentAssetAddress]);
  }
};

export default func;
func.tags = ['ContentAsset'];
func.dependencies = [
  'Assertion',
  'ContentAssetStorage',
  'Hub',
  'ServiceAgreementV1',
  'HashingProxy',
  'SHA256',
  'UnfinalizedStateStorage',
];
