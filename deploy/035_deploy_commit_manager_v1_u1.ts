import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (
    hre.helpers.isDeployed('CommitManagerV1U1') &&
    (hre.helpers.contractDeployments.contracts['CommitManagerV1U1'].version === undefined ||
      hre.helpers.contractDeployments.contracts['CommitManagerV1U1'].version?.startsWith('2.'))
  ) {
    return;
  }

  console.log('Deploying CommitManager V1U1...');

  const CommitManagerV1U1 = await hre.helpers.deploy({
    newContractName: 'CommitManagerV1U1',
  });

  await hre.helpers.updateContractParameters('CommitManagerV1U1', CommitManagerV1U1);
};

export default func;
func.tags = ['CommitManagerV1U1', 'v1'];
func.dependencies = [
  'Hub',
  'IdentityStorage',
  'ScoringProxy',
  'Log2PLDSF',
  'ParametersStorage',
  'ProfileStorage',
  'ServiceAgreementStorageProxy',
  'ContentAssetStorage',
  'HashingProxy',
  'SHA256',
  'ShardingTableStorage',
  'Staking',
  'StakingStorage',
  'UnfinalizedStateStorage',
];
