import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (
    hre.helpers.isDeployed('CommitManagerV1U1') &&
    (hre.helpers.contractDeployments.contracts['CommitManagerV1U1'].version === undefined ||
      hre.helpers.contractDeployments.contracts['CommitManagerV1U1'].version?.startsWith('1.'))
  ) {
    return;
  }

  console.log('Deploying CommitManager V2U1...');

  const CommitManagerV2U1 = await hre.helpers.deploy({
    newContractName: 'CommitManagerV2U1',
    newContractNameInHub: 'CommitManagerV1U1',
  });

  await hre.helpers.updateContractParameters('CommitManagerV1U1', CommitManagerV2U1);
};

export default func;
func.tags = ['CommitManagerV2U1', 'v2'];
func.dependencies = [
  'HubV2',
  'IdentityStorageV2',
  'ProximityScoringProxy',
  'Log2PLDSF',
  'LinearSum',
  'ParametersStorage',
  'ProfileStorage',
  'ServiceAgreementStorageProxy',
  'ContentAssetStorageV2',
  'HashingProxy',
  'SHA256',
  'ShardingTableStorageV2',
  'StakingV2',
  'StakingStorageV2',
  'UnfinalizedStateStorage',
];
