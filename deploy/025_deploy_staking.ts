import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
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