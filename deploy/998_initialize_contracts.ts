import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { HUB_OWNERS, NETWORK_HUBS } from '../constants/simulation-constants';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
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

  console.log(`New or redeployed contracts: ${JSON.stringify(newContracts)}`);
  console.log(
    `New or redeployed Asset Storage contracts: ${JSON.stringify(newAssetStorageContracts)}`,
  );
  console.log(
    `New or redeployed hash functions set in the proxy: ${JSON.stringify(newHashFunctions)}`,
  );
  console.log(
    `New or redeployed score functions set in the proxy: ${JSON.stringify(newScoreFunctions)}`,
  );
  console.log(
    `Initialized contracts: ${JSON.stringify(contractsForReinitialization)}`,
  );
  console.log(
    `Encoded data for parameters settings: ${JSON.stringify(setParametersEncodedData)}`,
  );

  if (
    !noChangesWereMade &&
    !['development'].includes(hre.network.config.environment)
  ) {
    // Get Hub address from hardhat-deploy registry (where we registered it in 000_setup_existing_hub.ts)
    const hubDeployment = await hre.deployments.get('Hub');
    const hubAddress = hubDeployment.address;

    const Hub = await hre.ethers.getContractAt('Hub', hubAddress);

    const hubOwner = HUB_OWNERS[hubAddress as keyof typeof HUB_OWNERS];
    if (!hubOwner) {
      throw new Error(`Hub owner not found for Hub address: ${hubAddress}`);
    }
    console.log(
      `[998 DEPLOYMENT] Hub owner: ${hubOwner} for Hub address: ${hubAddress} on network: ${NETWORK_HUBS[hubAddress as keyof typeof NETWORK_HUBS]}`,
    );

    // Fund the hub owner account with ETH for transaction fees
    const { deployer } = await hre.getNamedAccounts();
    const deployerSigner = await hre.ethers.getSigner(deployer);
    const fundingAmount = hre.ethers.parseEther('1.0'); // 1 ETH should be enough

    console.log(
      `[998 DEPLOYMENT] Funding hub owner ${hubOwner} with ${hre.ethers.formatEther(fundingAmount)} ETH...`,
    );
    await deployerSigner.sendTransaction({
      to: hubOwner,
      value: fundingAmount,
    });

    await hre.network.provider.send('hardhat_impersonateAccount', [hubOwner]);

    const setAndReinitializeContractsTx = await Hub.connect(
      await hre.ethers.getSigner(hubOwner),
    ).setAndReinitializeContracts(
      newContracts,
      newAssetStorageContracts,
      contractsForReinitialization,
      setParametersEncodedData,
    );
    await setAndReinitializeContractsTx.wait();

    await hre.network.provider.send('hardhat_stopImpersonatingAccount', [
      hubOwner,
    ]);
  }
};

export default func;
func.runAtTheEnd = true;
