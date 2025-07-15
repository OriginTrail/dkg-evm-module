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
import * as fs from 'fs';
import * as path from 'path';
import HubABI from '../abi/Hub.json';
import IdentityABI from '../abi/Identity.json';
import MigratorABI from '../abi/MigratorM1V8.json';
import StakingStorageABI from '../abi/StakingStorage.json';
import DelegatorsInfoABI from '../abi/DelegatorsInfo.json';
import IdentityStorageABI from '../abi/IdentityStorage.json';

const csvParser = require('csv-parser');
const glob = require('glob');
const { createObjectCsvWriter } = require('csv-writer');
const ethers = require('ethers');

const deployments = JSON.parse(
  fs.readFileSync('deployments/base_mainnet_contracts.json', 'utf8'),
);
const IDENTITY_CONTRACT_ADDRESS = deployments.contracts.Identity.evmAddress;
const MIGRATOR_CONTRACT_ADDRESS =
  deployments.contracts.MigratorM1V8.evmAddress.toLowerCase();
const STAKING_STORAGE_CONTRACT_ADDRESS =
  deployments.contracts.StakingStorage.evmAddress.toLowerCase();
const DELEGATORS_INFO_CONTRACT_ADDRESS =
  deployments.contracts.DelegatorsInfo.evmAddress.toLowerCase();
const IDENTITY_STORAGE_CONTRACT_ADDRESS =
  deployments.contracts.IdentityStorage.evmAddress.toLowerCase();

const stakingStorageInterface = new ethers.Interface(StakingStorageABI);
// delegatorsInfoContract requires provider, will be created after provider is defined

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
    block_timestamp   INTEGER,
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
    block_number, block_timestamp, tx_index, msg_sender, transaction_hash,
    contract_name, function_name, function_inputs, processed, error
  ) VALUES (?,?,?,?,?,?,?,?,?,?);
