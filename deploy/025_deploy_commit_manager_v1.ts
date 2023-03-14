import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await hre.helpers.deploy({
    newContractName: 'CommitManagerV1',
  });
};

export default func;
func.tags = ['CommitManagerV1'];
func.dependencies = [
  'HashingProxy',
  'Hub',
  'ScoringProxy',
  'Staking',
  'IdentityStorage',
  'ParametersStorage',
  'ProfileStorage',
  'ServiceAgreementStorageProxy',
  'ServiceAgreementHelperFunctions',
  'ShardingTableStorage',
  'StakingStorage',
];
