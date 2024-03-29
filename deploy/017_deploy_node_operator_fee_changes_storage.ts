import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await hre.helpers.deploy({
    newContractName: 'NodeOperatorFeeChangesStorage',
  });
};

export default func;
func.tags = ['NodeOperatorFeeChangesStorage', 'v2'];
func.dependencies = ['HubV2'];
