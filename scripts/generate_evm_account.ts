import hre from 'hardhat';

async function main() {
  const wallet = hre.helpers.generateEvmWallet();

  console.log('Address:', wallet.address);
  console.log('Mnemonic:', wallet.mnemonic);
  console.log('Private Key:', wallet.privateKey);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
