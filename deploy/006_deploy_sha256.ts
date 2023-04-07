import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const isDeployed = hre.helpers.isDeployed('SHA256');

  const SHA256 = await hre.helpers.deploy({
    newContractName: 'SHA256',
    passHubInConstructor: false,
  });

  if (!isDeployed) {
    hre.helpers.newHashFunctions.push(SHA256.address);
  }
};

export default func;
func.tags = ['SHA256'];
func.dependencies = ['HashingProxy'];
