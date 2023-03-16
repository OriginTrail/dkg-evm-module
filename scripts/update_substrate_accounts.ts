import hre from 'hardhat';

async function main() {
  for (const contract in hre.helpers.contractDeployments.contracts) {
    const evmAddress = hre.helpers.contractDeployments.contracts[contract].evmAddress;
    hre.helpers.contractDeployments.contracts[contract].substrateAddress = hre.helpers.convertEvmWallet(evmAddress);
  }

  hre.helpers.saveDeploymentsJson('deployments');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
