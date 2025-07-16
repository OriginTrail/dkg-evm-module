#!/usr/bin/env ts-node

/* Claim delegator rewards for a specific epoch on Neuroweb network.
 * Reads RPC_URL_NEURO and PRIVATE_KEY from .env.
 * Uses EPOCH_TO_CLAIM constant (default 6).
 * Iterates over all nodes -> fetch delegators -> call Staking.claimDelegatorRewards(nodeId, EPOCH, delegator).
 */

require('dotenv').config();

import * as fs from 'fs';
import * as path from 'path';
import { JsonRpcProvider, Wallet } from 'ethers';

import DelegatorsInfoABI from '../abi/DelegatorsInfo.json';
import IdentityStorageABI from '../abi/IdentityStorage.json';
import StakingABI from '../abi/Staking.json';

const EPOCH_TO_CLAIM = 6; // TODO: adjust as needed

const DEPLOYMENTS_PATH = path.resolve(
  __dirname,
  '..',
  'deployments',
  'neuroweb_mainnet_contracts.json',
);
const deployments = JSON.parse(fs.readFileSync(DEPLOYMENTS_PATH, 'utf8'));

const RPC_URL = process.env.RPC_URL_NEURO;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!RPC_URL || !PRIVATE_KEY) {
  console.error('RPC_URL_NEURO and PRIVATE_KEY must be set in .env');
  process.exit(1);
}

const provider = new JsonRpcProvider(RPC_URL);
const signer = new Wallet(PRIVATE_KEY, provider);

const DATA_DIR = path.resolve(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
const OUTPUT_CSV = path.join(DATA_DIR, 'neuroweb_delegators_claim_output.csv');

const DELEGATORS_INFO_ADDR = deployments.contracts.DelegatorsInfo.evmAddress;
const IDENTITY_STORAGE_ADDR = deployments.contracts.IdentityStorage.evmAddress;
const STAKING_ADDR = deployments.contracts.Staking.evmAddress;

const delegatorsInfo = new (require('ethers').Contract)(
  DELEGATORS_INFO_ADDR,
  DelegatorsInfoABI,
  signer,
);
const identityStorage = new (require('ethers').Contract)(
  IDENTITY_STORAGE_ADDR,
  IdentityStorageABI,
  signer,
);
const staking = new (require('ethers').Contract)(
  STAKING_ADDR,
  StakingABI,
  signer,
);

(async () => {
  const lastId: bigint = await identityStorage.lastIdentityId();
  console.log(`Last identityId: ${lastId.toString()}`);

  const rows: string[] = [];
  rows.push('delegator_address,node_identity_id,status,details');

  for (let id = 1n; id <= lastId; id++) {
    let delegators: string[] = [];
    try {
      delegators = await delegatorsInfo.getDelegators(id);
    } catch (e) {
      console.warn(
        `Node ${id} – unable to fetch delegators: ${(e as Error).message}`,
      );
      continue;
    }

    for (const delegator of delegators) {
      // Skip specific delegator address per user request
      if (
        delegator.toLowerCase() === '0x599c59081d9b673bbddafbc933b669aa84ea3ee1'
      ) {
        console.log(
          `⏭️  Node ${id} – delegator ${delegator} is excluded from claiming. Skipping.`,
        );
        rows.push(
          `${delegator.toLowerCase()},${id.toString()},skipped,excluded`,
        );
        continue;
      }

      try {
        const lastClaimedEpochBI = await delegatorsInfo.getLastClaimedEpoch(
          id,
          delegator,
        );
        const lastClaimedEpoch = Number(lastClaimedEpochBI);

        if (lastClaimedEpoch >= EPOCH_TO_CLAIM) {
          console.log(
            `ℹ️ Node ${id} – delegator ${delegator} already claimed epoch ${EPOCH_TO_CLAIM} (last claimed: ${lastClaimedEpoch}). Skipping.`,
          );
          rows.push(
            `${delegator.toLowerCase()},${id.toString()},skipped,already_claimed`,
          );
          continue;
        }

        // Attempt the on-chain claim
        const tx = await staking.claimDelegatorRewards(
          id,
          EPOCH_TO_CLAIM,
          delegator,
          {
            gasLimit: 500_000,
          },
        );
        const receipt = await tx.wait();
        console.log(
          `✅ Node ${id} – delegator ${delegator} claimed (tx: ${receipt.hash.slice(0, 10)}…)`,
        );
        rows.push(
          `${delegator.toLowerCase()},${id.toString()},success,${receipt.hash}`,
        );
      } catch (err) {
        const errorMessage =
          (err as any)?.revert?.args?.[0] ?? (err as Error).message;
        console.warn(
          `⚠️  Node ${id} – delegator ${delegator} failed: ${errorMessage}`,
        );
        rows.push(
          `${delegator.toLowerCase()},${id.toString()},failed,"${errorMessage.replace(/"/g, "'")}"`,
        );
      }
    }
  }

  fs.writeFileSync(OUTPUT_CSV, rows.join('\n'));
  console.log(`📄 Saved results to ${OUTPUT_CSV}`);
})();
