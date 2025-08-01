import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await hre.helpers.deploy({
    newContractName: 'ClaimV6Helper',
  });
};

export default func;
func.tags = ['ClaimV6Helper'];
func.dependencies = ['Hub', 'V6_RandomSamplingStorage', 'StakingStorage'];
