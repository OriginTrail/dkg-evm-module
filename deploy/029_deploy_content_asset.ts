import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await hre.helpers.deploy({
    newContractName: 'ContentAsset',
    dependencies: func.dependencies,
  });
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
