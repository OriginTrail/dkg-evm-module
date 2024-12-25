import hre from 'hardhat';

async function main() {
  const Migrator = await hre.ethers.getContractAt(
    hre.helpers.getAbi('Migrator'),
    hre.helpers.contractDeployments.contracts['Migrator'].evmAddress,
  );

  let tx;
  console.log('Calling transferStake');
  tx = await Migrator.transferStake();
  await tx.wait();

  console.log('Calling transferOperatorFees');
  tx = await Migrator.transferOperatorFees();
  await tx.wait();

  console.log('Calling transferUnpaidRewards');
  tx = await Migrator.transferUnpaidRewards(1, 12);
  await tx.wait();

  const [
    oldNodesCount,
    oldStakingStorageBalance,
    oldTotalStake,
    oldOperatorFees,
    oldTotalUnpaidRewards,
  ] = await Promise.all([
    Migrator.oldNodesCount(),
    Migrator.oldStakingStorageBalance(),
    Migrator.oldTotalStake(),
    Migrator.oldOperatorFees(),
    Migrator.oldTotalUnpaidRewards(),
  ]);

  console.log(`Old nodes count: ${Number(oldNodesCount)}`);
  console.log(
    `Old StakingStorage balance: ${Number(oldStakingStorageBalance) / 1e18} TRAC (Stakes + Withdrawals)`,
  );
  console.log(`Old Total Stake: ${Number(oldTotalStake) / 1e18} TRAC`);
  console.log(`Old Operator Fees: ${Number(oldOperatorFees) / 1e18} TRAC`);
  console.log(
    `Old Total Unpaid Rewards: ${Number(oldTotalUnpaidRewards) / 1e18} TRAC`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
