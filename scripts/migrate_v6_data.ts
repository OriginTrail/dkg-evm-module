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
  const AskStorage = await hre.ethers.getContractAt(
    hre.helpers.getAbi('AskStorage'),
    hre.helpers.contractDeployments.contracts['AskStorage'].evmAddress,
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
  for (let identityId = 1; identityId < nextIdentityId; identityId += 1) {
    console.log(`Migrating node with identity id: ${identityId}`);

    console.log('Calling migrateNodeData');
    tx = await Migrator.migrateNodeData(identityId);
    await tx.wait();

    console.log('Calling insertNodeInShardingTable');
    tx = await Migrator.insertNodeInShardingTable(identityId);
    await tx.wait();

    console.log(
      `------- AskStorage state after Node ${identityId} migration -------`,
    );
    const [
      nodeStake,
      nodeAsk,
      prevTotalActiveStake,
      totalActiveStake,
      prevPricePerKbEpoch,
      pricePerKbEpoch,
      bounds,
    ] = await Promise.all([
      StakingStorage.getNodeStake(identityId),
      ProfileStorage.getAsk(identityId),
      AskStorage.prevTotalActiveStake(),
      AskStorage.totalActiveStake(),
      AskStorage.getPrevPricePerKbEpoch(),
      AskStorage.getPricePerKbEpoch(),
      AskStorage.getAskBounds(),
    ]);

    const isWithinBounds =
      nodeAsk * BigInt(1e18) > bounds[0] && nodeAsk * BigInt(1e18) < bounds[1];

    console.log(`Node Stake: ${Number(nodeStake) / 1e18}`);
    console.log(`Node Ask: ${Number(nodeAsk) / 1e18}`);
    console.log(`Ask Lower Bound: ${Number(bounds[0]) / 1e36}`);
    console.log(`Ask Upper Bound: ${Number(bounds[1]) / 1e36}`);
    console.log(`Is node within bounds: ${isWithinBounds}`);
    console.log(`Previous Price: ${Number(prevPricePerKbEpoch) / 1e18}`);
    console.log(`Price: ${Number(pricePerKbEpoch) / 1e18}`);
    console.log(
      `Previous Total Active Stake: ${Number(prevTotalActiveStake) / 1e18}`,
    );
    console.log(`Total Active Stake: ${Number(totalActiveStake) / 1e18}`);
    console.log(`-------------------------------------------------------`);
  }

  // Global data migration
  const oldTotalStake = await Migrator.oldTotalStake();

  console.log(`Total old stake: ${Number(oldTotalStake) / 1e18} TRAC`);

  if (oldTotalStake > 0) {
    console.log('Calling migrateGlobalData');
    tx = await Migrator.migrateGlobalData(oldTotalStake);
    await tx.wait();
  }

  // console.log('Calling transferStake');
  // tx = await Migrator.transferStake();
  // await tx.wait();

  // console.log('Calling transferOperatorFees');
  // tx = await Migrator.transferOperatorFees();
  // await tx.wait();

  // console.log('Calling transferUnpaidRewards');
  // tx = await Migrator.transferUnpaidRewards();
  // await tx.wait();

  const oldTotalUnpaidRewards = await Migrator.oldTotalUnpaidRewards();
  console.log(
    `Old total unpaid rewards: ${Number(oldTotalUnpaidRewards) / 1e18} TRAC`,
  );

  console.log('Calling initiateDelegatorsMigration');
  tx = await Migrator.initiateDelegatorsMigration();
  await tx.wait();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
