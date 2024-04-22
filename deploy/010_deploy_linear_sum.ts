import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const isDeployed = hre.helpers.isDeployed('LinearSum');

  const LinearSum = await hre.helpers.deploy({
    newContractName: 'LinearSum',
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
        ScoringProxyInterface.encodeFunctionData('setContractAddress', [2, LinearSum.address]),
      );
      await setContractTx.wait();
    } else {
      hre.helpers.newScoreFunctions.push(LinearSum.address);
    }
  }

  await hre.helpers.updateContractParameters('LinearSum', LinearSum);
};

export default func;
func.tags = ['Log2PLDSF', 'LinearSum', 'v2'];
func.dependencies = ['HubV2', 'HashingProxy', 'SHA256', 'ScoringProxy', 'ParametersStorage'];
