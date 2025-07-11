import { ethers } from 'ethers';
import * as fs from 'fs';
import csv from 'csv-parser';

// Function to compute the delegator key, same as in the main script
function getDelegatorKey(address: string): string {
  return ethers.keccak256(ethers.solidityPacked(['address'], [address]));
}

async function findMatchingDelegatorKey() {
  // =======================================================================
  // UPUTSTVO:
  // 1. Pronađite adresu VLASNIKA (ownera) pametnog novčanika.
  // 2. Unesite tu adresu ovde ispod.
  const addressToTest = '0x047d912410759a0824cfad69a134df0172dbc067';
  // =======================================================================

  const targetKey = getDelegatorKey(addressToTest).toLowerCase();
  console.log(`[i] Tražim delegator key: ${targetKey}`);
  console.log(`[i] Izračunat od adrese: ${addressToTest}\n`);

  const results: any[] = [];
  let matchFound = false;

  fs.createReadStream('data/indexer_input.csv')
    .pipe(csv())
    .on('data', (data) => {
      results.push(data);
    })
    .on('end', () => {
      results.forEach((row, index) => {
        const csvKey = row.delegator_key?.toLowerCase();
        if (csvKey && csvKey !== 'null' && csvKey === targetKey) {
          console.log(`✅ PRONAĐENO POKLAPANJE!`);
          console.log(`   - Red u CSV fajlu: ${index + 2}`);
          console.log(`   - tx_hash: ${row.tx_hash}`);
          console.log(`   - Delegator Key: ${csvKey}`);
          matchFound = true;
        }
      });

      if (!matchFound) {
        console.log('\n❌ Nije pronađeno nijedno poklapanje u CSV fajlu.');
      }
    });
}

findMatchingDelegatorKey();
