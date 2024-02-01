import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (
    hre.helpers.isDeployed('ShardingTable') &&
    (hre.helpers.contractDeployments.contracts['ShardingTable'].version === undefined ||
      hre.helpers.contractDeployments.contracts['ShardingTable'].version?.startsWith('1.'))
  ) {
    return;
  }

  console.log('Deploying ShardingTable V2...');

  await hre.helpers.deploy({
    newContractName: 'ShardingTableV2',
    newContractNameInHub: 'ShardingTable',
  });
};

export default func;
func.tags = ['ShardingTableV2', 'v2'];
func.dependencies = ['HubV2', 'ProfileStorage', 'ShardingTableStorageV2', 'StakingStorage'];
