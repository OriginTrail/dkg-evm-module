import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const isDeployed = hre.helpers.isDeployed('SHA256');

  const SHA256 = await hre.helpers.deploy({
    newContractName: 'SHA256',
    passHubInConstructor: false,
    setContractInHub: false,
  });

  if (!isDeployed) {
    const Hub = await hre.ethers.getContractAt(
      'Hub',
      hre.helpers.contractDeployments.contracts['Hub'].evmAddress,
      deployer,
    );
    const hashingProxyAddress = await Hub.getContractAddress('HashingProxy');
    const HashingProxy = await hre.ethers.getContractAt('HashingProxy', hashingProxyAddress, deployer);
    const setContractTx = await HashingProxy.setContractAddress(1, SHA256.address);
    await setContractTx.wait();
  }
};

export default func;
func.tags = ['SHA256'];
func.dependencies = ['HashingProxy'];
