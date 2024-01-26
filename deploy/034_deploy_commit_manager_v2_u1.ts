import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log('Deploying CommitManager V2U1...');

  const CommitManagerV2U1 = await hre.helpers.deploy({
    newContractName: 'CommitManagerV2U1',
  });

  await hre.helpers.updateContractParameters('CommitManagerV2U1', CommitManagerV2U1);
};

export default func;
func.tags = ['CommitManagerV2U1', 'v2'];
func.dependencies = [
  'ContentAssetStorage',
  'HubV2',
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
  'StakingStorageV2',
  'UnfinalizedStateStorage',
];
