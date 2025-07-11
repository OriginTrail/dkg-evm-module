const { ethers } = require('ethers');
const { Client } = require('pg');
const config = require('../indexer_qa_service/config');
require('dotenv').config();

async function debugSpecificEvent() {
  const targetBlock = 24435531;
  const targetNodeId = 31;
  const targetDelegatorKey = '0x7035601b19e5797ca0a893b3e12aa2495aaf8c4e727b83f0aa5d2ffeea749f31';
  
  console.log(`🔍 Debugging Event Details:`);
  console.log(`   Block: ${targetBlock}`);
  console.log(`   Node ID: ${targetNodeId}`);
  console.log(`   Delegator: ${targetDelegatorKey}`);
  console.log('');

  const dbConfig = {
    host: process.env.DB_HOST_INDEXER,
    port: 5432,
    user: process.env.DB_USER_INDEXER,
    password: process.env.DB_PASSWORD_INDEXER,
    database: 'postgres'
  };

  // Check all networks for this event
  const networks = [
    { name: 'Gnosis', db: 'gnosis-mainnet-db' },
    { name: 'Base', db: 'base-mainnet-db' },
    { name: 'Neuroweb', db: 'nw-mainnet-db' }
  ];

  for (const network of networks) {
    console.log(`🌐 Checking ${network.name} Network:`);
    console.log('─'.repeat(50));
    
    const client = new Client({ ...dbConfig, database: network.db });
    
    try {
      await client.connect();
      
      // 1. Find the specific event
      const eventResult = await client.query(`
        SELECT * FROM delegator_base_stake_updated 
        WHERE block_number = $1 AND identity_id = $2 AND delegator_key LIKE $3
        ORDER BY block_number ASC
      `, [targetBlock, targetNodeId, targetDelegatorKey + '%']);
      
      if (eventResult.rows.length === 0) {
        console.log(`   ❌ No event found for block ${targetBlock}, node ${targetNodeId}`);
        continue;
      }
      
      const event = eventResult.rows[0];
      console.log(`   ✅ Event found:`);
      console.log(`      Block: ${event.block_number}`);
      console.log(`      Node ID: ${event.identity_id}`);
      console.log(`      Delegator: ${event.delegator_key}`);
      console.log(`      New Stake: ${event.stake_base} wei (${(BigInt(event.stake_base) / BigInt(10**18)).toString()} TRAC)`);
      console.log(`      Transaction: ${event.transaction_hash}`);
      console.log('');
      
      // 2. Find previous events for this delegator
      const previousEventsResult = await client.query(`
        SELECT * FROM delegator_base_stake_updated 
        WHERE identity_id = $1 AND delegator_key = $2 AND block_number < $3
        ORDER BY block_number DESC
        LIMIT 5
      `, [targetNodeId, event.delegator_key, targetBlock]);
      
      console.log(`   📜 Previous events for this delegator:`);
      if (previousEventsResult.rows.length === 0) {
        console.log(`      No previous events found (this should be the first event)`);
      } else {
        previousEventsResult.rows.forEach((prevEvent, index) => {
          console.log(`      ${index + 1}. Block ${prevEvent.block_number}: ${prevEvent.stake_base} wei (${(BigInt(prevEvent.stake_base) / BigInt(10**18)).toString()} TRAC)`);
        });
      }
      console.log('');
      
      // 3. Check contract state at block - 1
      try {
        const networkConfig = config.networks.find(n => n.name === network.name);
        if (!networkConfig) {
          console.log(`   ❌ Network config not found for ${network.name}`);
          continue;
        }
        
        const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
        const stakingAddress = await getContractAddressFromHub(network.name, 'StakingStorage');
        const stakingContract = new ethers.Contract(stakingAddress, [
          'function getDelegatorStakeBase(uint72 identityId, bytes32 delegatorKey) view returns (uint96)'
        ], provider);
        
        const contractStakeAtBlockMinus1 = await stakingContract.getDelegatorStakeBase(
          targetNodeId, 
          event.delegator_key,
          { blockTag: targetBlock - 1 }
        );
        
        console.log(`   🔍 Contract state at block ${targetBlock - 1}:`);
        console.log(`      Contract stake: ${contractStakeAtBlockMinus1.toString()} wei (${(BigInt(contractStakeAtBlockMinus1) / BigInt(10**18)).toString()} TRAC)`);
        
        // 4. Compare with previous event
        if (previousEventsResult.rows.length > 0) {
          const lastPreviousEvent = previousEventsResult.rows[0];
          const expectedOldStake = BigInt(lastPreviousEvent.stake_base);
          const actualOldStake = BigInt(contractStakeAtBlockMinus1);
          const difference = expectedOldStake - actualOldStake;
          
          console.log(`   📊 Comparison:`);
          console.log(`      Expected (from indexer): ${expectedOldStake.toString()} wei (${(expectedOldStake / BigInt(10**18)).toString()} TRAC)`);
          console.log(`      Actual (from contract): ${actualOldStake.toString()} wei (${(actualOldStake / BigInt(10**18)).toString()} TRAC)`);
          console.log(`      Difference: ${difference.toString()} wei (${(difference / BigInt(10**18)).toString()} TRAC)`);
          
          if (difference !== 0n) {
            console.log(`   ⚠️ MISMATCH DETECTED!`);
            console.log(`      This suggests either:`);
            console.log(`      1. Missing indexer events between blocks ${lastPreviousEvent.block_number} and ${targetBlock}`);
            console.log(`      2. Indexer data inconsistency`);
            console.log(`      3. Contract state changed by other transactions`);
          } else {
            console.log(`   ✅ Values match perfectly!`);
          }
        } else {
          console.log(`   📊 First event analysis:`);
          console.log(`      Contract stake at block ${targetBlock - 1}: ${(BigInt(contractStakeAtBlockMinus1) / BigInt(10**18)).toString()} TRAC`);
          console.log(`      Expected: 0 TRAC (no previous events)`);
          
          if (BigInt(contractStakeAtBlockMinus1) > 0n) {
            console.log(`   ⚠️ Contract has stake but no previous indexer events!`);
            console.log(`      This suggests missing indexer events before block ${targetBlock}`);
          } else {
            console.log(`   ✅ Contract state matches expectation (0 TRAC)`);
          }
        }
        
      } catch (error) {
        console.log(`   ❌ RPC Error: ${error.message}`);
        console.log(`      This could be due to:`);
        console.log(`      1. RPC provider not supporting historical queries`);
        console.log(`      2. Block ${targetBlock - 1} not available`);
        console.log(`      3. Network connectivity issues`);
      }
      
    } catch (error) {
      console.log(`   ❌ Database Error: ${error.message}`);
    } finally {
      await client.end();
    }
    
    console.log('');
  }
}

async function getContractAddressFromHub(network, contractName) {
  try {
    const networkConfig = config.networks.find(n => n.name === network);
    if (!networkConfig) {
      throw new Error(`Network ${network} not found in config`);
    }
    
    const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
    const hubContract = new ethers.Contract(networkConfig.hubAddress, [
      'function getContractAddress(string memory contractName) view returns (address)'
    ], provider);
    
    const address = await hubContract.getContractAddress(contractName);
    return address;
  } catch (error) {
    // Return fallback address if Hub lookup fails
    const networkConfig = config.networks.find(n => n.name === network);
    if (!networkConfig) {
      throw new Error(`Network ${network} not found in config`);
    }
    
    let fallbackAddress;
    if (contractName === 'StakingStorage') {
      fallbackAddress = networkConfig.stakingStorageAddress;
    } else if (contractName === 'KnowledgeCollectionStorage') {
      fallbackAddress = networkConfig.knowledgeCollectionStorageAddress;
    } else {
      throw new Error(`No fallback address for ${contractName}`);
    }
    
    return fallbackAddress;
  }
}

// Run the debug function
debugSpecificEvent().catch(console.error); 