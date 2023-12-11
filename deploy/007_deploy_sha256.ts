import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const isDeployed = hre.helpers.isDeployed('SHA256');

  const SHA256 = await hre.helpers.deploy({
    newContractName: 'SHA256',
    passHubInConstructor: false,
  });

  if (!isDeployed) {
    if (hre.network.config.environment === 'development') {
      const { deployer } = await hre.getNamedAccounts();

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
    } else {
      hre.helpers.newHashFunctions.push(SHA256.address);
    }
  }
};

export default func;
func.tags = ['SHA256', 'v1'];
func.dependencies = ['HashingProxy'];
