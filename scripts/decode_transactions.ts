#!/usr/bin/env ts-node
/**
 * Batch decoder for Base Mainnet transactions – TypeScript edition.
 *
 * Quick fix for TypeScript compile errors:
 *   • Requires TS 4.7+ with "module" set to "es2020" (or "nodenext") in tsconfig.json.
 *   • Slightly looser typing around csv‑parser stream.
 */
require('dotenv').config();
/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require('fs');
const path = require('path');
const csvParser = require('csv-parser');
const glob = require('glob');
const { createObjectCsvWriter } = require('csv-writer');
const ethers = require('ethers');

/* ------------------------------------------------------------------ */
/* 0. Centralised path configuration                                  */
/* ------------------------------------------------------------------ */
// Derive paths without relying on import.meta, so the script compiles with default TS settings.
const SCRIPT_DIR = path.dirname(path.resolve(process.argv[1] || '.')); // .../scripts
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..'); // repository root
const DATA_FOLDER = path.join(PROJECT_ROOT, 'data'); // ./data (create manually)
const ABIS_FOLDER = path.join(PROJECT_ROOT, 'abi'); // ./abi  (already in repo)

/* ------------------------------------------------------------------ */
/* 0a. Lightweight SQLite database (better-sqlite3)                    */
/* ------------------------------------------------------------------ */
const Database = require('better-sqlite3');
const DB_PATH = path.join(DATA_FOLDER, 'decoded_transactions.db');
const db = new Database(DB_PATH); // Creates the file if it does not exist

db.exec(`
  CREATE TABLE IF NOT EXISTS enriched_events (
    block_number      INTEGER,
    tx_index          INTEGER,
    msg_sender        TEXT,
    transaction_hash  TEXT PRIMARY KEY,
    contract_name     TEXT,
    function_name     TEXT,
    function_inputs   TEXT,
    processed         BOOLEAN,
    error             TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_block_tx ON enriched_events (block_number, tx_index);
`);

const insertStmt = db.prepare(`
  INSERT OR REPLACE INTO enriched_events (
    block_number, tx_index, msg_sender, transaction_hash,
    contract_name, function_name, function_inputs, processed, error
  ) VALUES (?,?,?,?,?,?,?,?,?);
`);

const DEFAULT_CSV = path.join(DATA_FOLDER, 'indexer_input.csv');

const RPC_URL = process.env.RPC_URL;
const INPUT_CSV = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : DEFAULT_CSV;
const OUTPUT_CSV = path.join(DATA_FOLDER, 'decoded_transactions.csv');

console.log(`[DEBUG] Koristi se RPC URL: "${RPC_URL}"`);

/* ------------------------------------------------------------------ */
/* 1. Ethers provider                                                 */
/* ------------------------------------------------------------------ */
const BASE_CHAIN_ID = 8453;
const provider = new ethers.JsonRpcProvider(RPC_URL, BASE_CHAIN_ID);

/* ------------------------------------------------------------------ */
/* 2. Load every ABI from ./abi                                       */
/* ------------------------------------------------------------------ */
type LoadedAbi = { iface: import('ethers').Interface; name: string };
const interfaces: LoadedAbi[] = [];

for (const file of glob.sync(path.join(ABIS_FOLDER, '**/*.json'))) {
  try {
    const abiJSON = JSON.parse(fs.readFileSync(file, 'utf8'));
    interfaces.push({
      iface: new ethers.Interface(abiJSON),
      name: path.relative(PROJECT_ROOT, file),
    });
  } catch (err) {
    console.warn(`⚠️  Skipping ${file}: ${(err as Error).message}`);
  }
}
console.log(`🔍 Loaded ${interfaces.length} ABI files from ${ABIS_FOLDER}`);

/* ------------------------------------------------------------------ */
/* 3. CSV writer for the enriched output                              */
/* ------------------------------------------------------------------ */
const csvWriter = createObjectCsvWriter({
  path: OUTPUT_CSV,
  header: [
    'block_number',
    'tx_index',
    'msg_sender',
    'transaction_hash',
    'contract_name',
    'function_name',
    'function_inputs',
    'processed',
    'error',
  ].map((id) => ({ id, title: id })),
});

