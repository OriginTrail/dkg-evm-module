import { ethers } from 'ethers';

function getDelegatorKey(address: string): string {
  // Ensure the address is a valid Ethereum address
  if (!ethers.isAddress(address)) {
    throw new Error(`Invalid Ethereum address: ${address}`);
  }

  // Mimic the Solidity function: keccak256(abi.encodePacked(delegator))
  return ethers.solidityPackedKeccak256(['address'], [address]);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length !== 1) {
    console.error(
      'Usage: npx hardhat run scripts/get_delegator_key.ts <DELEGATOR_ADDRESS>',
    );
    process.exit(1);
  }

  const delegatorAddress = args[0];

  try {
    const delegatorKey = getDelegatorKey(delegatorAddress);
    console.log(`Delegator Address: ${delegatorAddress}`);
    console.log(`Delegator Key (keccak256): ${delegatorKey}`);
  } catch (error) {
    console.error('Error:', (error as Error).message);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
