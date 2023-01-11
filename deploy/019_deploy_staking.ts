import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await hre.helpers.deploy({
    hre,
    newContractName: 'Staking',
  });
};

export default func;
func.tags = ['Staking'];
func.dependencies = [
  'Hub',
  'ShardingTable',
  'IdentityStorage',
  'ParametersStorage',
  'ProfileStorage',
  'ServiceAgreementStorageV1',
  'ShardingTableStorage',
  'StakingStorage',
];