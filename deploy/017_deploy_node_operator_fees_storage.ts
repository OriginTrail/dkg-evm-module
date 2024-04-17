import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const oldOperatorFees = [];
  const timestampNow = (await hre.ethers.provider.getBlock('latest')).timestamp;

  const { deployer } = await hre.getNamedAccounts();

  const stakingStorageAddress = hre.helpers.contractDeployments.contracts['StakingStorage'].evmAddress;
  const StakingStorage = await hre.ethers.getContractAt('StakingStorage', stakingStorageAddress, deployer);

  const nofcsAddress = hre.helpers.contractDeployments.contracts['NodeOperatorFeeChangesStorage']?.evmAddress;
  let nofcs = null;
  if (nofcsAddress) {
    nofcs = await hre.ethers.getContractAt('NodeOperatorFeeChangesStorage', nofcsAddress, deployer);
  }

  if (nofcs !== null) {
    const currentIdentityId = parseInt(
      (
        await hre.ethers.provider.getStorageAt(
          hre.helpers.contractDeployments.contracts['IdentityStorage'].evmAddress,
          0,
        )
      ).slice(8, 26),
      16,
    );

    for (let i = 0; i < currentIdentityId; i++) {
      const operatorFees = [];

      const activeOperatorFeePercentage = await StakingStorage.operatorFees(i);

      if (activeOperatorFeePercentage !== 0) {
        operatorFees.push({
          feePercentage: activeOperatorFeePercentage,
          effectiveDate: timestampNow,
        });
      }

      const pendingOperatorFee = await nofcs.operatorFeeChangeRequests(i);

      if (pendingOperatorFee) {
        if (pendingOperatorFee.timestamp < operatorFees[0].effectiveDate) {
          operatorFees[0].effectiveDate = pendingOperatorFee.timestamp - 1;
        }

        operatorFees.push({
          feePercentage: pendingOperatorFee.newFee,
          effectiveDate: pendingOperatorFee.timestamp,
        });
      }

      if (operatorFees.length > 0) {
        oldOperatorFees.push({
          identityId: i,
          operatorFees,
        });
      }
    }

    delete hre.helpers.contractDeployments.contracts['NodeOperatorFeeChangesStorage'];
  }

  const NodeOperatorFeesStorage = await hre.helpers.deploy({
    newContractName: 'NodeOperatorFeesStorage',
    additionalArgs: [timestampNow + 300],
  });

  const chunkSize = 10;
  const encodedDataArray: string[] = oldOperatorFees.reduce<string[]>((acc, currentValue, currentIndex, array) => {
    if (currentIndex % chunkSize === 0) {
      // Encode and push the function data for a slice of the array
      acc.push(
        NodeOperatorFeesStorage.interface.encodeFunctionData('migrateOldOperatorFees', [
          array.slice(currentIndex, currentIndex + chunkSize),
        ]),
      );
    }
    return acc;
  }, []);

  if (hre.network.config.environment === 'development') {
    const { deployer } = await hre.getNamedAccounts();

    const hubControllerAddress = hre.helpers.contractDeployments.contracts['HubController'].evmAddress;
    const HubController = await hre.ethers.getContractAt('HubController', hubControllerAddress, deployer);

    for (let i = 0; i < encodedDataArray.length; i++) {
      const migrateOldOperatorFeesTx = await HubController.forwardCall(
        NodeOperatorFeesStorage.address,
        encodedDataArray[i],
      );
      await migrateOldOperatorFeesTx.wait();
    }
  } else {
    for (let i = 0; i < encodedDataArray.length; i++) {
      hre.helpers.setParametersEncodedData.push(['NodeOperatorFeesStorage', [encodedDataArray[i]]]);
    }
  }
};

export default func;
func.tags = ['NodeOperatorFeesStorage', 'v2'];
func.dependencies = ['HubV2'];
