#!/usr/bin/env ts-node

/*
 * Export delegators for all nodes on Base network to CSV.
 * Reads RPC_URL_BASE from .env, uses deployment file for contract addresses.
 * Output: data/delegators_base.csv with columns: delegator_address, node_identity_id
 */

require('dotenv').config();

import * as fs from 'fs';
import * as path from 'path';
import { Interface, JsonRpcProvider } from 'ethers';

import DelegatorsInfoABI from '../abi/DelegatorsInfo.json';
import IdentityStorageABI from '../abi/IdentityStorage.json';

const DEPLOYMENTS_PATH = path.resolve(
  __dirname,
  '..',
  'deployments',
  'base_mainnet_contracts.json',
);
const deployments = JSON.parse(fs.readFileSync(DEPLOYMENTS_PATH, 'utf8'));

const RPC_URL = process.env.RPC_URL_BASE;
if (!RPC_URL) {
  console.error('RPC_URL_BASE is not set in .env');
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

const OUTPUT_CSV = path.join(DATA_DIR, 'delegators_base.csv');

(async () => {
  const rows: string[] = [];

  const lastId: bigint = await identityStorage.lastIdentityId();
  console.log(`Last identityId on Base: ${lastId.toString()}`);

  for (let id = 1n; id <= lastId; id++) {
    try {
      const delegators: string[] = await delegatorsInfo.getDelegators(id);
      delegators.forEach((addr) => {
        rows.push(`${addr.toLowerCase()},${id.toString()}`);
      });
      console.log(
        `Fetched ${delegators.length} delegators for node ${id.toString()}`,
      );
    } catch (err) {
      console.warn(
        `⚠️  Error fetching delegators for node ${id.toString()}: ${(err as Error).message}`,
      );
    }
  }

  const header = 'delegator_address,node_identity_id';
  fs.writeFileSync(OUTPUT_CSV, [header, ...rows].join('\n'));
  console.log(`✅  Saved ${rows.length} records to ${OUTPUT_CSV}`);
})();
