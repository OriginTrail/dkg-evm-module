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

  console.log('Deploying CommitManager V2...');

  const CommitManagerV1U1 = await hre.helpers.deploy({
    newContractName: 'CommitManagerV2',
    newContractNameInHub: 'CommitManagerV1U1',
  });

  await hre.helpers.updateContractParameters('CommitManagerV1U1', CommitManagerV1U1);
};

export default func;
func.tags = ['CommitManagerV2', 'v2'];
func.dependencies = [
  'ContentAssetStorage',
  'HubV2',
  'IdentityStorageV2',
  'ScoringProxy',
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
