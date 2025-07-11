import { ethers } from 'ethers';

async function main() {
  const RPC_URL =
    process.env.RPC_URL ||
    'https://base-mainnet.g.alchemy.com/v2/rpFu7NQWhrH4wPqqlbNhg';
  const provider = new ethers.JsonRpcProvider(RPC_URL);

  const txHash =
    '0xa4cf6dfaee20c5458eace7c6f396a0a7b4fd7ccf5e3ac2aab8c52418716cd472';

  console.log(`[+] Fetching transaction details for: ${txHash}`);
  const tx = await provider.getTransaction(txHash);

  if (!tx) {
    console.error('[-] Transaction not found!');
    return;
  }

  console.log('\n--- TRANSACTION DETAILS ---');
  console.log(`From:     ${tx.from}`);
  console.log(`To:       ${tx.to}`);
  console.log(`Data:     ${tx.data}`);
  console.log(`--------------------------`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
