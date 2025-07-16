#!/usr/bin/env ts-node

/* Export delegators for all nodes on Gnosis network to CSV.
 * Requires RPC_URL_GNOSIS in .env and uses deployments/gnosis_mainnet_contracts.json
 * Output: data/delegators_gnosis.csv (delegator_address,node_identity_id)
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
  console.error('RPC_URL_GNOSIS is not set in .env');
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

const OUTPUT_CSV = path.join(DATA_DIR, 'delegators_gnosis.csv');

(async () => {
  const rows: string[] = [];
  const lastId: bigint = await identityStorage.lastIdentityId();
  console.log(`Last identityId on Gnosis: ${lastId.toString()}`);

  for (let id = 1n; id <= lastId; id++) {
    try {
      const delegators: string[] = await delegatorsInfo.getDelegators(id);
      delegators.forEach((addr) =>
        rows.push(`${addr.toLowerCase()},${id.toString()}`),
      );
      console.log(`Node ${id.toString()} → ${delegators.length} delegators`);
    } catch (err) {
      console.warn(
        `⚠️  Error node ${id.toString()}: ${(err as Error).message}`,
      );
    }
  }

  fs.writeFileSync(
    OUTPUT_CSV,
    ['delegator_address,node_identity_id', ...rows].join('\n'),
  );
  console.log(`✅  Saved ${rows.length} rows → ${OUTPUT_CSV}`);
})();
