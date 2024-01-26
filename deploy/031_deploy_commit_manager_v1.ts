import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (hre.helpers.isDeployed('CommitManagerV2')) {
    return;
  }

  console.log('Deploying CommitManager V1...');

  const CommitManagerV1 = await hre.helpers.deploy({
    newContractName: 'CommitManagerV1',
  });

  await hre.helpers.updateContractParameters('CommitManagerV1', CommitManagerV1);
};

export default func;
func.tags = ['CommitManagerV1', 'v1'];
func.dependencies = [
  'Hub',
  'IdentityStorage',
  'ScoringProxy',
  'Log2PLDSF',
  'ParametersStorage',
  'ProfileStorage',
  'ServiceAgreementStorageProxy',
  'HashingProxy',
  'SHA256',
  'ShardingTableStorage',
  'Staking',
  'StakingStorage',
];
