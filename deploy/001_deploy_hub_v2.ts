import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  if (
    !hre.helpers.isDeployed('Hub') ||
    (hre.helpers.contractDeployments.contracts['Hub'].version !== undefined &&
      !hre.helpers.contractDeployments.contracts['Hub'].version.startsWith('1.'))
  ) {
    if (hre.network.config.environment === 'development') {
      hre.helpers.resetDeploymentsJson();
      console.log('Hardhat deployments config reset.');
    }

    if (!hre.helpers.isDeployed('Hub')) {
      console.log('Deploying Hub V2...');

      const Hub = await hre.deployments.deploy('Hub', { contract: 'HubV2', from: deployer, log: true });

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      hre.helpers.updateDeploymentsJson('Hub', 'Hub', Hub.address, Hub.receipt!.blockNumber);
    }
  }

  // New HubController should be manually deployed for testnet/mainnet:
  // 1. Deploy HubController contract using software wallet.
  // 2. Transfer ownership of the Hub to the new HubController, using transferHubOwnership function in the old HubController.
  // 3. Transfer ownership of the new HubController to the MultiSig Wallet.
  // 4. Update address of new HubController to deployments/otp_{testnet/mainnet}_contracts.json and commit the change
  // 5. Add software burner wallet that will be used for redeployment of other contracts to the MultiSig (remove after redeployment).
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

    if (previousHubControllerAddress === null) {
      const hubAddress = hre.helpers.contractDeployments.contracts['Hub'].evmAddress;
      const Hub = await hre.ethers.getContractAt('Hub', hubAddress, deployer);

      const hubOwner = await Hub.owner();

      if (deployer.toLowerCase() === hubOwner.toLowerCase()) {
        const transferHubOwneshipTx = await Hub.transferOwnership(HubController.address);
        await transferHubOwneshipTx.wait();

        console.log(`Hub ownership transferred to HubController (${HubController.address})`);
      }
    } else {
      const previousHubController = await hre.ethers.getContractAt(
        'HubController',
        previousHubControllerAddress,
        deployer,
      );

      const previousHubControllerOwner = await previousHubController.owner();

      if (deployer.toLowerCase() === previousHubControllerOwner.toLowerCase()) {
        const transferHubOwneshipTx = await previousHubController.transferHubOwnership(HubController.address);
        await transferHubOwneshipTx.wait();

        console.log(`Hub ownership transferred to HubController (${HubController.address})`);
      }
    }
  }
};

export default func;
func.tags = ['HubV2', 'v2'];
