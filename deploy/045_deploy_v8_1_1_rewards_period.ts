import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await hre.helpers.deploy({
    newContractName: 'V8_1_1_Rewards_Period',
  });
};

export default func;
func.tags = ['V8_1_1_Rewards_Period'];
func.dependencies = [
  'Hub',
  'V8_1_1_Rewards_Period_Storage',
  'StakingStorage',
  'ShardingTableStorage',
  'ShardingTable',
  'ParametersStorage',
  'Ask',
  'DelegatorsInfo',
  'RandomSamplingStorage',
  'Chronos',
  'Staking',
  'V6_Claim',
];
