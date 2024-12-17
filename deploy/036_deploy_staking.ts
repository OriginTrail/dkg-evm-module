import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (
    hre.helpers.isDeployed('Staking') &&
    (hre.helpers.contractDeployments.contracts['Staking'].version === undefined ||
      hre.helpers.contractDeployments.contracts['Staking'].version?.startsWith('2.'))
  ) {
    return;
  }

  console.log('Deploying Staking V1...');

  await hre.helpers.deploy({
    newContractName: 'Staking',
  });
};

export default func;
func.tags = ['Staking', 'v1'];
func.dependencies = [
  'Hub',
  'ShardingTable',
  'IdentityStorage',
  'ParametersStorage',
  'ProfileStorage',
  'ServiceAgreementStorageProxy',
  'ShardingTableStorage',
  'StakingStorage',
];
