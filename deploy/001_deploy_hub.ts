import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  if (hre.network.name === 'hardhat' || hre.network.name === 'bellecour_testnet') {
    hre.helpers.resetDeploymentsJson();
    console.log('Hardhat deployments config reset.');
  }

  if (!hre.helpers.isDeployed('Hub')) {
    const Hub = await hre.deployments.deploy('Hub', { from: deployer, log: true });

    hre.helpers.updateDeploymentsJson('Hub', Hub.address);
  }

  // New HubController should be manually deployed for testnet/mainnet:
  // 1. Deploy HubController contract using software wallet.
  // 2. Transfer ownership of the Hub to the new HubController, using transferHubOwnership function in the old HubController.
  // 3. Transfer ownership of the new HubController to the MultiSig Wallet.
  // 4. Update address of new HubController to deployments/otp_{testnet/mainnet}_contracts.json and commit the change
  // 5. Add software burner wallet that will be used for redeployment of other contracts to the MultiSig (remove after redeployment).
  if (!hre.helpers.isDeployed('HubController') && !['otp_testnet', 'otp_mainnet'].includes(hre.network.name)) {
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
