import hre from 'hardhat';

async function main() {
  const Migrator = await hre.ethers.getContractAt(
    hre.helpers.getAbi('Migrator'),
    hre.helpers.contractDeployments.contracts['Migrator'].evmAddress,
  );

  // Nodes migration
  console.log('Getting current next identityId from IdentityStorage...');
  const storageSlot = await hre.ethers.provider.getStorage(
    hre.helpers.contractDeployments.contracts['IdentityStorage'].evmAddress,
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
    tx = await Migrator.migrateNodeData(identityId, {
      gasLimit: 2_000_000,
    });
    await tx.wait();
  }

  // Global data migration
  const oldTotalStake = await Migrator.oldTotalStake();

  console.log(`Total old stake: ${oldTotalStake} TRAC`);

  if (oldTotalStake > 0) {
    console.log('Calling migrateGlobalData');
    tx = await Migrator.migrateGlobalData(oldTotalStake, {
      gasLimit: 2_000_000,
    });
    await tx.wait();

    // console.log('Calling transferStake');
    // tx = await Migrator.transferStake(oldTotalStake, {
    //   gasLimit: 2_000_000,
    // });
    // await tx.wait();
  }

  // console.log('Calling transferOperatorFees');
  // tx = await Migrator.transferOperatorFees({
  //   gasLimit: 2_000_000,
  // });
  // await tx.wait();

  // console.log('Calling transferUnpaidRewards');
  // tx = await Migrator.transferUnpaidRewards({
  //   gasLimit: 2_000_000,
  // });
  // await tx.wait();

  const oldTotalUnpaidRewards = await Migrator.oldTotalUnpaidRewards();
  console.log(`Old total unpaid rewards: ${oldTotalUnpaidRewards} TRAC`);

  console.log('Calling initiateDelegatorsMigration');
  tx = await Migrator.initiateDelegatorsMigration({
    gasLimit: 2_000_000,
  });
  await tx.wait();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
