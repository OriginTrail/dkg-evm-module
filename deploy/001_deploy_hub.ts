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

  if (!hre.helpers.isDeployed('TraceLabsMultiSigWallet') && ['otp_testnet', 'otp_mainnet'].includes(hre.network.name)) {
    await hre.helpers.deploy({
      newContractName: 'TraceLabsMultiSigWallet',
      passHubInConstructor: false,
    });
  }

  if (!hre.helpers.isDeployed('HubController')) {
    const HubController = await hre.helpers.deploy({
      newContractName: 'HubController',
      setContractInHub: false,
    });

    const hubAddress = hre.helpers.contractDeployments.contracts['Hub'].evmAddress;
    const Hub = await hre.ethers.getContractAt('Hub', hubAddress, deployer);
    const hubOwner = await Hub.owner();

    if (hubOwner != HubController.address) {
      const transferHubOwneshipTx = await Hub.transferOwnership(HubController.address);
      await transferHubOwneshipTx.wait();

      console.log(`Hub ownership transferred to HubController (${HubController.address})`);
    }

    if (['otp_testnet', 'otp_mainnet'].includes(hre.network.name)) {
      const hubControllerOwner = await HubController.owner();
      const traceLabsMultiSigWalletAddress =
        hre.helpers.contractDeployments.contracts['TraceLabsMultiSigWallet'].evmAddress;

      if (hubControllerOwner != traceLabsMultiSigWalletAddress) {
        const transferHubControllerOwnershipTx = await HubController.transferOwnership(traceLabsMultiSigWalletAddress);
        await transferHubControllerOwnershipTx.wait();

        console.log(
          `HubController ownership transferred to TraceLabsMultiSigWallet (${traceLabsMultiSigWalletAddress})`,
        );
      }
    }
  }
};

export default func;
func.tags = ['Hub'];
