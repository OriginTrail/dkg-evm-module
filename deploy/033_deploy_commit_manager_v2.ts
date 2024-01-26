import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log('Deploying CommitManager V2...');

  const CommitManagerV2 = await hre.helpers.deploy({
    newContractName: 'CommitManagerV2',
  });

  await hre.helpers.updateContractParameters('CommitManagerV2', CommitManagerV2);
};

export default func;
func.tags = ['CommitManagerV2', 'v2'];
func.dependencies = [
  'Hub',
  'IdentityStorageV2',
  'ProximityScoringProxy',
  'Log2PLDSF',
  'ParametersStorage',
  'ProfileStorage',
  'ServiceAgreementStorageProxy',
  'HashingProxy',
  'SHA256',
  'ShardingTableStorageV2',
  'StakingV2',
  'StakingStorage',
];