/* ------------------------------------------------------------------ */
/* 4. Type describing one input row from the CSV                      */
/* ------------------------------------------------------------------ */
interface InputRow {
  transaction_hash?: string;
  txHash?: string;
  block_number?: string;
  [key: string]: unknown;
}

/* ------------------------------------------------------------------ */
/* 5. Helper – treat csv-parser stream as AsyncIterable<InputRow>      */
/* ------------------------------------------------------------------ */
function csvStream(filePath: string): AsyncIterable<InputRow> {
  // csv-parser does not expose proper typings for async iteration, so we cast.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return fs.createReadStream(filePath).pipe(csvParser()) as any;
}

/* ------------------------------------------------------------------ */
/* 6. Main asynchronous processing loop                               */
/* ------------------------------------------------------------------ */
(async () => {
  const outputRows: Record<string, unknown>[] = [];

  for await (const row of csvStream(INPUT_CSV)) {
    const txHash = (row.transaction_hash || row.txHash) as string | undefined;
    if (!txHash) continue;

    try {
      /* ----------- Fetch on-chain data in parallel ----------- */
      const [tx, receipt] = await Promise.all([
        provider.getTransaction(txHash),
        provider.getTransactionReceipt(txHash),
      ]);
      if (!tx || !receipt) throw new Error('Transaction not found on chain');

      const block = await provider.getBlock(receipt.blockNumber);
      if (!block) throw new Error('Block not found on chain');

      /* ----------- Decode calldata --------------------------- */
      let decodedMethod = 'unknown';
      let decodedParams: unknown = {};
      let matchedAbiName = '';

      for (const { iface, name } of interfaces) {
        try {
          const parsed = iface.parseTransaction({
            data: tx.data,
            value: tx.value,
          });
          if (!parsed) {
            continue;
          }
          decodedMethod = parsed.name;
          decodedParams = parsed.args;
          matchedAbiName = name;
          break; // stop after the first successful match
        } catch {
          /* continue trying other ABIs */
        }
      }

      /* ----------- Gas / fee calculations -------------------- */
      const gasPriceGwei = Number(
        ethers.formatUnits(tx.gasPrice ?? 0n, 'gwei'),
      );
      const txFeeEth = Number(
        ethers.formatEther(receipt.gasUsed * (tx.gasPrice ?? 0n)),
      );

      /* ----------- Assemble final CSV row -------------------- */
      // JSON.stringify fails on BigInts, so we provide a replacer.
      const replacer = (key: unknown, value: unknown) =>
        typeof value === 'bigint' ? value.toString() : value;

      const contract_name = matchedAbiName
        ? path.basename(matchedAbiName, '.json')
        : 'unknown';

      const rowForCsv = {
        block_number: receipt.blockNumber,
        tx_index:
          receipt.index ??
          tx.index ??
          receipt.transactionIndex ??
          tx.transactionIndex ??
          null,
        msg_sender: tx.from,
        transaction_hash: txHash,
        contract_name,
        function_name: decodedMethod,
        function_inputs: JSON.stringify(decodedParams, replacer),
        processed: false,
        error: '',
      } as const;

      // Write to in-memory array for CSV output
      outputRows.push(rowForCsv);

      // Persist immediately into SQLite (UPSERT semantics)
      insertStmt.run(
        rowForCsv.block_number,
        rowForCsv.tx_index,
        rowForCsv.msg_sender,
        rowForCsv.transaction_hash,
        rowForCsv.contract_name,
        rowForCsv.function_name,
        rowForCsv.function_inputs,
        rowForCsv.processed ? 1 : 0,
        rowForCsv.error,
      );

      /* Throttle to avoid exhausting RPC rate limits            */
      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      console.error(`❌  ${txHash?.slice(0, 10)}… ${(err as Error).message}`);
    }
  }

  /* ---------------------------------------------------------------- */
  /* 7. Sort and write results to disk                                */
  /* ---------------------------------------------------------------- */
  // Ensure chronological order: first by block_number, then tx_index
  outputRows.sort((a, b) => {
    const bnDiff = (a.block_number as number) - (b.block_number as number);
    return bnDiff !== 0
      ? bnDiff
      : (a.tx_index as number) - (b.tx_index as number);
  });

  await csvWriter.writeRecords(outputRows);
  console.log(`✅  Saved ${outputRows.length} rows → ${OUTPUT_CSV}`);

  // Close DB handle to flush changes
  db.close();
})();
