#!/usr/bin/env ts-node

/* Export lastClaimedEpoch for every delegator on each node (Gnosis network).
 * Requires RPC_URL_GNOSIS in .env and uses deployments/gnosis_mainnet_contracts.json.
 * Output CSV: data/delegators_last_claimed_gnosis.csv
 */

require('dotenv').config();

import * as fs from 'fs';
import * as path from 'path';
import { JsonRpcProvider } from 'ethers';

import DelegatorsInfoABI from '../abi/DelegatorsInfo.json';
import IdentityStorageABI from '../abi/IdentityStorage.json';

const DEPLOYMENTS_PATH = path.resolve(
  __dirname,
  '..',
  'deployments',
  'gnosis_mainnet_contracts.json',
);
const deployments = JSON.parse(fs.readFileSync(DEPLOYMENTS_PATH, 'utf8'));

const RPC_URL = process.env.RPC_URL_GNOSIS;
if (!RPC_URL) {
  console.error('RPC_URL_GNOSIS not set in .env');
  process.exit(1);
}

const provider = new JsonRpcProvider(RPC_URL);

const DELEGATORS_INFO_ADDR = deployments.contracts.DelegatorsInfo.evmAddress;
const IDENTITY_STORAGE_ADDR = deployments.contracts.IdentityStorage.evmAddress;

const delegatorsInfo = new (require('ethers').Contract)(
  DELEGATORS_INFO_ADDR,
  DelegatorsInfoABI,
  provider,
);
const identityStorage = new (require('ethers').Contract)(
  IDENTITY_STORAGE_ADDR,
  IdentityStorageABI,
  provider,
);

const DATA_DIR = path.resolve(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
const OUTPUT_CSV = path.join(DATA_DIR, 'delegators_last_claimed_gnosis.csv');

(async () => {
  const rows: string[] = [
    'delegator_address,node_identity_id,last_claimed_epoch',
  ];

  const lastId: bigint = await identityStorage.lastIdentityId();
  console.log(`Scanning nodes 1..${lastId.toString()}`);

  for (let id = 1n; id <= lastId; id++) {
    let delegators: string[] = [];
    try {
      delegators = await delegatorsInfo.getDelegators(id);
    } catch (err) {
      console.warn(
        `Node ${id} – couldn't fetch delegators: ${(err as Error).message}`,
      );
      continue;
    }

    for (const delegator of delegators) {
      try {
        const last: bigint = await delegatorsInfo.getLastClaimedEpoch(
          id,
          delegator,
        );
        rows.push(
          `${delegator.toLowerCase()},${id.toString()},${last.toString()}`,
        );
      } catch (e) {
        console.warn(
          `Node ${id} – delegator ${delegator} failed: ${(e as Error).message}`,
        );
      }
    }

    console.log(`Node ${id} processed (${delegators.length} delegators)`);
  }

  fs.writeFileSync(OUTPUT_CSV, rows.join('\n'));
  console.log(`✅  Saved ${rows.length - 1} rows → ${OUTPUT_CSV}`);
})();
