import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (
    hre.helpers.isDeployed('Staking') &&
    (hre.helpers.contractDeployments.contracts['Staking'].version === undefined ||
      hre.helpers.contractDeployments.contracts['Staking'].version?.startsWith('1.'))
  ) {
    return;
  }

  console.log('Deploying Staking V2...');

  await hre.helpers.deploy({
    newContractName: 'StakingV2',
    newContractNameInHub: 'Staking',
  });
};

export default func;
func.tags = ['StakingV2', 'v2'];
func.dependencies = [
  'HubV2',
  'ShardingTableV2',
  'IdentityStorageV2',
  'ParametersStorage',
  'ProfileStorage',
  'ServiceAgreementStorageProxy',
  'ShardingTableStorageV2',
  'StakingStorage',
  'NodeOperatorFeesStorage',
];
