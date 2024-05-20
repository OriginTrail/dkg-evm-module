import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const isDeployed = hre.helpers.isDeployed('NodeOperatorFeesStorage');

  if (isDeployed) {
    return;
  }

  const nodeOperatorFeesStorageAddress =
    hre.helpers.contractDeployments.contracts['NodeOperatorFeesStorage'].evmAddress;

  await hre.helpers.deploy({
    newContractName: 'NodeOperatorFeesStorage',
    additionalArgs: [nodeOperatorFeesStorageAddress], // Old NOFS
  });
};

export default func;
func.tags = ['NodeOperatorFeesStorage', 'v2'];
func.dependencies = ['HubV2', 'StakingStorage'];
