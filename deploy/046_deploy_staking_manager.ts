import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await hre.helpers.deploy({
    newContractName: 'StakingManager',
  });
};

export default func;
func.tags = ['StakingManager'];
func.dependencies = [
  'Hub',
  'Staking',
  'V6_Claim',
  'ProfileStorage',
  'Chronos',
  'DelegatorsInfo',
  'V6_DelegatorsInfo',
  'V8_1_1_Rewards_Period_Storage',
  'V8_1_1_Rewards_Period',
];
