import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  if (hre.network.name === 'hardhat') {
    hre.helpers.resetDeploymentsJson();
  }

  if (!hre.helpers.isDeployed('Hub')) {
    const Hub = await hre.deployments.deploy('Hub', { from: deployer, log: true });

    hre.helpers.updateDeploymentsJson('Hub', Hub.address);
  }

  if (!hre.helpers.isDeployed('HubController')) {
    let previousHubControllerAddress;
    if (hre.helpers.inConfig('HubController')) {
      previousHubControllerAddress = hre.helpers.contractDeployments.contracts['HubController'].evmAddress;
    } else {
      previousHubControllerAddress = null;
    }

    const HubController = await hre.helpers.deploy({
      newContractName: 'HubController',
      setContractInHub: false,
    });

    if (previousHubControllerAddress == null) {
      const hubAddress = hre.helpers.contractDeployments.contracts['Hub'].evmAddress;
      const Hub = await hre.ethers.getContractAt('Hub', hubAddress, deployer);

      const transferHubOwneshipTx = await Hub.transferOwnership(HubController.address);
      await transferHubOwneshipTx.wait();
    } else {
      const previousHubController = await hre.ethers.getContractAt(
        'HubController',
        previousHubControllerAddress,
        deployer,
      );

      const transferHubOwneshipTx = await previousHubController.transferHubOwnership(HubController.address);
      await transferHubOwneshipTx.wait();
    }

    console.log(`Hub ownership transferred to HubController (${HubController.address})`);
  }
};

export default func;
func.tags = ['Hub'];
