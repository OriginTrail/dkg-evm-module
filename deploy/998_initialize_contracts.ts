import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const {
    newContracts,
    newAssetStorageContracts,
    contractsForReinitialization,
    setParametersEncodedData,
    newHashFunctions,
    newScoreFunctions,
  } = hre.helpers;

  if (hre.network.name !== 'hardhat') {
    const hubControllerAddress = hre.helpers.contractDeployments.contracts['HubController'].evmAddress;

    console.log(`HubController: ${hubControllerAddress}`);

    const HubController = await hre.ethers.getContractAt('HubController', hubControllerAddress, deployer);

    console.log(`New or redeployed contracts: ${JSON.stringify(newContracts)}`);
    console.log(`New or redeployed Asset Storage contracts: ${JSON.stringify(newAssetStorageContracts)}`);
    console.log(`Initialized contracts: ${JSON.stringify(contractsForReinitialization)}`);
    console.log(`Encoded data for parameters settings: ${JSON.stringify(setParametersEncodedData)}`);
    console.log(`New or redeployed hash functions set in the proxy: ${JSON.stringify(newHashFunctions)}`);
    console.log(`New ot redeployed score functions set in the proxy: ${JSON.stringify(newScoreFunctions)}`);

    const setAndReinitializeContractsTx = await HubController.setAndReinitializeContracts(
      newContracts,
      newAssetStorageContracts,
      contractsForReinitialization,
      setParametersEncodedData,
      newHashFunctions,
      newScoreFunctions,
    );
    await setAndReinitializeContractsTx.wait();
  }
};

export default func;
func.runAtTheEnd = true;
