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
    const hubControllerAddress = hre.helpers.contractDeployments.contracts['HubController'].evmAddress;
    const HubController = await hre.ethers.getContractAt('HubController', hubControllerAddress, deployer);

    const HashingProxyAbi = hre.helpers.getAbi('HashingProxy');
    const HashingProxyInterface = new hre.ethers.utils.Interface(HashingProxyAbi);
    const hashingProxyAddress = hre.helpers.contractDeployments.contracts['HashingProxy'].evmAddress;

    const setContractTx = await HubController.forwardCall(
      hashingProxyAddress,
      HashingProxyInterface.encodeFunctionData('setContractAddress', [1, SHA256.address]),
    );
    await setContractTx.wait();
  }
};

export default func;
func.tags = ['SHA256'];
func.dependencies = ['HashingProxy'];