`);

const DEFAULT_CSV = path.join(DATA_FOLDER, 'indexer_input.csv');

const RPC_URL = process.env.RPC_URL;
const INPUT_CSV = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : DEFAULT_CSV;
const OUTPUT_CSV = path.join(DATA_FOLDER, 'decoded_transactions.csv');
// NEW: path for removed-delegator CSV
const DELETED_DELEGATORS_CSV = path.join(DATA_FOLDER, 'deleted_delegators.csv');

console.log(`[DEBUG] Koristi se RPC URL: "${RPC_URL}"`);

/* ------------------------------------------------------------------ */
/* 1. Ethers provider                                                 */
/* ------------------------------------------------------------------ */
// Auto-detect the network from the RPC URL (e.g. Gnosis = 100, Base = 8453)
const provider = new ethers.JsonRpcProvider(RPC_URL);

// Instantiate DelegatorsInfo contract now that provider exists
const delegatorsInfoContract = new ethers.Contract(
  DELEGATORS_INFO_CONTRACT_ADDRESS,
  DelegatorsInfoABI,
  provider,
);
// NEW: Instantiate IdentityStorage contract for operator/admin checks
const identityStorageContract = new ethers.Contract(
  IDENTITY_STORAGE_CONTRACT_ADDRESS,
  IdentityStorageABI,
  provider,
);

/* ------------------------------------------------------------------ */
/* 2. Load every ABI from ./abi                                       */
/* ------------------------------------------------------------------ */
type LoadedAbi = { iface: import('ethers').Interface; name: string };
const interfaces: LoadedAbi[] = [];

/* ------------------------------------------------------------------ */
/* 2a. Manual overrides for transactions that ABI decoding misses      */
/* ------------------------------------------------------------------ */
// Map of txHash (lower-case) → { contract_name, function_name, function_inputs }
const MANUAL_OVERRIDES = new Map<
  string,
  {
    contract_name: string;
    function_name: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function_inputs: any;
  }
>([
  [
    '0xfcf2c531ec4a362ef6f8fd614d946f5159663928308c2a30890564eabeeaaf4d',
    {
      contract_name: 'Staking',
      function_name: 'stake',
      // [identityId, addedStake]
      function_inputs: ['38', '2083543073369909585000'],
    },
  ],
  [
    '0xf80a131a93d357c0879b9d53760c03c10caf9b4c592f33b0c6d6d8892223747c',
    {
      contract_name: 'Staking',
      function_name: 'redelegate',
      // [fromIdentityId, toIdentityId, stakeAmount]
      function_inputs: ['33', '22', '2083543073369909585000'],
    },
  ],
  [
    '0x7335bf4031abf0d4cebefe4471acfeae1c4f9213287dbcf62915d859ff96df4a',
    {
      contract_name: 'Staking',
      function_name: 'redelegate',
      function_inputs: ['38', '33', '2083543073369909585000'],
    },
  ],
  [
    '0x25511cbe5e040e818638cf15cba2b6ba68b0c4cf3b1770db8d879c3f1aa757c0',
    {
      contract_name: 'Staking',
      function_name: 'redelegate',
      function_inputs: ['22', '38', '2083543073369909585000'],
    },
  ],
]);

// Additional override: map specific tx hashes to a custom msg.sender value
const MSG_SENDER_OVERRIDES = new Map<string, string>([
  [
    '0xfcf2c531ec4a362ef6f8fd614d946f5159663928308c2a30890564eabeeaaf4d',
    '0x047d912410759a0824cfad69a134df0172dbc067',
  ],
  [
    '0xf80a131a93d357c0879b9d53760c03c10caf9b4c592f33b0c6d6d8892223747c',
    '0x047d912410759a0824cfad69a134df0172dbc067',
  ],
  [
    '0x7335bf4031abf0d4cebefe4471acfeae1c4f9213287dbcf62915d859ff96df4a',
    '0x047d912410759a0824cfad69a134df0172dbc067',
  ],
  [
    '0x25511cbe5e040e818638cf15cba2b6ba68b0c4cf3b1770db8d879c3f1aa757c0',
    '0x047d912410759a0824cfad69a134df0172dbc067',
  ],
]);

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
    'block_timestamp',
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
// NEW: writer for "deleted_delegators.csv" – same header structure
const csvWriterDeleted = createObjectCsvWriter({
  path: DELETED_DELEGATORS_CSV,
  header: [
    'block_number',
    'block_timestamp',
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
  delegator_key?: string;
  [key: string]: unknown;
}

/** Compute delegatorKey = keccak256(packed address) to match on-chain logic */
function getDelegatorKey(address: string): string {
  return ethers
    .keccak256(ethers.solidityPacked(['address'], [address]))
    .toLowerCase();
}

interface RedelegateParams {
  fromIdentityId: number;
  toIdentityId: number;
  amount: bigint;
}

function isRedelegateParams(params: any): params is RedelegateParams {
  return (
    params &&
    typeof params.fromIdentityId === 'number' &&
    typeof params.toIdentityId === 'number' &&
    typeof params.amount !== 'undefined'
  );
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
  // NEW: collect rows where delegator check fails
  const deletedRows: Record<string, unknown>[] = [];

  for await (const row of csvStream(INPUT_CSV)) {
    const txHash = (row.transaction_hash || row.txHash) as string | undefined;
    if (!txHash) continue;

    let delegatorKeyCsvRaw = row.delegator_key as string | undefined;
    if (typeof delegatorKeyCsvRaw === 'string')
      delegatorKeyCsvRaw = delegatorKeyCsvRaw.trim();
    const delegatorKeyCsv =
      !delegatorKeyCsvRaw || delegatorKeyCsvRaw.toLowerCase() === 'null'
        ? null
        : delegatorKeyCsvRaw.toLowerCase();

    try {
      /* ----------- Fetch on-chain data in parallel ----------- */
      const [tx, receipt] = await Promise.all([
        provider.getTransaction(txHash),
        provider.getTransactionReceipt(txHash),
      ]);
      if (!tx || !receipt) throw new Error('Transaction not found on chain');

      // NEW: flag to track removed-delegator cases within this tx
      let delegatorCheckFailed = false;
      // NEW: flag to track operator/admin check failures
      let operatorCheckFailed = false;

      // Determine the effective sender (may be overridden for specific txs)
      const effectiveSender =
        MSG_SENDER_OVERRIDES.get(txHash.toLowerCase()) ?? tx.from;

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

      let contract_name = matchedAbiName
        ? path.basename(matchedAbiName, '.json')
        : 'unknown';

      // ---------------- Manual override if decode failed ----------------
      const override = MANUAL_OVERRIDES.get(txHash.toLowerCase());
      if (decodedMethod === 'unknown' && override) {
        contract_name = override.contract_name;
        decodedMethod = override.function_name;
        decodedParams = override.function_inputs;
      }

      // Validate delegatorKey if provided in CSV
      let errorMsg = '';
      let delegatorAddress = effectiveSender;
      let resolutionMethod = 'Direct';

      if (delegatorKeyCsv) {
        const computedKey = getDelegatorKey(effectiveSender).toLowerCase();

        if (computedKey !== delegatorKeyCsv) {
          if (tx.to && tx.to.toLowerCase() === MIGRATOR_CONTRACT_ADDRESS) {
            try {
              const migratorInterface = new ethers.Interface(MigratorABI);
              const decodedMigratorData = migratorInterface.parseTransaction({
                data: tx.data,
              });

              if (
                decodedMigratorData &&
                decodedMigratorData.name === 'migrateDelegatorData'
              ) {
                const realDelegatorAddress = decodedMigratorData.args[1];
                const realDelegatorKey =
                  getDelegatorKey(realDelegatorAddress).toLowerCase();

                if (realDelegatorKey === delegatorKeyCsv) {
                  delegatorAddress = realDelegatorAddress;
                  resolutionMethod = 'Migration';
                } else {
                  errorMsg = `Key mismatch in migration (csv=${delegatorKeyCsv} computed=${realDelegatorKey})`;
                }
              } else {
                errorMsg = `Could not decode migrator data: ${
                  decodedMigratorData?.name ?? 'unknown function'
                }`;
              }
            } catch (e: any) {
              errorMsg = `Error decoding migrator data: ${e.message}`;
            }
          } else {
            errorMsg = `Key mismatch (csv=${delegatorKeyCsv} computed=${computedKey})`;
          }
        }
      }

      if (errorMsg) {
        console.error(
          `❌ [${txHash.slice(
            0,
            10,
          )}…] Mismatch: ${errorMsg} To: ${tx.to?.toLowerCase()}`,
        );
      } else if (delegatorKeyCsv) {
        console.log(
          `✅ [${txHash.slice(
            0,
            10,
          )}…] Key validated. Method: ${resolutionMethod}. Delegator: ${delegatorAddress}`,
        );
      }

      /* ----------- DelegatorBaseStakeUpdated verification ------------- */
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== STAKING_STORAGE_CONTRACT_ADDRESS)
          continue;

        try {
          const parsedLog = stakingStorageInterface.parseLog(log);
          if (parsedLog.name === 'DelegatorBaseStakeUpdated') {
            const identityId = parsedLog.args[0] as bigint;
            const stakeBase = parsedLog.args[2] as bigint;

            if (stakeBase > 0n) {
              const isDelegator = await delegatorsInfoContract.isNodeDelegator(
                identityId,
                effectiveSender,
              );
              if (isDelegator) {
                console.log(
                  `✅ Delegator CHECK passed – identityId=${identityId.toString()} sender=${effectiveSender}`,
                );
              } else {
                // NEW: mark as removed-delegator case and log with yellow exclamation
                delegatorCheckFailed = true;
                console.warn(
                  `⚠️  Delegator CHECK WARNING – sender ${effectiveSender} is NOT delegator on node ${identityId.toString()} (stakeBase=${stakeBase.toString()})`,
                );
              }
            } else {
              console.log(
                `ℹ️ StakeBase == 0 for identityId ${identityId.toString()} – skipping delegator check`,
              );
            }
          }
        } catch {
          /* Not a DelegatorBaseStakeUpdated log – ignore */
        }
      }

      /* ----------- Operator/Admin verification for updateOperatorFee -- */
      if (decodedMethod === 'updateOperatorFee') {
        try {
          // extract identityId (first param) – handle array & named args
          const identityIdParam = ((decodedParams as any)[0] ??
            (decodedParams as any).identityId ??
            null) as bigint | null;
          if (identityIdParam !== null) {
            const senderKey = getDelegatorKey(effectiveSender);
            const isAdmin = await identityStorageContract.keyHasPurpose(
              identityIdParam,
              senderKey,
              1, // IdentityLib.ADMIN_KEY
            );
            if (isAdmin) {
              console.log(
                `✅ Operator CHECK passed – identityId=${identityIdParam.toString()} sender=${effectiveSender}`,
              );
            } else {
              operatorCheckFailed = true;
              console.warn(
                `⚠️  Operator CHECK WARNING – sender ${effectiveSender} is NOT admin on node ${identityIdParam.toString()} while updating operator fee`,
              );
            }
          }
        } catch (e: any) {
          console.error(`❌ Operator check error: ${e.message}`);
        }
      }

      /* ----------- Admin or Operational verification for updateAsk ---- */
      if (decodedMethod === 'updateAsk') {
        try {
          const identityIdParam = ((decodedParams as any)[0] ??
            (decodedParams as any).identityId ??
            null) as bigint | null;
          if (identityIdParam !== null) {
            const senderKey = getDelegatorKey(effectiveSender);
            const isAdmin = await identityStorageContract.keyHasPurpose(
              identityIdParam,
              senderKey,
              1, // ADMIN_KEY
            );
            const isOperational = await identityStorageContract.keyHasPurpose(
              identityIdParam,
              senderKey,
              2, // OPERATIONAL_KEY
            );
            if (isAdmin || isOperational) {
              console.log(
                `✅ Ask CHECK passed – identityId=${identityIdParam.toString()} sender=${effectiveSender}`,
              );
            } else {
              console.warn(
                `⚠️  Ask CHECK WARNING – sender ${effectiveSender} is NOT admin/operational on node ${identityIdParam.toString()} while updating ask`,
              );
            }
          }
        } catch (e: any) {
          console.error(`❌ Ask check error: ${e.message}`);
        }
      }

      const rowForCsv = {
        block_number: receipt.blockNumber,
        block_timestamp: block.timestamp,
        tx_index:
          receipt.index ??
          tx.index ??
          receipt.transactionIndex ??
          tx.transactionIndex ??
          null,
        msg_sender: effectiveSender,
        transaction_hash: txHash,
        contract_name,
        function_name: decodedMethod,
        function_inputs: JSON.stringify(decodedParams, replacer),
        processed: false,
        error: errorMsg,
        delegator_key: delegatorKeyCsv || 'NULL',
        real_delegator_address: delegatorAddress,
      } as const;

      // Write to in-memory array for CSV output
      outputRows.push(rowForCsv);
      // NEW: also persist to deletedRows if delegator was removed
      if (delegatorCheckFailed) {
        deletedRows.push(rowForCsv);
      }
      // NEW: append operator check failure to errorMsg if any
      if (operatorCheckFailed) {
        errorMsg = errorMsg
          ? `${errorMsg}; Operator check failed`
          : 'Operator check failed';
      }

      // Persist immediately into SQLite (UPSERT semantics)
      insertStmt.run(
        rowForCsv.block_number,
        rowForCsv.block_timestamp,
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

  // NEW: persist removed-delegator rows (if any)
  if (deletedRows.length > 0) {
    await csvWriterDeleted.writeRecords(deletedRows);
    console.log(
      `⚠️  Saved ${deletedRows.length} rows → ${DELETED_DELEGATORS_CSV}`,
    );
  }

  // Close DB handle to flush changes
  db.close();
})();
