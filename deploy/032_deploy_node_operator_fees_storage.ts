import { BigNumberish } from 'ethers';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

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
    hre.helpers.contractDeployments.contracts['NodeOperatorFeesStorage']?.evmAddress;
  let onofs = null;
  if (oldNodeOperatorFeesStorageAddress) {
    onofs = await hre.ethers.getContractAt('NodeOperatorFeesStorage', oldNodeOperatorFeesStorageAddress);
  }

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

    let operatorFees: { feePercentage: BigNumberish; effectiveDate: number }[] = [];

    if (onofs) {
      const oldContractOperatorFees = await onofs.getOperatorFees(identityId);

      console.log(`Old operatorFees in the old NodeOperatorFeesStorage: ${JSON.stringify(oldContractOperatorFees)}`);

      if (oldContractOperatorFees.length != 0) {
        const fees = oldContractOperatorFees.map((x: BigNumberish[]) => {
          return { feePercentage: x[0], effectiveDate: Number(x[1].toString()) };
        });

        if (hre.network.name.startsWith('gnosis')) {
          operatorFees = operatorFees.concat(fees);
        } else {
          oldOperatorFees.push({
            identityId,
            fees,
          });
          continue;
        }
      }
    }

    let stakingStorageSource = false;
    if (operatorFees.length == 0) {
      const activeOperatorFeePercentage = await StakingStorage.operatorFees(identityId);

      console.log(`Active operatorFee in the StakingStorage: ${activeOperatorFeePercentage.toString()}%`);

      if (!activeOperatorFeePercentage.eq(0)) {
        operatorFees.push({
          feePercentage: activeOperatorFeePercentage,
          effectiveDate: timestampNow,
        });
        stakingStorageSource = true;
      }
    }

    if (nofcs !== null) {
      const pendingOperatorFee = await nofcs.operatorFeeChangeRequests(identityId);

      if (Number(pendingOperatorFee.timestamp.toString() == 0)) {
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
        continue;
      }

      console.log(`Pending operatorFee in the NodeOperatorFeeChangesStorage: ${pendingOperatorFee.newFee.toString()}%`);

      const exists = operatorFees.some(
        (obj) =>
          Number(obj.feePercentage.toString()) === Number(pendingOperatorFee.newFee.toString()) &&
          Number(obj.effectiveDate.toString()) === Number(pendingOperatorFee.timestamp.toString()),
      );

      if (exists) {
        console.log(`Pending operatorFee is already a part of the fees array from old NodeOperatorFeesStorage`);
        oldOperatorFees.push({
          identityId,
          fees: operatorFees,
        });
        continue;
      }

      if (
        (stakingStorageSource &&
          Number(pendingOperatorFee.timestamp.toString()) < Number(operatorFees[0].effectiveDate.toString())) ||
        (operatorFees.length == 1 && Number(operatorFees[0].effectiveDate.toString()) == 1716291685)
      ) {
        operatorFees[0].effectiveDate = Number(pendingOperatorFee.timestamp.toString()) - 1;
      }

      operatorFees.push({
        feePercentage: pendingOperatorFee.newFee,
        effectiveDate: Number(pendingOperatorFee.timestamp.toString()),
      });

      operatorFees.sort((a, b) => a.effectiveDate - b.effectiveDate);
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
  const totalChunks = Math.ceil(oldOperatorFees.length / chunkSize);

  console.log(`Starting migration of operator fees for ${oldOperatorFees.length} nodes...`);
  for (let i = 0; i < oldOperatorFees.length; i += chunkSize) {
    const chunk = oldOperatorFees.slice(i, i + chunkSize);
    const chunkNumber = Math.floor(i / chunkSize) + 1;
    const percentageDone = ((chunkNumber / totalChunks) * 100).toFixed(2);
    console.log(
      `Processing chunk ${chunkNumber} out of ${totalChunks} (starting at index ${i}):`,
      JSON.stringify(chunk),
    );
    console.log(`Percentage done: ${percentageDone}%`);

    const tx = await NodeOperatorFeesStorage.migrateOldOperatorFees(chunk);
    await tx.wait();
  }
};

export default func;
func.tags = ['NodeOperatorFeesStorage', 'v2'];
func.dependencies = ['HubV2', 'ContentAssetStorageV2', 'StakingStorage', 'ShardingTableV2', 'IdentityStorage'];
