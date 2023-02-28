import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await hre.helpers.deploy({
    newContractName: 'ShardingTable',
  });
};

export default func;
func.tags = ['ShardingTable'];
func.dependencies = ['Hub', 'ProfileStorage', 'ShardingTableStorage', 'StakingStorage'];
