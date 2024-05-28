import { BigNumberish } from 'ethers';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import { NodeOperatorStructs } from '../typechain/contracts/v2/storage/NodeOperatorFeesStorage';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const isDeployed = hre.helpers.isDeployed('NodeOperatorFeesStorage');
  const isMigration = hre.helpers.contractDeployments.contracts['NodeOperatorFeesStorage']?.migration || false;

  if (isDeployed && !isMigration) {
    return;
  }

  const oldOperatorFees = [];
  const timestampNow = (await hre.ethers.provider.getBlock('latest')).timestamp;

  const { deployer } = await hre.getNamedAccounts();

  const oldNodeOperatorFeesStorageAddress =
    hre.helpers.contractDeployments.contracts['NodeOperatorFeesStorage'].evmAddress;
  const OldNodeOperatorFeesStorage = await hre.ethers.getContractAt(
    'NodeOperatorFeesStorage',
    oldNodeOperatorFeesStorageAddress,
  );

  const nofcsAddress = hre.helpers.contractDeployments.contracts['NodeOperatorFeeChangesStorage']?.evmAddress;
  let nofcs = null;
  if (nofcsAddress) {
    const abi = hre.helpers.getAbi('LegacyNodeOperatorFeeChangesStorage');
    nofcs = await hre.ethers.getContractAt(abi, nofcsAddress, deployer);
  }

  const stakingStorageAddress = hre.helpers.contractDeployments.contracts['StakingStorage'].evmAddress;
  const StakingStorage = await hre.ethers.getContractAt('StakingStorage', stakingStorageAddress, deployer);

  const storageLayout = {
    astId: 1238,
    contract: 'IdentityStorageFlattened.sol:IdentityStorage',
    label: '_identityId',
    offset: 20,
    slot: 0,
    type: 't_uint72',
  };
  const storageVariableType = {
    t_uint72: {
      encoding: 'inplace',
      label: 'uint72',
      numberOfBytes: 9,
    },
  };

  console.log('Getting current next identityId from IdentityStorage...');
  const storageSlot = await hre.ethers.provider.getStorageAt(
    hre.helpers.contractDeployments.contracts['IdentityStorage'].evmAddress,
    0,
  );
  const variableSlot = storageSlot.slice(
    storageSlot.length -
      2 *
        (storageLayout.offset +
          storageVariableType[storageLayout.type as keyof typeof storageVariableType].numberOfBytes),
    storageSlot.length - storageLayout.offset * 2,
  );
  console.log(`Storage slot ${storageLayout.slot}: ${storageSlot}`);
  console.log(`Variable slot: ${variableSlot}`);
  const nextIdentityId = parseInt(variableSlot, 16);
  console.log(`Current next identityId: ${nextIdentityId}`);

  console.log(`Starting migration of the old operator fees... Latest identityId: ${nextIdentityId - 1}`);
  for (let identityId = 1; identityId < nextIdentityId; identityId++) {
    console.log(`--------------------------------------------------------`);
    console.log(`IdentityId: ${identityId}`);

    const operatorFees: NodeOperatorStructs.OperatorFeeStruct[] = [];

    const oldContractOperatorFees = await OldNodeOperatorFeesStorage.getOperatorFees(identityId);

    console.log(`Old operatorFees in the old NodeOperatorFeesStorage: ${JSON.stringify(oldContractOperatorFees)}`);

    if (oldContractOperatorFees.length != 0) {
      oldOperatorFees.push({
        identityId,
        fees: oldContractOperatorFees.map((x: BigNumberish[]) => {
          return { feePercentage: x[0], effectiveDate: x[1] };
        }),
      });
      continue;
    }

    const activeOperatorFeePercentage = await StakingStorage.operatorFees(identityId);

    console.log(`Active operatorFee in the StakingStorage: ${activeOperatorFeePercentage.toString()}%`);

    if (!activeOperatorFeePercentage.eq(0)) {
      operatorFees.push({
        feePercentage: activeOperatorFeePercentage,
        effectiveDate: timestampNow,
      });
    }

    if (nofcs !== null) {
      const pendingOperatorFee = await nofcs.operatorFeeChangeRequests(identityId);

      console.log(`Pending operatorFee in the NodeOperatorFeeChangesStorage: ${pendingOperatorFee.newFee.toString()}%`);

      if (!pendingOperatorFee.timestamp.eq(0)) {
        if (operatorFees.length > 0 && pendingOperatorFee.timestamp < operatorFees[0].effectiveDate) {
          operatorFees[0].effectiveDate = pendingOperatorFee.timestamp - 1;
        }

        operatorFees.push({
          feePercentage: pendingOperatorFee.newFee,
          effectiveDate: pendingOperatorFee.timestamp,
        });
      }
    }

    console.log(`--------------------------------------------------------`);

    if (operatorFees.length > 0) {
      oldOperatorFees.push({
        identityId,
        fees: operatorFees,
      });
    } else {
      oldOperatorFees.push({
        identityId,
        fees: [{ feePercentage: 0, effectiveDate: timestampNow }],
      });
    }
  }

  delete hre.helpers.contractDeployments.contracts['NodeOperatorFeeChangesStorage'];

  console.log(`Full list of migrated operator fees: ${JSON.stringify(oldOperatorFees)}`);

  const NodeOperatorFeesStorage = await hre.helpers.deploy({
    newContractName: 'NodeOperatorFeesStorage',
    additionalArgs: [timestampNow + 86400],
  });

  const chunkSize = 10;
  const encodedDataArray: string[] = oldOperatorFees.reduce<string[]>((acc, _, currentIndex, array) => {
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
func.dependencies = ['HubV2', 'ContentAssetStorageV2', 'StakingStorage', 'ShardingTableV2'];
