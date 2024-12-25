import hre from 'hardhat';

async function main() {
  const Migrator = await hre.ethers.getContractAt(
    hre.helpers.getAbi('Migrator'),
    hre.helpers.contractDeployments.contracts['Migrator'].evmAddress,
  );

  console.log('Calling initiateDelegatorsMigration');
  const tx = await Migrator.initiateDelegatorsMigration();
  await tx.wait();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
