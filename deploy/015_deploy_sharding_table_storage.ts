import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (
    hre.helpers.isDeployed('ShardingTableStorage') &&
    (hre.helpers.contractDeployments.contracts['ShardingTableStorage'].version === undefined ||
      hre.helpers.contractDeployments.contracts['ShardingTableStorage'].version?.startsWith('2.'))
  ) {
    return;
  }

  console.log('Deploying ShardingTableStorage V1...');

  await hre.helpers.deploy({
    newContractName: 'ShardingTableStorage',
  });
};

export default func;
func.tags = ['ShardingTableStorage', 'v1'];
func.dependencies = ['Hub'];
