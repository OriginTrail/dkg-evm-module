import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await hre.helpers.deploy({
    newContractName: 'V6_Claim',
  });
};

export default func;
func.tags = ['V6_Claim'];
func.dependencies = [
  'Hub',
  'Chronos',
  'Ask',
  'ShardingTable',
  'ShardingTableStorage',
  'IdentityStorage',
  'ParametersStorage',
  'ProfileStorage',
  'StakingStorage',
  'DelegatorsInfo',
  'V6_DelegatorsInfo',
  'Token',
  'V6_RandomSamplingStorage',
  'EpochStorage',
  'ClaimV6Helper',
  'Staking',
];
