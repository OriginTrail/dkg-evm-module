import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const hasOldVersion = hre.helpers.inConfig('ContentAsset');

  let oldContentAssetAddress = '';
  if (hasOldVersion) {
    oldContentAssetAddress = hre.helpers.contractDeployments.contracts['ContentAsset'].evmAddress;
  }

  await hre.helpers.deploy({
    newContractName: 'ContentAsset',
  });

  if (hasOldVersion) {
    hre.helpers.newContracts.push(['ContentAssetV1Deprecated', oldContentAssetAddress]);
    hre.helpers.contractsForReinitialization.push(oldContentAssetAddress);
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
