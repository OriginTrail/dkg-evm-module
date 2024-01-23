import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (
    hre.helpers.isDeployed('ShardingTableStorage') &&
    (hre.helpers.contractDeployments.contracts['ShardingTableStorage'].version === undefined ||
      hre.helpers.contractDeployments.contracts['ShardingTableStorage'].version?.startsWith('1.'))
  ) {
    return;
  }

  console.log('Deploying ShardingTableStorage V2...');

  await hre.helpers.deploy({
    newContractName: 'ShardingTableStorageV2',
    newContractNameInHub: 'ShardingTableStorage',
  });
};

export default func;
func.tags = ['ShardingTableStorageV2', 'v2'];
func.dependencies = ['HubV2'];
