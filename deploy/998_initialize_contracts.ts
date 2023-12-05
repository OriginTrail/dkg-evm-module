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

  const noChangesWereMade = [
    newContracts,
    newAssetStorageContracts,
    setParametersEncodedData,
    newHashFunctions,
    newScoreFunctions,
  ].every((arr) => arr.length === 0);

  if (
    !noChangesWereMade &&
    (hre.network.config.environment === 'testnet' || hre.network.config.environment == 'mainnet')
  ) {
    const hubControllerAddress = hre.helpers.contractDeployments.contracts['HubController'].evmAddress;
    const multiSigWalletAddress = process.env['MULTISIG_' + hre.network.name.toUpperCase()];

    if (multiSigWalletAddress === undefined) {
      throw new Error(`MULTISIG_ADDRESS should be defined in the environment for the ${hre.network.name} blockchain!`);
    }

    console.log(`HubController: ${hubControllerAddress}`);
    console.log(`MultiSigWallet: ${multiSigWalletAddress}`);

    const HubController = await hre.ethers.getContractAt('HubController', hubControllerAddress, deployer);
    const MultiSigWallet = await hre.ethers.getContractAt('MultiSigWallet', multiSigWalletAddress, deployer);

    console.log(`New or redeployed contracts: ${JSON.stringify(newContracts)}`);
    console.log(`New or redeployed Asset Storage contracts: ${JSON.stringify(newAssetStorageContracts)}`);
    console.log(`Initialized contracts: ${JSON.stringify(contractsForReinitialization)}`);
    console.log(`Encoded data for parameters settings: ${JSON.stringify(setParametersEncodedData)}`);
    console.log(`New or redeployed hash functions set in the proxy: ${JSON.stringify(newHashFunctions)}`);
    console.log(`New or redeployed score functions set in the proxy: ${JSON.stringify(newScoreFunctions)}`);

    // Prepare the data for the setAndReinitializeContracts function call
    const encodedData = HubController.interface.encodeFunctionData('setAndReinitializeContracts', [
      newContracts,
      newAssetStorageContracts,
      newHashFunctions,
      newScoreFunctions,
      contractsForReinitialization,
      setParametersEncodedData,
    ]);

    MultiSigWallet.on('Submission', (transactionId) => {
      console.log(`[Multisig] HubController.setAndReinitializeContracts Transaction ID: ${transactionId}`);
    });

    // Submit the transaction to the multisig wallet
    const submitTx = await MultiSigWallet.submitTransaction(hubControllerAddress, 0, encodedData);
    await submitTx.wait();

    // After that, other owners of the multisig wallet should use 'confirmTransaction' function.
    // When needed confirmations amount is reached, 'executeTransaction' should be executed.
  }
};

export default func;
func.tags = ['v1', 'v2'];
func.runAtTheEnd = true;
