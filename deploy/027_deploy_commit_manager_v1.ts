import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await hre.helpers.deploy({
    newContractName: 'CommitManagerV1',
  });
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
