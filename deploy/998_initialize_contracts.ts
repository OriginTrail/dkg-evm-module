import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const { redeployedContracts, redeployedAssetStorageContracts, contractsForReinitialization } = hre.helpers;

  if (!['hardhat', 'otp_testnet', 'otp_mainnet'].includes(hre.network.name)) {
    const hubControllerAddress = hre.helpers.contractDeployments.contracts['HubController'].evmAddress;
    const HubController = await hre.ethers.getContractAt('HubController', hubControllerAddress, deployer);

    const setAndReinitializeContractsTx = await HubController.setAndReinitializeContracts(
      redeployedContracts,
      redeployedAssetStorageContracts,
      contractsForReinitialization,
    );
    await setAndReinitializeContractsTx.wait();
  } else if (hre.network.name !== 'hardhat') {
    console.log(`New or redeployed contracts: ${JSON.stringify(redeployedContracts)}`);
    console.log(`New or redeployed Asset Storage contracts: ${JSON.stringify(redeployedAssetStorageContracts)}`);
    console.log(`Contracts that need to be reinitialized: ${JSON.stringify(contractsForReinitialization)}`);
  }
};

export default func;
func.runAtTheEnd = true;
