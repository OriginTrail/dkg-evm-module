import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const isDeployed = hre.helpers.isDeployed('Log2PLDSF');

  const Log2PLDSF = await hre.helpers.deploy({
    newContractName: 'Log2PLDSF',
    dependencies: func.dependencies,
  });

  if (!isDeployed) {
    const hubControllerAddress = hre.helpers.contractDeployments.contracts['HubController'].evmAddress;
    const HubController = await hre.ethers.getContractAt('HubController', hubControllerAddress, deployer);

    const ScoringProxyAbi = hre.helpers.getAbi('ScoringProxy');
    const ScoringProxyInterface = new hre.ethers.utils.Interface(ScoringProxyAbi);
    const scoringProxyAddress = hre.helpers.contractDeployments.contracts['ScoringProxy'].evmAddress;

    const setContractTx = await HubController.forwardCall(
      scoringProxyAddress,
      ScoringProxyInterface.encodeFunctionData('setContractAddress', [1, Log2PLDSF.address]),
    );
    await setContractTx.wait();
  }
};

export default func;
func.tags = ['Log2PLDSF'];
func.dependencies = ['Hub', 'HashingProxy', 'SHA256', 'ScoringProxy', 'ParametersStorage'];
