import fs from 'fs';

import hre from 'hardhat';

async function main() {
  const nodeList = {};
  const OldStakingStorage = await hre.ethers.getContractAt(
    hre.helpers.getAbi('StakingStorage'),
    hre.helpers.contractDeployments.contracts['StakingStorage'].evmAddress,
  );

  const ProfileStorage = await hre.ethers.getContractAt(
    hre.helpers.getAbi('ProfileStorage'),
    hre.helpers.contractDeployments.contracts['ProfileStorage'].evmAddress,
  );

  const NodeOperatorFeesStorage = await hre.ethers.getContractAt(
    hre.helpers.getAbi('NodeOperatorFeesStorage'),
    hre.helpers.contractDeployments.contracts['NodeOperatorFeesStorage'].evmAddress,
  );

  console.log('Getting current next identityId from IdentityStorage...');
  const storageSlot = await hre.ethers.provider.getStorageAt(
    hre.helpers.contractDeployments.contracts['IdentityStorage'].evmAddress,
    0,
  );
  const variableSlot = storageSlot.slice(storageSlot.length - 58, storageSlot.length - 40);
  console.log(`Storage slot 0: ${storageSlot}`);
  console.log(`Variable slot: ${variableSlot}`);
  const nextIdentityId = parseInt(variableSlot, 16);
  console.log(`Latest identityId: ${nextIdentityId - 1}`);

  for (let identityId = 1; identityId < nextIdentityId; identityId += 1) {
    console.log(`Getting old stake of node: ${identityId}`);
    const oldNodeStake = await OldStakingStorage.totalStakes(identityId);
    const oldNodeFee = await NodeOperatorFeesStorage.getOperatorFees(identityId);

    const accumulatedOperatorFee = await ProfileStorage.getAccumulatedOperatorFee(identityId);
    const accumulatedOperatorFeeWithdrawalAmount = await ProfileStorage.getAccumulatedOperatorFeeWithdrawalAmount(
      identityId,
    );

    const accumulatedOperatorFeeWithdrawalTimestamp = await ProfileStorage.getAccumulatedOperatorFeeWithdrawalTimestamp(
      identityId,
    );

    const newNodeData = {
      identityId: identityId,
      stake: oldNodeStake.toString(),
      operatorFee: oldNodeFee.toString(),
      accumulatedOperatorFee: accumulatedOperatorFee.toString(),
      accumulatedOperatorFeeWithdrawalAmount: accumulatedOperatorFeeWithdrawalAmount.toString(),
      accumulatedOperatorFeeWithdrawalTimestamp: accumulatedOperatorFeeWithdrawalTimestamp.toString(),
    };
    console.log(newNodeData);
    nodeList[identityId] = newNodeData;
  }

  fs.writeFileSync(`migration_${hre.network.name}_v6_data.json`, JSON.stringify(nodeList, null, 4));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
