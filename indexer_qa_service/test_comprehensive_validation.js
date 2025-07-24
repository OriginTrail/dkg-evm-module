const { ethers } = require('ethers');
const { Client } = require('pg');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const pLimit = require('p-limit');
require('dotenv').config();

class CompleteQAService {
  constructor() {
    this.results = [];
    this.dbConfig = {
      host: process.env.DB_HOST_INDEXER,
      port: 5432,
      user: process.env.DB_USER_INDEXER,
      password: process.env.DB_PASSWORD_INDEXER,
      database: 'postgres'
    };
    this.databaseMap = {
      'Gnosis': 'gnosis-mainnet-db',
      'Base': 'base-mainnet-db',
      'Neuroweb': 'nw-mainnet-db'
    };
  }

  /**
   * Convert wei amount to TRAC tokens
   */
  weiToTRAC(weiAmount) {
    const wei = BigInt(weiAmount);
    const trac = Number(wei) / Math.pow(10, 18);
    return trac.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  /**
   * Format TRAC difference with smart precision
   */
  formatTRACDifference(tracAmount) {
    const absAmount = Math.abs(tracAmount);
    if (absAmount >= 0.01) {
      return tracAmount.toFixed(2);
    } else if (absAmount >= 0.0001) {
      return tracAmount.toFixed(4);
    } else if (absAmount >= 0.000001) {
      return tracAmount.toFixed(6);
    } else {
      return tracAmount.toFixed(18);
    }
  }

  async getContractAddressFromHub(network, contractName) {
    try {
      const networkConfig = config.networks.find(n => n.name === network);
      if (!networkConfig) {
        throw new Error(`Network ${network} not found in config`);
      }

      let provider;
      let retryCount = 0;
      while (true) {
        try {
          provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
          await provider.getNetwork();
          if (retryCount > 0) {
            console.log(` ✅ RPC connection succeeded after ${retryCount} retries`);
          }
          break;
        } catch (error) {
          retryCount++;
          console.log(` ⚠️ RPC connection failed (attempt ${retryCount}): ${error.message}`);
          console.log(` ⏳ Retrying in 3 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }

      const hubContract = new ethers.Contract(networkConfig.hubAddress, [
        'function getContractAddress(string memory contractName) view returns (address)'
      ], provider);

      const address = await hubContract.getContractAddress(contractName);
      return address;
    } catch (error) {
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

  /**
   * Comprehensive delegator validation that validates all blocks in descending order
   * (latest first, then second latest, etc.)
   */
  async validateDelegatorStakesComprehensive(network) {
    console.log(`\n🔍 Comprehensive delegator validation for ${network} (all blocks in descending order)...`);
    
    const dbName = this.databaseMap[network];
    const client = new Client({ ...this.dbConfig, database: dbName });
    
    try {
      await client.connect();
      
      // Get active nodes with >= 50,000 TRAC
      let activeNodesResult;
      
      if (network === 'Gnosis') {
        const minStakeThreshold = 50000000000000000000000; // 50,000 TRAC in wei
        activeNodesResult = await client.query(`
          SELECT DISTINCT ON (n.identity_id) n.identity_id, n.stake
          FROM node_stake_updated n
          WHERE n.stake >= $1
          AND n.identity_id IN (
            SELECT identity_id FROM node_object_created
          )
          AND n.identity_id NOT IN (
            SELECT identity_id FROM node_object_deleted
          )
          ORDER BY n.identity_id, n.block_number DESC
        `, [minStakeThreshold]);
      } else if (network === 'Neuroweb') {
        const minStakeThreshold = 50000000000000000000000; // 50,000 TRAC in wei
        activeNodesResult = await client.query(`
          SELECT DISTINCT ON (n.identity_id) n.identity_id, n.stake
          FROM node_stake_updated n
          WHERE n.stake >= $1
          AND n.identity_id IN (
            SELECT DISTINCT identity_id FROM node_object_created
          )
          AND n.identity_id NOT IN (
            SELECT DISTINCT identity_id FROM node_object_deleted
          )
          ORDER BY n.identity_id, n.block_number DESC
        `, [minStakeThreshold]);
      } else {
        const minStakeThreshold = 50000000000000000000000; // 50,000 TRAC in wei
        activeNodesResult = await client.query(`
          SELECT n.identity_id, n.stake
          FROM node_stake_updated n
          INNER JOIN (
            SELECT identity_id, MAX(block_number) as max_block
            FROM node_stake_updated
            GROUP BY identity_id
          ) latest ON n.identity_id = latest.identity_id 
          AND n.block_number = latest.max_block
          WHERE n.stake >= $1
          ORDER BY n.stake DESC
          LIMIT 24
        `, [minStakeThreshold]);
      }
      
      if (activeNodesResult.rows.length === 0) {
        console.log(`   ⚠️ No active nodes found in ${network}, skipping delegator validation`);
        return { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 };
      }
      
      // Get the list of active node IDs
      const activeNodeIds = activeNodesResult.rows.map(row => row.identity_id);
      
      // Get all delegators for active nodes with all their events
      const delegatorsResult = await client.query(`
        SELECT DISTINCT d.identity_id, d.delegator_key
        FROM delegator_base_stake_updated d
        WHERE d.identity_id = ANY($1)
        ORDER BY d.identity_id, d.delegator_key
      `, [activeNodeIds]);
      
      if (delegatorsResult.rows.length === 0) {
        console.log(`   ⚠️ No delegators found for active nodes in ${network}`);
        return { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 };
      }
      
      let totalPassed = 0;
      let totalFailed = 0;
      let totalWarnings = 0;
      let totalRpcErrors = 0;
      let totalValidations = 0;
      
      console.log(`   📊 Validating ${delegatorsResult.rows.length} delegators for ${activeNodeIds.length} active nodes...`);
      
      // For testing, let's just validate the first 3 delegators
      const testDelegators = delegatorsResult.rows.slice(0, 3);
      console.log(`   🧪 Testing with first ${testDelegators.length} delegators...`);
      
      for (const row of testDelegators) {
        const nodeId = parseInt(row.identity_id);
        const delegatorKey = row.delegator_key;
        
        const result = await this.validateSingleDelegatorStakeComprehensive(client, network, nodeId, delegatorKey);
        totalPassed += result.passed;
        totalFailed += result.failed;
        totalWarnings += result.warnings;
        totalRpcErrors += result.rpcErrors;
        totalValidations += result.totalValidations;
      }
      
      console.log(`\n   📊 Comprehensive Validation Summary:`);
      console.log(`      ✅ Passed: ${totalPassed} validations`);
      console.log(`      ❌ Failed: ${totalFailed} validations`);
      console.log(`      ⚠️ Warnings: ${totalWarnings} validations`);
      console.log(`      🔌 RPC Errors: ${totalRpcErrors} validations`);
      console.log(`      📊 Total validations: ${totalValidations}`);
      
      return { passed: totalPassed, failed: totalFailed, warnings: totalWarnings, rpcErrors: totalRpcErrors, total: totalValidations };
      
    } catch (error) {
      console.error(`Error in comprehensive delegator validation for ${network}:`, error.message);
      return { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 };
    } finally {
      await client.end();
    }
  }

  /**
   * Validate a single delegator's stake comprehensively (all blocks in descending order)
   */
  async validateSingleDelegatorStakeComprehensive(client, network, nodeId, delegatorKey) {
    try {
      console.log(`\n   🔍 Comprehensive validation for Node ${nodeId}, Delegator ${delegatorKey}:`);
      
      // Get ALL delegator events from indexer for this delegator
      const allIndexerEventsResult = await client.query(`
        SELECT stake_base, block_number
        FROM delegator_base_stake_updated
        WHERE identity_id = $1 AND delegator_key = $2
        ORDER BY block_number DESC
      `, [nodeId, delegatorKey]);
      
      console.log(`      📊 Found ${allIndexerEventsResult.rows.length} indexer events`);
      
      if (allIndexerEventsResult.rows.length === 0) {
        console.log(`      ⚠️ No indexer events found, skipping`);
        return { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, totalValidations: 0 };
      }
      
      // Group indexer events by block number and sort by stake (highest first)
      const indexerEventsByBlock = {};
      for (const event of allIndexerEventsResult.rows) {
        const blockNum = event.block_number;
        if (!indexerEventsByBlock[blockNum]) {
          indexerEventsByBlock[blockNum] = [];
        }
        indexerEventsByBlock[blockNum].push({
          blockNumber: blockNum,
          stake: BigInt(event.stake_base)
        });
      }
      
      // Sort each block's events by stake (highest first) and keep only the highest
      const processedIndexerEvents = [];
      for (const [blockNum, events] of Object.entries(indexerEventsByBlock)) {
        events.sort((a, b) => Number(b.stake - a.stake)); // Sort by stake descending
        processedIndexerEvents.push(events[0]); // Keep only the highest stake
      }
      
      // Sort processed events by block number (newest first)
      processedIndexerEvents.sort((a, b) => b.blockNumber - a.blockNumber);
      
      console.log(`      📊 Processed ${processedIndexerEvents.length} unique blocks from indexer`);
      
      // Get ALL contract events for this delegator
      const networkConfig = config.networks.find(n => n.name === network);
      if (!networkConfig) {
        throw new Error(`Network ${network} not found in config`);
      }
      
      let contractEvents = [];
      let retryCount = 0;
      
      while (true) { // Infinite retry loop
        try {
          const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
          const stakingAddress = await this.getContractAddressFromHub(network, 'StakingStorage');
          
          const stakingContract = new ethers.Contract(stakingAddress, [
            'event DelegatorBaseStakeUpdated(uint72 indexed identityId, bytes32 indexed delegatorKey, uint96 stakeBase)'
          ], provider);
          
          // Query ALL DelegatorBaseStakeUpdated events for this specific delegator and node
          console.log(`      📊 Querying ALL DelegatorBaseStakeUpdated events for node ${nodeId}, delegator ${delegatorKey}`);
          
          const filter = stakingContract.filters.DelegatorBaseStakeUpdated(nodeId, delegatorKey);
          
          // Try to query in chunks to avoid timeout
          const currentBlock = await provider.getBlockNumber();
          const chunkSize = network === 'Base' ? 100000 : (network === 'Neuroweb' ? 10000 : 1000000);
          let allEvents = [];
          
          // Start from the oldest indexer event block and go forward
          const oldestIndexerBlock = allIndexerEventsResult.rows[allIndexerEventsResult.rows.length - 1].block_number;
          const fromBlock = Math.max(0, oldestIndexerBlock - 1000); // Start 1000 blocks before oldest indexer event
          
          // Use sequential processing for simplicity in this test
          for (let startBlock = fromBlock; startBlock <= currentBlock; startBlock += chunkSize) {
            const endBlock = Math.min(startBlock + chunkSize - 1, currentBlock);
            
            let chunkRetryCount = 0;
            let chunkEvents = [];
            
            while (true) { // Infinite retry loop
              try {
                chunkEvents = await stakingContract.queryFilter(filter, startBlock, endBlock);
                if (chunkRetryCount > 0) {
                  console.log(`         ✅ Chunk ${startBlock}-${endBlock} succeeded after ${chunkRetryCount} retries`);
                }
                allEvents = allEvents.concat(chunkEvents);
                break; // Success, exit retry loop
              } catch (error) {
                chunkRetryCount++;
                console.log(`         ⚠️ Chunk ${startBlock}-${endBlock} failed (attempt ${chunkRetryCount}): ${error.message}`);
                console.log(`         ⏳ Retrying in 3 seconds...`);
                await new Promise(resolve => setTimeout(resolve, 3000)); // 3 seconds
              }
            }
          }
          
          console.log(`      📊 Found ${allEvents.length} contract events for node ${nodeId}, delegator ${delegatorKey}`);
          
          // Group contract events by block number and sort by stake (highest first)
          const contractEventsByBlock = {};
          for (const event of allEvents) {
            const blockNum = event.blockNumber;
            if (!contractEventsByBlock[blockNum]) {
              contractEventsByBlock[blockNum] = [];
            }
            contractEventsByBlock[blockNum].push({
              blockNumber: blockNum,
              stake: event.args.stakeBase
            });
          }
          
          // Sort each block's events by stake (highest first) and keep only the highest
          const processedContractEvents = [];
          for (const [blockNum, events] of Object.entries(contractEventsByBlock)) {
            events.sort((a, b) => Number(b.stake - a.stake)); // Sort by stake descending
            processedContractEvents.push(events[0]); // Keep only the highest stake
          }
          
          // Sort processed events by block number (newest first)
          processedContractEvents.sort((a, b) => b.blockNumber - a.blockNumber);
          
          console.log(`      📊 Processed ${processedContractEvents.length} unique blocks from contract`);
          
          contractEvents = processedContractEvents;
          
          if (retryCount > 0) {
            console.log(`         ✅ RPC query succeeded after ${retryCount} retries`);
          }
          break; // Success, exit retry loop
        } catch (error) {
          retryCount++;
          if (retryCount === 0) {
            console.log(`      ⚠️ Node ${nodeId}, Delegator ${delegatorKey}: RPC Error - ${error.message}`);
            return { passed: 0, failed: 0, warnings: 0, rpcErrors: 1, totalValidations: 0 };
          }
          await new Promise(resolve => setTimeout(resolve, 2.5 * 60 * 1000)); // 2.5 minutes
        }
      }
      
      if (contractEvents.length === 0) {
        console.log(`      ⚠️ Node ${nodeId}, Delegator ${delegatorKey}: No contract events found, skipping validation`);
        return { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, totalValidations: 0 };
      }
      
      // Find common blocks between indexer and contract events
      const indexerBlocks = new Set(processedIndexerEvents.map(e => e.blockNumber));
      const contractBlocks = new Set(processedContractEvents.map(e => e.blockNumber));
      const commonBlocks = [...indexerBlocks].filter(block => contractBlocks.has(block));
      
      console.log(`      📊 Found ${commonBlocks.length} common blocks to validate`);
      
      if (commonBlocks.length === 0) {
        console.log(`      ⚠️ Node ${nodeId}, Delegator ${delegatorKey}: No common blocks found, cannot validate`);
        return { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, totalValidations: 0 };
      }
      
      // Sort common blocks in descending order (newest first)
      commonBlocks.sort((a, b) => b - a);
      
      let passed = 0;
      let failed = 0;
      let warnings = 0;
      let rpcErrors = 0;
      const totalValidations = commonBlocks.length;
      
      // Validate each common block in descending order
      for (let i = 0; i < commonBlocks.length; i++) {
        const blockNumber = commonBlocks[i];
        const indexerEvent = processedIndexerEvents.find(e => e.blockNumber === blockNumber);
        const contractEvent = processedContractEvents.find(e => e.blockNumber === blockNumber);
        
        if (!indexerEvent || !contractEvent) {
          console.log(`         ⚠️ Block ${blockNumber}: Missing event data`);
          continue;
        }
        
        const expectedStake = indexerEvent.stake;
        const actualStake = contractEvent.stake;
        const difference = expectedStake - actualStake;
        const tolerance = 500000000000000000n; // 0.5 TRAC in wei
        
        console.log(`         📊 Block ${blockNumber} (${i + 1}/${totalValidations}):`);
        console.log(`            Indexer: ${this.weiToTRAC(expectedStake)} TRAC`);
        console.log(`            Contract: ${this.weiToTRAC(actualStake)} TRAC`);
        
        if (difference === 0n || difference === 0) {
          console.log(`            ✅ PASSED - Stakes match exactly`);
          passed++;
        } else if (difference >= -tolerance && difference <= tolerance) {
          console.log(`            ⚠️ WARNING - Small difference: ${difference > 0 ? '+' : ''}${this.weiToTRAC(difference > 0 ? difference : -difference)} TRAC (within tolerance)`);
          warnings++;
        } else {
          console.log(`            ❌ FAILED - Large difference: ${difference > 0 ? '+' : ''}${this.weiToTRAC(difference > 0 ? difference : -difference)} TRAC`);
          failed++;
        }
      }
      
      console.log(`      📊 Node ${nodeId}, Delegator ${delegatorKey} Summary:`);
      console.log(`         ✅ Passed: ${passed}/${totalValidations}`);
      console.log(`         ❌ Failed: ${failed}/${totalValidations}`);
      console.log(`         ⚠️ Warnings: ${warnings}/${totalValidations}`);
      
      return { passed, failed, warnings, rpcErrors, totalValidations };
      
    } catch (error) {
      console.log(`      ⚠️ Node ${nodeId}, Delegator ${delegatorKey}: Error - ${error.message}`);
      if (error.message.includes('RPC') || error.message.includes('network') || error.message.includes('connection')) {
        return { passed: 0, failed: 0, warnings: 0, rpcErrors: 1, totalValidations: 0 };
      } else {
        return { passed: 0, failed: 1, warnings: 0, rpcErrors: 0, totalValidations: 0 };
      }
    }
  }
}

// Test the new comprehensive validation function
async function testComprehensiveValidation() {
  const qaService = new CompleteQAService();

  console.log('🧪 Testing comprehensive delegator validation...');

  // Test with a specific network
  const results = await qaService.validateDelegatorStakesComprehensive('Base');

  console.log('\n🎯 Final Results:', results);
}

testComprehensiveValidation().catch(console.error); 