import { ethers } from 'ethers';

async function main() {
  const RPC_URL =
    process.env.RPC_URL ||
    'https://base-mainnet.g.alchemy.com/v2/rpFu7NQWhrH4wPqqlbNhg';
  const provider = new ethers.JsonRpcProvider(RPC_URL);

  // This is the common "computed" key from all the errors.
  const commonComputedKey =
    '0x5576079495044a711943b03b94f522d619826d2b6d62063f6d6db0560d665a32';

  // Let's take the first failing transaction from the log to see its 'from' address.
  const txHash =
    '0xa4cf6dfaee20c5458eace7c6f396a0a7b4fd7ccf5e3ac2aab8c52418716cd472';

  console.log(`[+] Fetching transaction: ${txHash}`);
  const tx = await provider.getTransaction(txHash);

  if (!tx) {
    console.error('[-] Transaction not found!');
    return;
  }

  const senderAddress = tx.from;
  console.log(`[+] Sender address (tx.from): ${senderAddress}`);

  const computedKeyForSender = ethers
    .keccak256(ethers.solidityPacked(['address'], [senderAddress]))
    .toLowerCase();

  console.log(`\n--- Verification ---`);
  console.log(`[?] Key from logs:       ${commonComputedKey}`);
  console.log(`[!] Key from tx.from:    ${computedKeyForSender}`);

  if (commonComputedKey === computedKeyForSender) {
    console.log(
      `\n✅ The common computed key belongs to the address: ${senderAddress}`,
    );
    console.log(
      `This address seems to be the sender for many of the failed transactions. It could be a proxy or a relayer contract.`,
    );
  } else {
    console.log(
      `\n❌ The address ${senderAddress} does NOT produce the common key. This is very strange.`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
