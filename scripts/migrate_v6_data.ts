import hre from 'hardhat';

async function main() {
  const Migrator = await hre.ethers.getContractAt(
    hre.helpers.getAbi('Migrator'),
    hre.helpers.contractDeployments.contracts['Migrator'].evmAddress,
  );
  const ProfileStorage = await hre.ethers.getContractAt(
    hre.helpers.getAbi('ProfileStorage'),
    hre.helpers.contractDeployments.contracts['ProfileStorage'].evmAddress,
  );
  const StakingStorage = await hre.ethers.getContractAt(
    hre.helpers.getAbi('StakingStorage'),
    hre.helpers.contractDeployments.contracts['StakingStorage'].evmAddress,
  );

  // Nodes migration
  console.log('Getting current next identityId from IdentityStorage...');
  const storageSlot = await hre.ethers.provider.getStorage(
    hre.helpers.contractDeployments.contracts['OldIdentityStorage'].evmAddress,
    0,
  );
  const variableSlot = storageSlot.slice(
    storageSlot.length - 58,
    storageSlot.length - 40,
  );
  console.log(`Storage slot 0: ${storageSlot}`);
  console.log(`Variable slot: ${variableSlot}`);
  const nextIdentityId = parseInt(variableSlot, 16);
  console.log(`Latest identityId: ${nextIdentityId - 1}`);

  let tx;
  for (let identityId = 85; identityId < nextIdentityId; identityId += 1) {
    console.log(`Migrating node with identity id: ${identityId}`);

    console.log('Calling migrateNodeData');
    tx = await Migrator.migrateNodeData(identityId);
    await tx.wait();
  }

  // Global data migration
  const batchSize = 50;
  const nodeAskStakes = [];

  for (let i = 0; i < Math.ceil((nextIdentityId - 1) / batchSize); i++) {
    const batch = Array.from(
      { length: Math.min(batchSize, nextIdentityId - 1 - i * batchSize) },
      (_, j) => i * batchSize + j + 1,
    );

    console.log(`Getting Ask-Stake for batch: ${batch}`);

    const batchResults = await Promise.all(
      batch.map(async (identityId) => {
        const [ask, stake] = await Promise.all([
          ProfileStorage.getAsk(identityId),
          StakingStorage.getNodeStake(identityId),
        ]);
        return { ask: BigInt(ask), stake: BigInt(stake) };
      }),
    );

    nodeAskStakes.push(...batchResults);
  }
  const filteredNodeAskStakes = nodeAskStakes.filter(
    ({ stake }) => stake >= 50000n,
  );
  const totalStake = filteredNodeAskStakes.reduce(
    (sum, { stake }) => sum + stake,
    0n,
  );
  const weightedAverageAskSum = filteredNodeAskStakes.reduce(
    (sum, { ask, stake }) => sum + ask * stake,
    0n,
  );

  console.log(
    `Stake-weighted Average Ask Sum: ${Number(weightedAverageAskSum) / 1e18}`,
  );
  console.log(`Total Stake: ${Number(totalStake) / 1e18}`);
  console.log(
    `Initial Price per KB/epoch: ${Number(weightedAverageAskSum / totalStake) / 1e18}`,
  );

  console.log('Calling updateAskStorage');
  tx = await Migrator.updateAskStorage(weightedAverageAskSum, totalStake);
  await tx.wait();

  const oldTotalStake = await Migrator.oldTotalStake();

  console.log(`Total old stake: ${Number(oldTotalStake) / 1e18} TRAC`);

  if (oldTotalStake > 0) {
    console.log('Calling migrateGlobalData');
    tx = await Migrator.migrateGlobalData(oldTotalStake);
    await tx.wait();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
