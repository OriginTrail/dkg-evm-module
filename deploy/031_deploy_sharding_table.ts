import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (
    hre.helpers.isDeployed('ShardingTable') &&
    (hre.helpers.contractDeployments.contracts['ShardingTable'].version === undefined ||
      hre.helpers.contractDeployments.contracts['ShardingTable'].version?.startsWith('2.'))
  ) {
    return;
  }

  console.log('Deploying ShardingTable V1...');

  await hre.helpers.deploy({
    newContractName: 'ShardingTable',
  });
};

export default func;
func.tags = ['ShardingTable', 'v1'];
func.dependencies = ['Hub', 'ProfileStorage', 'ShardingTableStorage', 'StakingStorage'];
