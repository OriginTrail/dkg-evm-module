import hre from 'hardhat';

async function main() {
  const [tokenName, tokenSymbol] = process.argv.slice(2);

  if (!tokenName || !tokenSymbol) {
    console.error('Usage: npx hardhat run scripts/deployToken.js --network <network_name> <tokenName> <tokenSymbol>');
    process.exit(1);
  }

  const TokenFactory = await hre.ethers.getContractFactory('Token');
  const Token = await TokenFactory.deploy(tokenName, tokenSymbol);

  await Token.deployed();

  console.log(
    `${tokenName} ($${tokenSymbol}) token has been deployed to: ${Token.address} on the ${hre.network.name} blockchain!`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
