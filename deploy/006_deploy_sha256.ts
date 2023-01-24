import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const SHA256 = await hre.helpers.deploy({
    newContractName: 'SHA256',
    passHubInConstructor: false,
    setContractInHub: false,
  });

  await hre.deployments.execute('HashingProxy', { from: deployer, log: true }, 'setContractAddress', 1, SHA256.address);
};

export default func;
func.tags = ['SHA256'];
func.dependencies = ['HashingProxy'];
