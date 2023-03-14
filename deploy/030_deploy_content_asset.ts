import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await hre.helpers.deploy({
    newContractName: 'ContentAsset',
  });
};

export default func;
func.tags = ['ContentAsset'];
func.dependencies = [
  'Assertion',
  'Hub',
  'ServiceAgreementV1',
  'ServiceAgreementHelperFunctions',
  'ContentAssetStorage',
  'UnfinalizedStateStorage',
];
