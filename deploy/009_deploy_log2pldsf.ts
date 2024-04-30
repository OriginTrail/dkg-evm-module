import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (hre.network.config.environment !== 'development' && !hre.network.name.startsWith('otp')) {
    return;
  }

  const isDeployed = hre.helpers.isDeployed('Log2PLDSF');

  const Log2PLDSF = await hre.helpers.deploy({
    newContractName: 'Log2PLDSF',
  });

  if (!isDeployed) {
    if (hre.network.config.environment === 'development') {
      const { deployer } = await hre.getNamedAccounts();

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
    } else {
      hre.helpers.newScoreFunctions.push(Log2PLDSF.address);
    }
  }

  await hre.helpers.updateContractParameters('Log2PLDSF', Log2PLDSF);
};

export default func;
func.tags = ['Log2PLDSF', 'v1'];
func.dependencies = ['Hub', 'HashingProxy', 'SHA256', 'ScoringProxy', 'ParametersStorage'];
