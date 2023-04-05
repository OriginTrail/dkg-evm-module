import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const { redeployedContracts, redeployedAssetStorageContracts, contractsForReinitialization } = hre.helpers;

  console.log(`New or redeployed contracts: ${JSON.stringify(redeployedContracts)}`);
  console.log(`New or redeployed Asset Storage contracts: ${JSON.stringify(redeployedAssetStorageContracts)}`);
  console.log(`Contracts that need to be reinitialized: ${JSON.stringify(contractsForReinitialization)}`);

  if (!['otp_testnet', 'otp_mainnet'].includes(hre.network.name)) {
    const hubControllerAddress = hre.helpers.contractDeployments.contracts['HubController'].evmAddress;
    const HubController = await hre.ethers.getContractAt('HubController', hubControllerAddress, deployer);

    const hubAddress = hre.helpers.contractDeployments.contracts['Hub'].evmAddress;
    const Hub = await hre.ethers.getContractAt('Hub', hubAddress, deployer);
    const hubOwner = await Hub.owner();

    if (hubOwner != HubController.address) {
      const transferOwneshipTx = await Hub.transferOwnership(HubController.address);
      await transferOwneshipTx.wait();
    }

    const setAndReinitializeContractsTx = await HubController.setAndReinitializeContracts(
      redeployedContracts,
      redeployedAssetStorageContracts,
      contractsForReinitialization,
    );
    await setAndReinitializeContractsTx.wait();
  }
};

export default func;
func.runAtTheEnd = true;
