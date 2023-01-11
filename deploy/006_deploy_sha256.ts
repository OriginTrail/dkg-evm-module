import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const sha256Contract = await hre.helpers.deploy({
    hre,
    newContractName: 'SHA256',
    passHubInConstructor: false,
    setContractInHub: false,
  });

  await hre.deployments.execute(
    'HashingProxy',
    { from: deployer, log: true },
    'setContractAddress',
    1,
    sha256Contract.address,
  );
};

export default func;
func.tags = ['SHA256'];
