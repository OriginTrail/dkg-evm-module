import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const isDeployed = hre.helpers.isDeployed('ContentAsset');
  let oldContentAssetAddress = '';
  if (isDeployed) {
    oldContentAssetAddress = hre.helpers.contractDeployments.contracts['ContentAsset'].evmAddress;
  }

  await hre.helpers.deploy({
    newContractName: 'ContentAsset',
  });

  if (isDeployed) {
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
