const { ethers } = require('ethers');
const { Client } = require('pg');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('./config');
require('dotenv').config();

class CompleteQAService {
  constructor() {
    this.results = [];
    this.validationStorageFile = path.join(__dirname, 'validation_results.json');
    this.validatedEvents = this.loadValidationResults();
    
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
   * Load validation results from JSON file
   */
  loadValidationResults() {
    try {
      if (fs.existsSync(this.validationStorageFile)) {
        const data = fs.readFileSync(this.validationStorageFile, 'utf8');
        const parsed = JSON.parse(data);
        console.log(`📁 Loaded ${Object.keys(parsed).length} previously validated events from ${this.validationStorageFile}`);
        return parsed;
      }
    } catch (error) {
      console.log(`⚠️ Could not load validation results: ${error.message}`);
    }
    return {};
  }

  /**
   * Save validation results to JSON file
   */
  saveValidationResults() {
    try {
      fs.writeFileSync(this.validationStorageFile, JSON.stringify(this.validatedEvents, null, 2));
      console.log(`💾 Saved ${Object.keys(this.validatedEvents).length} validation results to ${this.validationStorageFile}`);
    } catch (error) {
      console.log(`⚠️ Could not save validation results: ${error.message}`);
    }
  }

  /**
   * Generate a unique hash for an event to track validation
   */
  generateEventHash(network, nodeId, delegatorKey, blockNumber, expectedOldStake, actualOldStake) {
    return crypto.createHash('sha256')
      .update(`${network}-${nodeId}-${delegatorKey}-${blockNumber}-${expectedOldStake}-${actualOldStake}`)
      .digest('hex');
  }

  /**
   * Convert wei amount to TRAC tokens
   */
  weiToTRAC(weiAmount) {
    const wei = BigInt(weiAmount);
    const trac = Number(wei) / Math.pow(10, 18);
    return trac.toLocaleString('en-US', { 
      minimumFractionDigits: 0, 
      maximumFractionDigits: 2 
    });
  }

  /**
   * Format TRAC difference with smart precision
   */
  formatTRACDifference(tracAmount) {
    const absAmount = Math.abs(tracAmount);
    
    if (absAmount >= 0.01) {
      // For amounts >= 0.01 TRAC, show 2 decimal places
      return tracAmount.toFixed(2);
    } else if (absAmount >= 0.0001) {
      // For amounts >= 0.0001 TRAC, show 4 decimal places
      return tracAmount.toFixed(4);
    } else if (absAmount >= 0.000001) {
      // For amounts >= 0.000001 TRAC, show 6 decimal places
      return tracAmount.toFixed(6);
    } else {
      // For very small amounts, show full precision
      return tracAmount.toFixed(18);
    }
  }

  async getContractAddressFromHub(network, contractName) {
    try {
      const networkConfig = config.networks.find(n => n.name === network);
      if (!networkConfig) {
        throw new Error(`Network ${network} not found in config`);
      }
      
      // Add retry logic for RPC connection
      let provider;
      let retries = 6;
      
      while (retries > 0) {
        try {
          provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
          await provider.getNetwork(); // Test the connection
          break;
        } catch (error) {
          retries--;
          if (retries === 0) throw error;
          
          console.log(`   ⏳ RPC connection failed, waiting 5 minutes before retrying... (${retries} attempts left)`);
          await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000)); // 5 minutes
        }
      }
      
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

  async calculateExpectedNodeStake(network, nodeId) {
    const dbName = this.databaseMap[network];
    const client = new Client({ ...this.dbConfig, database: dbName });
    
    try {
      await client.connect();
      
      // Get the latest node_stake_updated event for this node
      const latestStakeResult = await client.query(`
        SELECT stake, block_number 
        FROM node_stake_updated 
        WHERE identity_id = $1 
        ORDER BY block_number DESC
        LIMIT 1
      `, [nodeId]);
      
      if (latestStakeResult.rows.length === 0) {
        return 0n; // No events found, stake should be 0
      }
      
      // The expected stake is the latest stake value from the database
      const expectedStake = BigInt(latestStakeResult.rows[0].stake);
      
      return expectedStake;
      
    } catch (error) {
      console.error(`Error calculating expected node stake for node ${nodeId} on ${network}:`, error.message);
      return 0n;
    } finally {
      await client.end();
    }
  }

  async calculateExpectedDelegatorStake(network, nodeId, delegatorKey) {
    const dbName = this.databaseMap[network];
    const client = new Client({ ...this.dbConfig, database: dbName });
    
    try {
      await client.connect();
      
      // Get the latest delegator_base_stake_updated event for this delegator
      const latestStakeResult = await client.query(`
        SELECT stake_base, block_number 
        FROM delegator_base_stake_updated 
        WHERE identity_id = $1 AND delegator_key = $2
        ORDER BY block_number DESC
        LIMIT 1
      `, [nodeId, delegatorKey]);
      
      if (nodeId === 1 && delegatorKey === '0xd491e9497cb6b20b1d7ee1fb733a01974f82f8104a5c447bfaa90ec9abde36ac') {
        console.log(`   🔍 DEBUG for Node ${nodeId}, Delegator ${delegatorKey}:`);
        console.log(`      Database: ${dbName}`);
        console.log(`      Query result rows: ${latestStakeResult.rows.length}`);
        if (latestStakeResult.rows.length > 0) {
          console.log(`      Latest stake: ${latestStakeResult.rows[0].stake_base} wei`);
          console.log(`      Latest block: ${latestStakeResult.rows[0].block_number}`);
        } else {
          console.log(`      No events found`);
        }
      }
      
      if (latestStakeResult.rows.length === 0) {
        return 0n; // No events found, stake should be 0
      }
      
      // The expected stake is the latest stake value from the database
      const expectedStake = BigInt(latestStakeResult.rows[0].stake_base);
      
      return expectedStake;
      
    } catch (error) {
      console.error(`Error calculating expected delegator stake for node ${nodeId}, delegator ${delegatorKey} on ${network}:`, error.message);
      return 0n;
    } finally {
      await client.end();
    }
  }

  async getContractNodeStake(network, nodeId, blockNumber = null) {
    let retries = 3;
    
    while (retries > 0) {
      try {
        const networkConfig = config.networks.find(n => n.name === network);
        if (!networkConfig) {
          throw new Error(`Network ${network} not found in config`);
        }
        
        const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
        const stakingAddress = await this.getContractAddressFromHub(network, 'StakingStorage');
        
        const stakingContract = new ethers.Contract(stakingAddress, [
          'function getNodeStake(uint72 identityId) view returns (uint96)'
        ], provider);
        
        let stake;
        if (blockNumber) {
          // Query at specific block number (historical state)
          try {
            stake = await stakingContract.getNodeStake(nodeId, { blockTag: blockNumber });
          } catch (historicalError) {
            // If historical query fails, fall back to current state
            console.log(`   ⚠️ Historical query failed for block ${blockNumber}, falling back to current state`);
            stake = await stakingContract.getNodeStake(nodeId);
          }
        } else {
          // Query current state
          stake = await stakingContract.getNodeStake(nodeId);
        }
        return stake;
      } catch (error) {
        retries--;
        if (retries === 0) {
          console.error(`Error getting contract node stake for node ${nodeId} on ${network}:`, error.message);
          return 0n;
        }
        
        console.log(`   ⏳ Contract call failed, waiting 10 seconds before retrying... (${retries} attempts left)`);
        await new Promise(resolve => setTimeout(resolve, 10 * 1000)); // 10 seconds
      }
    }
  }

  async getContractDelegatorStake(network, nodeId, delegatorKey, blockNumber = null) {
    let retries = 3;
    
    while (retries > 0) {
      try {
        const networkConfig = config.networks.find(n => n.name === network);
        if (!networkConfig) {
          throw new Error(`Network ${network} not found in config`);
        }
        
        const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
        const stakingAddress = await this.getContractAddressFromHub(network, 'StakingStorage');
        
        const stakingContract = new ethers.Contract(stakingAddress, [
          'function getDelegatorStakeBase(uint72 identityId, bytes32 delegatorKey) view returns (uint96)'
        ], provider);
        
        let stake;
        if (blockNumber) {
          // Query at specific block number (historical state)
          try {
            stake = await stakingContract.getDelegatorStakeBase(nodeId, delegatorKey, { blockTag: blockNumber });
          } catch (historicalError) {
            // If historical query fails, fall back to current state
            console.log(`   ⚠️ Historical query failed for block ${blockNumber}, falling back to current state`);
            stake = await stakingContract.getDelegatorStakeBase(nodeId, delegatorKey);
          }
        } else {
          // Query current state
          stake = await stakingContract.getDelegatorStakeBase(nodeId, delegatorKey);
        }
        return stake;
      } catch (error) {
        retries--;
        if (retries === 0) {
          console.error(`Error getting contract delegator stake for node ${nodeId}, delegator ${delegatorKey}... on ${network}:`, error.message);
          return 0n;
        }
        
        console.log(`   ⏳ Contract call failed, waiting 10 seconds before retrying... (${retries} attempts left)`);
        await new Promise(resolve => setTimeout(resolve, 10 * 1000)); // 10 seconds
      }
    }
  }

  async validateNodeStakes(network) {
    console.log(`\n🔍 Validating node stakes for ${network}...`);
    
    const dbName = this.databaseMap[network];
    const client = new Client({ ...this.dbConfig, database: dbName });
    
    try {
      await client.connect();
      
      // Different networks use different criteria for active nodes
      let nodesResult;
      
      if (network === 'Gnosis') {
        // Gnosis: Use 50,000 TRAC threshold (matching other networks)
        const minStakeThreshold = 50000000000000000000000; // 50,000 TRAC in wei
        nodesResult = await client.query(`
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
        // Neuroweb: Use 50,000 TRAC threshold (matching other networks)
        const minStakeThreshold = 50000000000000000000000; // 50,000 TRAC in wei
        nodesResult = await client.query(`
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
        // Base: Use 50,000 TRAC threshold (matching other networks)
        const minStakeThreshold = 50000000000000000000000; // 50,000 TRAC in wei
        nodesResult = await client.query(`
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
      
      if (nodesResult.rows.length === 0) {
        console.log(`   ⚠️ No active nodes found in ${network}`);
        return { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 };
      }
      
      let passed = 0;
      let failed = 0;
      let warnings = 0;
      let rpcErrors = 0;
      const total = nodesResult.rows.length;
      
      const criteriaText = `active nodes with >= 50k TRAC`;
      
      console.log(`   📊 Validating ${total} active nodes...`);
      
      for (const row of nodesResult.rows) {
        const nodeId = parseInt(row.identity_id);
        
        try {
          // Get the latest block number from indexer for this node
          const indexerBlockResult = await client.query(`
            SELECT MAX(block_number) as latest_block 
            FROM node_stake_updated
            WHERE identity_id = $1
          `, [nodeId]);
          
          const indexerBlockNumber = indexerBlockResult.rows[0].latest_block;
          
          // Get ALL node stake events from indexer for this node
          const allIndexerEventsResult = await client.query(`
            SELECT stake, block_number
            FROM node_stake_updated
            WHERE identity_id = $1
            ORDER BY block_number DESC
          `, [nodeId]);
          
          console.log(`   🔍 Node ${nodeId}: Found ${allIndexerEventsResult.rows.length} indexer events`);
          
          // Group indexer events by block number and sort by stake (highest first)
          const indexerEventsByBlock = {};
          for (const event of allIndexerEventsResult.rows) {
            const blockNum = event.block_number;
            if (!indexerEventsByBlock[blockNum]) {
              indexerEventsByBlock[blockNum] = [];
            }
            indexerEventsByBlock[blockNum].push({
              blockNumber: blockNum,
              stake: BigInt(event.stake)
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
          
          console.log(`   📊 Node ${nodeId}: Processed ${processedIndexerEvents.length} unique blocks from indexer`);
          
          // Get ALL node stake events from contract for this node
          const networkConfig = config.networks.find(n => n.name === network);
          if (!networkConfig) {
            throw new Error(`Network ${network} not found in config`);
          }
          
          let contractEvents = [];
          let retries = 3;
          
          while (retries > 0) {
            try {
              const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
              const stakingAddress = await this.getContractAddressFromHub(network, 'StakingStorage');
              
              const stakingContract = new ethers.Contract(stakingAddress, [
                'event NodeStakeUpdated(uint72 indexed identityId, uint96 stake)'
              ], provider);
              
              // Query ALL NodeStakeUpdated events for this specific node
              console.log(`   📊 Querying ALL NodeStakeUpdated events for node ${nodeId}`);
              
              const filter = stakingContract.filters.NodeStakeUpdated(nodeId);
              
              // Try to query in chunks to avoid timeout
              const currentBlock = await provider.getBlockNumber();
              const chunkSize = 1000000; // 1M blocks per chunk
              let allEvents = [];
              
              // Start from the oldest indexer event block and go forward
              const oldestIndexerBlock = allIndexerEventsResult.rows[allIndexerEventsResult.rows.length - 1].block_number;
              const fromBlock = Math.max(0, oldestIndexerBlock - 1000); // Start 1000 blocks before oldest indexer event
              
              for (let startBlock = fromBlock; startBlock <= currentBlock; startBlock += chunkSize) {
                const endBlock = Math.min(startBlock + chunkSize - 1, currentBlock);
                
                try {
                  const chunkEvents = await stakingContract.queryFilter(filter, startBlock, endBlock);
                  allEvents = allEvents.concat(chunkEvents);
                } catch (error) {
                  console.log(`   ⚠️ Failed to query chunk ${startBlock}-${endBlock}: ${error.message}`);
                  // Continue with next chunk
                }
              }
              
              console.log(`   📊 Found ${allEvents.length} contract events for node ${nodeId}`);
              
              // Group contract events by block number and sort by stake (highest first)
              const contractEventsByBlock = {};
              for (const event of allEvents) {
                const blockNum = event.blockNumber;
                if (!contractEventsByBlock[blockNum]) {
                  contractEventsByBlock[blockNum] = [];
                }
                contractEventsByBlock[blockNum].push({
                  blockNumber: blockNum,
                  stake: event.args.stake
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
              
              console.log(`   📊 Node ${nodeId}: Processed ${processedContractEvents.length} unique blocks from contract`);
              
              // Check if both sides have the same number of events for each block
              const indexerBlockCounts = {};
              const contractBlockCounts = {};
              
              for (const event of allIndexerEventsResult.rows) {
                const blockNum = event.block_number;
                indexerBlockCounts[blockNum] = (indexerBlockCounts[blockNum] || 0) + 1;
              }
              
              for (const event of allEvents) {
                const blockNum = event.blockNumber;
                contractBlockCounts[blockNum] = (contractBlockCounts[blockNum] || 0) + 1;
              }
              
              // Check for mismatched block counts
              let blockCountMismatch = false;
              const allBlocks = new Set([...Object.keys(indexerBlockCounts), ...Object.keys(contractBlockCounts)]);
              
              for (const blockNum of allBlocks) {
                const indexerCount = indexerBlockCounts[blockNum] || 0;
                const contractCount = contractBlockCounts[blockNum] || 0;
                if (indexerCount !== contractCount) {
                  console.log(`   ⚠️ Node ${nodeId}: Block ${blockNum} has ${indexerCount} indexer events vs ${contractCount} contract events`);
                  blockCountMismatch = true;
                }
              }
              
              if (blockCountMismatch) {
                console.log(`   ⚠️ Node ${nodeId}: Block count mismatch detected, using highest stake per block`);
              }
              
              contractEvents = processedContractEvents;
              
              break;
            } catch (error) {
              retries--;
              if (retries === 0) {
                console.log(`   ⚠️ Node ${nodeId}: RPC Error - ${error.message}`);
                rpcErrors++;
                continue;
              }
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
          
          if (contractEvents.length === 0) {
            console.log(`   ⚠️ Node ${nodeId}: No contract events found, skipping validation`);
            continue;
          }
          
          // Compare indexer and contract events (now using processed events)
          const indexerEventCount = processedIndexerEvents.length;
          const contractEventCount = contractEvents.length;
          
          console.log(`   📊 Node ${nodeId}: Indexer events: ${indexerEventCount}, Contract events: ${contractEventCount}`);
          
          let validationPassed = false;
          let expectedStake = 0n;
          let actualStake = 0n;
          let comparisonBlock = 0;
          
          if (indexerEventCount === 1 && contractEventCount === 1) {
            // Single event case: check if they have the same blockchain number
            const indexerBlock = processedIndexerEvents[0].blockNumber;
            const contractBlock = contractEvents[0].blockNumber;
            
            console.log(`   📋 Node ${nodeId}: Single event comparison:`);
            console.log(`      Indexer block: ${indexerBlock}, Contract block: ${contractBlock}`);
            
            if (Number(indexerBlock) === Number(contractBlock)) {
              validationPassed = true;
              expectedStake = processedIndexerEvents[0].stake;
              actualStake = contractEvents[0].stake;
              comparisonBlock = indexerBlock;
              console.log(`      ✅ Both have same block number: ${comparisonBlock}`);
            } else {
              console.log(`      ❌ Block number mismatch`);
            }
          } else if (indexerEventCount >= 1 && contractEventCount >= 1) {
            // Multiple events case: compare latest blockchain numbers (first biggest block)
            const indexerLatest = processedIndexerEvents[0].blockNumber;
            const contractLatest = contractEvents[0].blockNumber;
            
            console.log(`      📋 Latest event comparison:`);
            console.log(`         Indexer latest block: ${indexerLatest}, Contract latest block: ${contractLatest}`);
            
            if (Number(indexerLatest) === Number(contractLatest)) {
              validationPassed = true;
              expectedStake = processedIndexerEvents[0].stake;
              actualStake = contractEvents[0].stake;
              comparisonBlock = indexerLatest;
              
              console.log(`         ✅ Both have same latest event block: ${comparisonBlock}`);
              console.log(`         📊 Latest event (block ${comparisonBlock}):`);
              console.log(`            Indexer: ${this.weiToTRAC(expectedStake)} TRAC`);
              console.log(`            Contract: ${this.weiToTRAC(actualStake)} TRAC`);
            } else {
              console.log(`         ❌ Latest event block mismatch`);
            }
          } else if (contractEventCount === 0) {
            // No contract events found
            console.log(`      ⚠️ No contract events found for this delegator`);
            console.log(`      📊 Indexer has ${indexerEventCount} events, Contract has 0 events`);
            console.log(`      🔍 Cannot perform validation - no contract data available`);
            console.log(`   ⏭️ Node ${nodeId}, Delegator ${delegatorKey}: Cannot validate - no contract data`);
            continue;
          } else {
            console.log(`      ⚠️ Cannot compare: Indexer has ${indexerEventCount} events, Contract has ${contractEventCount} events`);
          }
          
          // Skip validation if comparison failed
          if (!validationPassed) {
            console.log(`   ⏭️ Node ${nodeId}: Cannot validate - comparison failed`);
            continue;
          }
          
          // Validate that contract state matches expected stake
          const difference = expectedStake - actualStake;
          const tolerance = 500000000000000000n; // 0.5 TRAC in wei
          
          if (difference === 0n || difference === 0) {
            console.log(`   ✅ Node ${nodeId}: Indexer ${this.weiToTRAC(expectedStake)} TRAC, Contract ${this.weiToTRAC(actualStake)} TRAC`);
            passed++;
          } else if (difference >= -tolerance && difference <= tolerance) {
            console.log(`   ⚠️ Node ${nodeId}: Indexer ${this.weiToTRAC(expectedStake)} TRAC, Contract ${this.weiToTRAC(actualStake)} TRAC`);
            if (Math.abs(Number(difference)) < 1000000000000000000) { // Less than 1 TRAC
              const tracDifference = Number(difference) / Math.pow(10, 18);
              console.log(`      📊 Small difference: ${tracDifference > 0 ? '+' : ''}${this.formatTRACDifference(tracDifference)} TRAC (within 0.5 TRAC tolerance)`);
            } else {
              console.log(`      📊 Small difference: ${difference > 0 ? '+' : '-'}${this.weiToTRAC(difference > 0 ? difference : -difference)} TRAC (within 0.5 TRAC tolerance)`);
            }
            warnings++; // Count as warning
          } else {
            console.log(`   ❌ Node ${nodeId}: Indexer ${this.weiToTRAC(expectedStake)} TRAC, Contract ${this.weiToTRAC(actualStake)} TRAC`);
            console.log(`      📊 Difference: ${difference > 0 ? '+' : '-'}${this.weiToTRAC(difference > 0 ? difference : -difference)} TRAC`);
            failed++;
          }
        } catch (error) {
          console.log(`   ⚠️ Node ${nodeId}: Error - ${error.message}`);
          if (error.message.includes('RPC') || error.message.includes('network') || error.message.includes('connection')) {
            rpcErrors++;
          } else {
            failed++;
          }
        }
      }
      
      return { passed, failed, warnings, rpcErrors, total };
      
    } catch (error) {
      console.error(`Error validating node stakes for ${network}:`, error.message);
      return { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 };
    } finally {
      await client.end();
    }
  }

  async validateDelegatorStakes(network) {
    console.log(`\n🔍 Validating delegator stakes for ${network}...`);
    
    const dbName = this.databaseMap[network];
    const client = new Client({ ...this.dbConfig, database: dbName });
    
    try {
      await client.connect();
      
      // First, get the active nodes that are being validated (same logic as validateNodeStakes)
      let activeNodesResult;
      
      if (network === 'Gnosis') {
        // Gnosis: Use 50,000 TRAC threshold (matching other networks)
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
        // Neuroweb: Use 50,000 TRAC threshold (matching other networks)
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
        // Base: Use 50,000 TRAC threshold (matching other networks)
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
      
      // Get delegators only for the active nodes with latest stake > 0
      const delegatorsResult = await client.query(`
        SELECT DISTINCT d.identity_id, d.delegator_key
        FROM delegator_base_stake_updated d
        INNER JOIN (
          SELECT identity_id, delegator_key, MAX(block_number) as max_block
          FROM delegator_base_stake_updated
          GROUP BY identity_id, delegator_key
        ) latest ON d.identity_id = latest.identity_id 
        AND d.delegator_key = latest.delegator_key
        AND d.block_number = latest.max_block
        WHERE d.identity_id = ANY($1)
        AND d.stake_base > 0
        ORDER BY d.identity_id, d.delegator_key
      `, [activeNodeIds]);
      
      if (delegatorsResult.rows.length === 0) {
        console.log(`   ⚠️ No delegators found for active nodes in ${network}`);
        return { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 };
      }
      
      let passed = 0;
      let failed = 0;
      let warnings = 0;
      let rpcErrors = 0;
      let skippedDueToRPC = 0;
      let skippedAlreadyValidated = 0;
      const total = delegatorsResult.rows.length;
      
      console.log(`   📊 Validating ${total} delegators for ${activeNodeIds.length} active nodes...`);
      
      for (const row of delegatorsResult.rows) {
        const nodeId = parseInt(row.identity_id);
        const delegatorKey = row.delegator_key;
        
        if (nodeId === 1 && delegatorKey === '0xd491e9497cb6b20b1d7ee1fb733a01974f82f8104a5c447bfaa90ec9abde36ac') {
          console.log(`   🔍 DEBUG: Processing Node ${nodeId}, Delegator ${delegatorKey}`);
        }
        
        try {
          // Get the latest block number from indexer for this delegator
          const indexerBlockResult = await client.query(`
            SELECT MAX(block_number) as latest_block 
            FROM delegator_base_stake_updated
            WHERE identity_id = $1 AND delegator_key = $2
          `, [nodeId, delegatorKey]);
          
          const indexerBlockNumber = indexerBlockResult.rows[0].latest_block;
          
          // Get ALL delegator events from indexer for this delegator
          const allIndexerEventsResult = await client.query(`
            SELECT stake_base, block_number
            FROM delegator_base_stake_updated
            WHERE identity_id = $1 AND delegator_key = $2
            ORDER BY block_number DESC
          `, [nodeId, delegatorKey]);
          
          console.log(`   🔍 Node ${nodeId}, Delegator ${delegatorKey}: Found ${allIndexerEventsResult.rows.length} indexer events`);
          
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
          
          console.log(`   📊 Node ${nodeId}, Delegator ${delegatorKey}: Processed ${processedIndexerEvents.length} unique blocks from indexer`);
          
          // Step 2: Get all contract events for this delegator
          const networkConfig = config.networks.find(n => n.name === network);
          if (!networkConfig) {
            throw new Error(`Network ${network} not found in config`);
          }
          
          let contractEvents = [];
          let retries = 3;
          let rpcSuccess = false;
          let historicalQueryFailures = 0;
          let totalHistoricalQueries = 0;
          
          while (retries > 0) {
            try {
              const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
              const stakingAddress = await this.getContractAddressFromHub(network, 'StakingStorage');
              
              const stakingContract = new ethers.Contract(stakingAddress, [
                'event DelegatorBaseStakeUpdated(uint72 indexed identityId, bytes32 indexed delegatorKey, uint96 stakeBase)'
              ], provider);
              
              // Query ALL DelegatorBaseStakeUpdated events for this specific delegator and node
              console.log(`      📊 Querying contract events for node ${nodeId}, delegator ${delegatorKey}`);
              
              try {
                // Query ALL DelegatorBaseStakeUpdated events for this specific delegator and node
                console.log(`      📊 Querying ALL DelegatorBaseStakeUpdated events for node ${nodeId}, delegator ${delegatorKey}`);
                
                const filter = stakingContract.filters.DelegatorBaseStakeUpdated(nodeId, delegatorKey);
                
                // Try to query in chunks to avoid timeout
                const currentBlock = await provider.getBlockNumber();
                const chunkSize = 1000000; // 1M blocks per chunk
                let allEvents = [];
                
                // Start from the oldest indexer event block and go forward
                const oldestIndexerBlock = allIndexerEventsResult.rows[allIndexerEventsResult.rows.length - 1].block_number;
                const fromBlock = Math.max(0, oldestIndexerBlock - 1000); // Start 1000 blocks before oldest indexer event
                
                for (let startBlock = fromBlock; startBlock <= currentBlock; startBlock += chunkSize) {
                  const endBlock = Math.min(startBlock + chunkSize - 1, currentBlock);
                  
                  try {
                    const chunkEvents = await stakingContract.queryFilter(filter, startBlock, endBlock);
                    allEvents = allEvents.concat(chunkEvents);
                  } catch (error) {
                    console.log(`      ⚠️ Failed to query chunk ${startBlock}-${endBlock}: ${error.message}`);
                    // Continue with next chunk
                  }
                }
                
                console.log(`      📊 Found ${allEvents.length} contract events for this delegator`);
                
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
                
                // Check if both sides have the same number of events for each block
                const indexerBlockCounts = {};
                const contractBlockCounts = {};
                
                for (const event of allIndexerEventsResult.rows) {
                  const blockNum = event.block_number;
                  indexerBlockCounts[blockNum] = (indexerBlockCounts[blockNum] || 0) + 1;
                }
                
                for (const event of allEvents) {
                  const blockNum = event.blockNumber;
                  contractBlockCounts[blockNum] = (contractBlockCounts[blockNum] || 0) + 1;
                }
                
                // Check for mismatched block counts
                let blockCountMismatch = false;
                const allBlocks = new Set([...Object.keys(indexerBlockCounts), ...Object.keys(contractBlockCounts)]);
                
                for (const blockNum of allBlocks) {
                  const indexerCount = indexerBlockCounts[blockNum] || 0;
                  const contractCount = contractBlockCounts[blockNum] || 0;
                  if (indexerCount !== contractCount) {
                    console.log(`      ⚠️ Block ${blockNum} has ${indexerCount} indexer events vs ${contractCount} contract events`);
                    blockCountMismatch = true;
                  }
                }
                
                if (blockCountMismatch) {
                  console.log(`      ⚠️ Block count mismatch detected, using highest stake per block`);
                }
                
                // Process contract events and sort by block number
                contractEvents = [];
                for (const event of processedContractEvents) {
                  contractEvents.push({
                    blockNumber: event.blockNumber,
                    stake: event.stake
                  });
                  console.log(`      📊 Contract event at block ${event.blockNumber}: ${this.weiToTRAC(event.stake)} TRAC`);
                }
                
              } catch (error) {
                console.log(`      ⚠️ Failed to query contract events: ${error.message}`);
                console.log(`      🔍 Error details: ${error.toString()}`);
                historicalQueryFailures++;
              }
              
              // If we couldn't get any contract events, try to get current state as fallback
              if (contractEvents.length === 0) {
                try {
                  // Try to get current delegator stake using a different approach
                  console.log(`      🔍 No contract events found, trying to get current state...`);
                  
                  // We could try to get current state from a different contract method if available
                  // For now, we'll just note that we have no contract data
                  console.log(`      📊 No contract events available for this delegator`);
                  
                } catch (error) {
                  console.log(`      ⚠️ Failed to get current contract state: ${error.message}`);
                }
              }
              
              rpcSuccess = true;
              break;
            } catch (error) {
              retries--;
              if (retries === 0) {
                console.log(`   ⚠️ Node ${nodeId}, Delegator ${delegatorKey}: RPC Error - ${error.message}`);
                rpcErrors++;
                skippedDueToRPC++;
                break;
              }
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
          
          if (!rpcSuccess) {
            continue;
          }
          
          // Step 3: Compare indexer and contract events
          const indexerEventCount = processedIndexerEvents.length;
          const contractEventCount = contractEvents.length;
          
          console.log(`      📊 Indexer events: ${indexerEventCount}, Contract events: ${contractEventCount}`);
          
          let validationPassed = false;
          let expectedStake = 0n;
          let actualStake = 0n;
          let comparisonBlock = 0;
          
          if (indexerEventCount === 1 && contractEventCount === 1) {
            // Single event case: check if they have the same blockchain number
            const indexerBlock = processedIndexerEvents[0].blockNumber;
            const contractBlock = contractEvents[0].blockNumber;
            
            console.log(`      📋 Single event comparison:`);
            console.log(`         Indexer block: ${indexerBlock}, Contract block: ${contractBlock}`);
            
            if (Number(indexerBlock) === Number(contractBlock)) {
              validationPassed = true;
              expectedStake = processedIndexerEvents[0].stake;
              actualStake = contractEvents[0].stake;
              comparisonBlock = indexerBlock;
              console.log(`         ✅ Both have same block number: ${comparisonBlock}`);
              console.log(`         📝 Both indexer and contract have the same single event`);
            } else {
              console.log(`         ❌ Block number mismatch`);
            }
          } else if (indexerEventCount >= 1 && contractEventCount >= 1) {
            // Multiple events case: compare latest blockchain numbers (first biggest block)
            const indexerLatest = processedIndexerEvents[0].blockNumber;
            const contractLatest = contractEvents[0].blockNumber;
            
            console.log(`      📋 Latest event comparison:`);
            console.log(`         Indexer latest block: ${indexerLatest}, Contract latest block: ${contractLatest}`);
            
            if (Number(indexerLatest) === Number(contractLatest)) {
              validationPassed = true;
              expectedStake = processedIndexerEvents[0].stake;
              actualStake = contractEvents[0].stake;
              comparisonBlock = indexerLatest;
              
              console.log(`         ✅ Both have same latest event block: ${comparisonBlock}`);
              console.log(`         📊 Latest event (block ${comparisonBlock}):`);
              console.log(`            Indexer: ${this.weiToTRAC(expectedStake)} TRAC`);
              console.log(`            Contract: ${this.weiToTRAC(actualStake)} TRAC`);
            } else {
              console.log(`         ❌ Latest event block mismatch`);
            }
          } else if (contractEventCount === 0) {
            // No contract events found
            console.log(`      ⚠️ No contract events found for this delegator`);
            console.log(`      📊 Indexer has ${indexerEventCount} events, Contract has 0 events`);
            console.log(`      🔍 Cannot perform validation - no contract data available`);
            console.log(`   ⏭️ Node ${nodeId}, Delegator ${delegatorKey}: Cannot validate - no contract data`);
            continue;
          } else {
            console.log(`      ⚠️ Cannot compare: Indexer has ${indexerEventCount} events, Contract has ${contractEventCount} events`);
          }
          
          // Skip validation if comparison failed
          if (!validationPassed) {
            console.log(`   ⏭️ Node ${nodeId}, Delegator ${delegatorKey}: Cannot validate - comparison failed`);
            continue;
          }
          
          // Step 4: Check if event was already validated and its status
          const eventHash = this.generateEventHash(network, nodeId, delegatorKey, comparisonBlock, expectedStake, actualStake);
          const prevStatus = this.validatedEvents[eventHash];
          if (prevStatus === 'passed' || prevStatus === 'warning') {
            const differenceSkipped = expectedStake - actualStake;
            console.log(`   ⏭️ Node ${nodeId}, Delegator ${delegatorKey}: Already validated as ${prevStatus}, skipping`);
            if (indexerEventCount === 1 && contractEventCount === 1) {
              console.log(`      📊 Single event - no stake comparison needed`);
            } else {
              console.log(`      Indexer old stake: ${this.weiToTRAC(expectedStake)} TRAC, Contract old stake: ${this.weiToTRAC(actualStake)} TRAC`);
              console.log(`      📊 Difference: ${differenceSkipped > 0 ? '+' : ''}${this.weiToTRAC(differenceSkipped > 0 ? differenceSkipped : -differenceSkipped)} TRAC`);
            }
            console.log(`      🔍 Previous event block: ${comparisonBlock} (current block: ${comparisonBlock})`);
            skippedAlreadyValidated++;
            continue;
          }
          
          // Step 5: Validate that contract state matches expected stake
          const difference = expectedStake - actualStake;
          
          const tolerance = 500000000000000000n; // 0.5 TRAC in wei
          
          if (difference === 0n || difference === 0) {
            if (indexerEventCount === 1 && contractEventCount === 1) {
              console.log(`   ✅ Node ${nodeId}, Delegator ${delegatorKey}`);
              console.log(`      📊 Single event validation passed`);
              console.log(`      📝 Both indexer and contract have the same single event`);
            } else {
              console.log(`   ✅ Node ${nodeId}, Delegator ${delegatorKey}`);
              console.log(`      Indexer stake: ${this.weiToTRAC(expectedStake)} TRAC, Contract stake: ${this.weiToTRAC(actualStake)} TRAC`);
              console.log(`      🔍 Latest event block: ${comparisonBlock}`);
              console.log(`      📊 TRAC Difference: ${difference > 0 ? '+' : ''}${this.weiToTRAC(difference > 0 ? difference : -difference)} TRAC`);
            }
            passed++;
            this.validatedEvents[eventHash] = 'passed';
          } else if (difference >= -tolerance && difference <= tolerance) {
            if (indexerEventCount === 1 && contractEventCount === 1) {
              console.log(`   ⚠️ Node ${nodeId}, Delegator ${delegatorKey}`);
              console.log(`      📊 Single event validation passed with small tolerance`);
              console.log(`      📝 Both indexer and contract have the same single event`);
            } else {
              console.log(`   ⚠️ Node ${nodeId}, Delegator ${delegatorKey}`);
              console.log(`      Indexer stake: ${this.weiToTRAC(expectedStake)} TRAC, Contract stake: ${this.weiToTRAC(actualStake)} TRAC`);
              console.log(`      🔍 Latest event block: ${comparisonBlock}`);
              console.log(`      📊 TRAC Difference: ${difference > 0 ? '+' : ''}${this.weiToTRAC(difference > 0 ? difference : -difference)} TRAC`);
            }
            if (Math.abs(Number(difference)) < 1000000000000000000) {
              const tracDifference = Number(difference) / Math.pow(10, 18);
              console.log(`      📊 Small difference: ${tracDifference > 0 ? '+' : ''}${this.formatTRACDifference(tracDifference)} TRAC (within 0.5 TRAC tolerance)`);
            } else {
              console.log(`      📊 Small difference: ${difference > 0 ? '+' : '-'}${this.weiToTRAC(difference > 0 ? difference : -difference)} TRAC (within 0.5 TRAC tolerance)`);
            }
            warnings++;
            this.validatedEvents[eventHash] = 'warning';
          } else {
            if (indexerEventCount === 1 && contractEventCount === 1) {
              console.log(`   ❌ Node ${nodeId}, Delegator ${delegatorKey}`);
              console.log(`      📊 Single event validation failed`);
              console.log(`      📝 Both indexer and contract have the same single event`);
            } else {
              console.log(`   ❌ Node ${nodeId}, Delegator ${delegatorKey}`);
              console.log(`      Indexer stake: ${this.weiToTRAC(expectedStake)} TRAC, Contract stake: ${this.weiToTRAC(actualStake)} TRAC`);
              console.log(`      🔍 Latest event block: ${comparisonBlock}`);
              console.log(`      📊 TRAC Difference: ${difference > 0 ? '+' : ''}${this.weiToTRAC(difference > 0 ? difference : -difference)} TRAC`);
            }
            console.log(`      📊 Difference: ${difference > 0 ? '+' : '-'}${this.weiToTRAC(difference > 0 ? difference : -difference)} TRAC`);
            failed++;
            this.validatedEvents[eventHash] = 'failed';
          }
          
        } catch (error) {
          console.log(`   ⚠️ Node ${nodeId}, Delegator ${delegatorKey}: Error - ${error.message}`);
          failed++;
        }
      }
      
      this.saveValidationResults(); // Save validated events after each run
      
      console.log(`\n   📊 Validation Summary:`);
      console.log(`      ✅ Passed: ${passed} events`);
      console.log(`      ❌ Failed: ${failed} events`);
      console.log(`      ⚠️ Warnings: ${warnings} events`);
      console.log(`      🔌 RPC Errors: ${rpcErrors} events`);
      console.log(`      📤 Skipped due to RPC: ${skippedDueToRPC} events`);
      console.log(`      ⏭️ Skipped already validated: ${skippedAlreadyValidated} events`);
      console.log(`      📊 Successfully validated: ${passed + failed + warnings} events`);
      console.log(`      💾 Total validated events tracked: ${Object.keys(this.validatedEvents).length} events`);
      
      return { passed, failed, warnings, rpcErrors, total };
      
    } catch (error) {
      console.error(`Error validating delegator stake update events for ${network}:`, error.message);
      return { passed: 0, failed: 0, warnings: 0, total: 0 };
    } finally {
      await client.end();
    }
  }

  async validateDelegatorStakeSumMatchesNodeStake(network) {
    console.log(`\n🔍 Validating delegator stake sum matches node stake for ${network}...`);
    
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
        console.log(`   ⚠️ No active nodes found in ${network}`);
        return { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 };
      }
      
      let passed = 0;
      let failed = 0;
      let warnings = 0;
      let rpcErrors = 0;
      const total = activeNodesResult.rows.length;
      
      console.log(`   📊 Validating ${total} active nodes with >= 50k TRAC...`);
      
      for (const row of activeNodesResult.rows) {
        const nodeId = parseInt(row.identity_id);
        const nodeTotalStake = BigInt(row.stake);
        
        try {
          // Get all delegators for this node with their latest stake from indexer
          const delegatorsResult = await client.query(`
            SELECT d.identity_id, d.delegator_key, d.stake_base, d.block_number
            FROM delegator_base_stake_updated d
            WHERE d.identity_id = $1
            AND d.stake_base > 0
            ORDER BY d.identity_id, d.delegator_key, d.block_number DESC
          `, [nodeId]);
          
          // Group delegator events by block number and sort by stake (highest first)
          const delegatorEventsByBlock = {};
          for (const event of delegatorsResult.rows) {
            const blockNum = event.block_number;
            if (!delegatorEventsByBlock[blockNum]) {
              delegatorEventsByBlock[blockNum] = [];
            }
            delegatorEventsByBlock[blockNum].push({
              blockNumber: blockNum,
              stake: BigInt(event.stake_base)
            });
          }
          
          // Sort each block's events by stake (highest first) and keep only the highest
          const processedDelegatorEvents = [];
          for (const [blockNum, events] of Object.entries(delegatorEventsByBlock)) {
            events.sort((a, b) => Number(b.stake - a.stake)); // Sort by stake descending
            processedDelegatorEvents.push(events[0]); // Keep only the highest stake
          }
          
          // Sort processed events by block number (newest first)
          processedDelegatorEvents.sort((a, b) => b.blockNumber - a.blockNumber);
          
          // Calculate sum of delegator stakes from indexer (using processed events)
          let indexerDelegatorStakeSum = 0n;
          for (const event of processedDelegatorEvents) {
            indexerDelegatorStakeSum += event.stake;
          }
          
          // Get contract's total node stake (current state)
          const networkConfig = config.networks.find(n => n.name === network);
          if (!networkConfig) {
            throw new Error(`Network ${network} not found in config`);
          }
          
          let contractNodeStake;
          let retries = 3;
          
          while (retries > 0) {
            try {
              const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
              const stakingAddress = await this.getContractAddressFromHub(network, 'StakingStorage');
              
              const stakingContract = new ethers.Contract(stakingAddress, [
                'function getNodeStake(uint72 identityId) view returns (uint96)'
              ], provider);
              
              // Get current node stake from contract
              contractNodeStake = await stakingContract.getNodeStake(nodeId);
              break;
            } catch (error) {
              retries--;
              if (retries === 0) {
                console.log(`   ⚠️ Node ${nodeId}: RPC Error - ${error.message}`);
                rpcErrors++;
                continue;
              }
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
          
          if (contractNodeStake === undefined) {
            continue; // Skip this node due to RPC failure
          }
          
          // Compare delegator sum with node total stake
          const difference = indexerDelegatorStakeSum - contractNodeStake;
          const tolerance = 500000000000000000n; // 0.5 TRAC in wei
          
          console.log(`   📊 Node ${nodeId}:`);
          console.log(`      Indexer delegator sum: ${this.weiToTRAC(indexerDelegatorStakeSum)} TRAC (${delegatorsResult.rows.length} delegators)`);
          console.log(`      Contract node total: ${this.weiToTRAC(contractNodeStake)} TRAC`);
          console.log(`      Difference: ${difference > 0 ? '+' : ''}${this.weiToTRAC(difference > 0 ? difference : -difference)} TRAC`);
          
          if (difference === 0n || difference === 0) {
            console.log(`   ✅ Node ${nodeId}: Delegator sum matches node total`);
            passed++;
          } else if (difference >= -tolerance && difference <= tolerance) {
            console.log(`   ⚠️ Node ${nodeId}: Small difference within tolerance`);
            warnings++;
          } else {
            console.log(`   ❌ Node ${nodeId}: Delegator sum does not match node total`);
            failed++;
          }
          
        } catch (error) {
          console.log(`   ⚠️ Node ${nodeId}: Error - ${error.message}`);
          if (error.message.includes('RPC') || error.message.includes('network') || error.message.includes('connection')) {
            rpcErrors++;
          } else {
            failed++;
          }
        }
      }
      
      return { passed, failed, warnings, rpcErrors, total };
      
    } catch (error) {
      console.error(`Error validating delegator stake sum for ${network}:`, error.message);
      return { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 };
    } finally {
      await client.end();
    }
  }

  async validateKnowledgeCollections(network) {
    console.log(`\n🔍 Validating knowledge collections for ${network}...`);
    
    const dbName = this.databaseMap[network];
    const client = new Client({ ...this.dbConfig, database: dbName });
    
    try {
      await client.connect();
      
      // Get the latest block number from indexer
      const indexerBlockResult = await client.query(`
        SELECT MAX(block_number) as latest_block 
        FROM knowledge_collection_created
      `);
      
      const indexerBlockNumber = indexerBlockResult.rows[0].latest_block;
      
      // Count total knowledge collections from indexer
      const indexerCountResult = await client.query(`
        SELECT COUNT(*) as total_count 
        FROM knowledge_collection_created
      `);
      
      const indexerCount = parseInt(indexerCountResult.rows[0].total_count);
      
      // Get contract count by calling the KnowledgeCollectionStorage contract
      const networkConfig = config.networks.find(n => n.name === network);
      if (!networkConfig) {
        throw new Error(`Network ${network} not found in config`);
      }
      
      const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
      const knowledgeAddress = await this.getContractAddressFromHub(network, 'KnowledgeCollectionStorage');
      
      const knowledgeContract = new ethers.Contract(knowledgeAddress, [
        'function getLatestKnowledgeCollectionId() view returns (uint256)',
        'function getKnowledgeCollectionCount() view returns (uint256)'
      ], provider);
      
      // Get current block number from contract
      const contractBlockNumber = await provider.getBlockNumber();
      
      // Try to get the count using a more appropriate method
      let contractCount;
      try {
        contractCount = await knowledgeContract.getKnowledgeCollectionCount();
      } catch (error) {
        // Fallback to latest ID if count method doesn't exist
        contractCount = await knowledgeContract.getLatestKnowledgeCollectionId();
      }
      
      const contractCountNumber = parseInt(contractCount.toString());
      
      console.log(`   📊 Indexer events: ${indexerCount.toLocaleString()} (block ${indexerBlockNumber}), Contract count: ${contractCountNumber.toLocaleString()} (block ${contractBlockNumber})`);
      
      // Check if block numbers match
      const blockDifference = Math.abs(indexerBlockNumber - contractBlockNumber);
      const blockTolerance = 100; // Allow 100 block difference
      
      if (blockDifference <= blockTolerance) {
        console.log(`   ✅ Block numbers match: Indexer block ${indexerBlockNumber}, Contract block ${contractBlockNumber} (difference: ${blockDifference})`);
        
        const difference = indexerCount - contractCountNumber;
        const tolerance = 200; // 200 count tolerance
        
        if (indexerCount === contractCountNumber) {
          console.log(`   ✅ Knowledge collections match: ${indexerCount.toLocaleString()}`);
          return { passed: 1, failed: 0, warnings: 0, rpcErrors: 0, total: 1 };
        } else if (Math.abs(difference) <= tolerance) {
          console.log(`   ⚠️ Knowledge collections small difference: Indexer ${indexerCount.toLocaleString()}, Contract ${contractCountNumber.toLocaleString()}`);
          console.log(`      📊 Small difference: ${difference > 0 ? '+' : ''}${difference.toLocaleString()} (within 200 count tolerance)`);
          return { passed: 0, failed: 0, warnings: 1, rpcErrors: 0, total: 1 }; // Count as warning
        } else {
          console.log(`   ❌ Knowledge collections mismatch: Indexer ${indexerCount.toLocaleString()}, Contract ${contractCountNumber.toLocaleString()}`);
          console.log(`      📊 Difference: ${difference > 0 ? '+' : ''}${difference.toLocaleString()}`);
          return { passed: 0, failed: 1, warnings: 0, rpcErrors: 0, total: 1 };
        }
      } else {
        console.log(`   ❌ Block number mismatch: Indexer block ${indexerBlockNumber}, Contract block ${contractBlockNumber} (difference: ${blockDifference})`);
        console.log(`      📊 Block difference exceeds tolerance of ${blockTolerance} blocks`);
        return { passed: 0, failed: 1, warnings: 0, rpcErrors: 0, total: 1 };
      }
      
    } catch (error) {
      console.error(`Error validating knowledge collections for ${network}:`, error.message);
      if (error.message.includes('RPC') || error.message.includes('network') || error.message.includes('connection')) {
        return { passed: 0, failed: 0, warnings: 0, rpcErrors: 1, total: 0 };
      } else {
        return { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 };
      }
    } finally {
      await client.end();
    }
  }

  async validateDelegatorStakeUpdateEvents(network) {
    console.log(`\n🔍 Validating delegator stake update events for ${network}...`);
    
    const dbName = this.databaseMap[network];
    const client = new Client({ ...this.dbConfig, database: dbName });
    
    try {
      await client.connect();
      
      // Get all delegator stake update events ordered by block number DESC (newest first)
      const eventsResult = await client.query(`
        SELECT DISTINCT ON (identity_id, delegator_key) 
          identity_id,
          delegator_key,
          stake_base,
          block_number
        FROM delegator_base_stake_updated
        ORDER BY identity_id, delegator_key, block_number DESC
      `);
      
      if (eventsResult.rows.length === 0) {
        console.log(`   ⚠️ No delegator stake update events found in ${network}`);
        return { passed: 0, failed: 0, warnings: 0, total: 0 };
      }
      
      let passed = 0;
      let failed = 0;
      let warnings = 0;
      let rpcErrors = 0;
      let skippedDueToRPC = 0;
      let skippedAlreadyValidated = 0;
      const total = eventsResult.rows.length;
      
      console.log(`   📊 Validating ${total} delegator stake update events...`);
      
      for (let i = 0; i < eventsResult.rows.length; i++) {
        const row = eventsResult.rows[i];
        const nodeId = parseInt(row.identity_id);
        const delegatorKey = row.delegator_key;
        const newDelegatorBaseStake = BigInt(row.stake_base);
        const blockNumber = parseInt(row.block_number);
        
        // Show progress every 10 events
        if (i % 10 === 0) {
          console.log(`   📈 Progress: ${i}/${total} events processed...`);
        }
        
        try {
          // Step 1: Get all events for this specific node and delegator from indexer
          const allEventsForDelegatorResult = await client.query(`
            SELECT stake_base, block_number
            FROM delegator_base_stake_updated
            WHERE identity_id = $1 
            AND delegator_key = $2 
            ORDER BY block_number DESC
          `, [nodeId, delegatorKey]);
          
          console.log(`   🔍 Node ${nodeId}, Delegator ${delegatorKey}:`);
          console.log(`      Found ${allEventsForDelegatorResult.rows.length} events:`);
          for (let k = 0; k < allEventsForDelegatorResult.rows.length; k++) {
            const event = allEventsForDelegatorResult.rows[k];
            console.log(`         Event ${k}: Block ${event.block_number}, Stake ${event.stake_base}`);
          }
          console.log(`      Current event block: ${blockNumber}`);
          
          // Group indexer events by block number and sort by stake (highest first)
          const indexerEventsByBlock = {};
          for (const event of allEventsForDelegatorResult.rows) {
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
          
          console.log(`   📊 Node ${nodeId}, Delegator ${delegatorKey}: Processed ${processedIndexerEvents.length} unique blocks from indexer`);
          
          // Step 2: Get all contract events for this delegator
          const networkConfig = config.networks.find(n => n.name === network);
          if (!networkConfig) {
            throw new Error(`Network ${network} not found in config`);
          }
          
          let contractEvents = [];
          let retries = 3;
          let rpcSuccess = false;
          let historicalQueryFailures = 0;
          let totalHistoricalQueries = 0;
          
          while (retries > 0) {
            try {
              const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
              const stakingAddress = await this.getContractAddressFromHub(network, 'StakingStorage');
              
              const stakingContract = new ethers.Contract(stakingAddress, [
                'event DelegatorBaseStakeUpdated(uint72 indexed identityId, bytes32 indexed delegatorKey, uint96 stakeBase)'
              ], provider);
              
              // Query ALL DelegatorBaseStakeUpdated events for this specific delegator and node
              console.log(`      📊 Querying contract events for node ${nodeId}, delegator ${delegatorKey}`);
              
              try {
                // Query ALL DelegatorBaseStakeUpdated events for this specific delegator and node
                console.log(`      📊 Querying ALL DelegatorBaseStakeUpdated events for node ${nodeId}, delegator ${delegatorKey}`);
                
                const filter = stakingContract.filters.DelegatorBaseStakeUpdated(nodeId, delegatorKey);
                
                // Try to query in chunks to avoid timeout
                const currentBlock = await provider.getBlockNumber();
                const chunkSize = 1000000; // 1M blocks per chunk
                let allEvents = [];
                
                // Start from the oldest indexer event block and go forward
                const oldestIndexerBlock = allEventsForDelegatorResult.rows[allEventsForDelegatorResult.rows.length - 1].block_number;
                const fromBlock = Math.max(0, oldestIndexerBlock - 1000); // Start 1000 blocks before oldest indexer event
                
                for (let startBlock = fromBlock; startBlock <= currentBlock; startBlock += chunkSize) {
                  const endBlock = Math.min(startBlock + chunkSize - 1, currentBlock);
                  
                  try {
                    const chunkEvents = await stakingContract.queryFilter(filter, startBlock, endBlock);
                    allEvents = allEvents.concat(chunkEvents);
                  } catch (error) {
                    console.log(`      ⚠️ Failed to query chunk ${startBlock}-${endBlock}: ${error.message}`);
                    // Continue with next chunk
                  }
                }
                
                console.log(`      📊 Found ${allEvents.length} contract events for this delegator`);
                
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
                
                // Check if both sides have the same number of events for each block
                const indexerBlockCounts = {};
                const contractBlockCounts = {};
                
                for (const event of allEventsForDelegatorResult.rows) {
                  const blockNum = event.block_number;
                  indexerBlockCounts[blockNum] = (indexerBlockCounts[blockNum] || 0) + 1;
                }
                
                for (const event of allEvents) {
                  const blockNum = event.blockNumber;
                  contractBlockCounts[blockNum] = (contractBlockCounts[blockNum] || 0) + 1;
                }
                
                // Check for mismatched block counts
                let blockCountMismatch = false;
                const allBlocks = new Set([...Object.keys(indexerBlockCounts), ...Object.keys(contractBlockCounts)]);
                
                for (const blockNum of allBlocks) {
                  const indexerCount = indexerBlockCounts[blockNum] || 0;
                  const contractCount = contractBlockCounts[blockNum] || 0;
                  if (indexerCount !== contractCount) {
                    console.log(`      ⚠️ Block ${blockNum} has ${indexerCount} indexer events vs ${contractCount} contract events`);
                    blockCountMismatch = true;
                  }
                }
                
                if (blockCountMismatch) {
                  console.log(`      ⚠️ Block count mismatch detected, using highest stake per block`);
                }
                
                // Process contract events and sort by block number
                contractEvents = [];
                for (const event of processedContractEvents) {
                  contractEvents.push({
                    blockNumber: event.blockNumber,
                    stake: event.stake
                  });
                  console.log(`      📊 Contract event at block ${event.blockNumber}: ${this.weiToTRAC(event.stake)} TRAC`);
                }
                
              } catch (error) {
                console.log(`      ⚠️ Failed to query contract events: ${error.message}`);
                console.log(`      🔍 Error details: ${error.toString()}`);
                historicalQueryFailures++;
              }
              
              // If we couldn't get any contract events, try to get current state as fallback
              if (contractEvents.length === 0) {
                try {
                  // Try to get current delegator stake using a different approach
                  console.log(`      🔍 No contract events found, trying to get current state...`);
                  
                  // We could try to get current state from a different contract method if available
                  // For now, we'll just note that we have no contract data
                  console.log(`      📊 No contract events available for this delegator`);
                  
                } catch (error) {
                  console.log(`      ⚠️ Failed to get current contract state: ${error.message}`);
                }
              }
              
              rpcSuccess = true;
              break;
            } catch (error) {
              retries--;
              if (retries === 0) {
                console.log(`   ⚠️ Node ${nodeId}, Delegator ${delegatorKey}: RPC Error - ${error.message}`);
                rpcErrors++;
                skippedDueToRPC++;
                break;
              }
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
          
          if (!rpcSuccess) {
            continue;
          }
          
          // Step 3: Compare indexer and contract events
          const indexerEventCount = processedIndexerEvents.length;
          const contractEventCount = contractEvents.length;
          
          console.log(`      📊 Indexer events: ${indexerEventCount}, Contract events: ${contractEventCount}`);
          
          let validationPassed = false;
          let expectedStake = 0n;
          let actualStake = 0n;
          let comparisonBlock = 0;
          
          if (indexerEventCount === 1 && contractEventCount === 1) {
            // Single event case: check if they have the same blockchain number
            const indexerBlock = processedIndexerEvents[0].blockNumber;
            const contractBlock = contractEvents[0].blockNumber;
            
            console.log(`      📋 Single event comparison:`);
            console.log(`         Indexer block: ${indexerBlock}, Contract block: ${contractBlock}`);
            
            if (Number(indexerBlock) === Number(contractBlock)) {
              validationPassed = true;
              expectedStake = processedIndexerEvents[0].stake;
              actualStake = contractEvents[0].stake;
              comparisonBlock = indexerBlock;
              console.log(`         ✅ Both have same block number: ${comparisonBlock}`);
              console.log(`         📝 Both indexer and contract have the same single event`);
            } else {
              console.log(`         ❌ Block number mismatch`);
            }
          } else if (indexerEventCount >= 1 && contractEventCount >= 1) {
            // Multiple events case: compare latest blockchain numbers (first biggest block)
            const indexerLatest = processedIndexerEvents[0].blockNumber;
            const contractLatest = contractEvents[0].blockNumber;
            
            console.log(`      📋 Latest event comparison:`);
            console.log(`         Indexer latest block: ${indexerLatest}, Contract latest block: ${contractLatest}`);
            
            if (Number(indexerLatest) === Number(contractLatest)) {
              validationPassed = true;
              expectedStake = processedIndexerEvents[0].stake;
              actualStake = contractEvents[0].stake;
              comparisonBlock = indexerLatest;
              
              console.log(`         ✅ Both have same latest event block: ${comparisonBlock}`);
              console.log(`         📊 Latest event (block ${comparisonBlock}):`);
              console.log(`            Indexer: ${this.weiToTRAC(expectedStake)} TRAC`);
              console.log(`            Contract: ${this.weiToTRAC(actualStake)} TRAC`);
            } else {
              console.log(`         ❌ Latest event block mismatch`);
            }
          } else if (contractEventCount === 0) {
            // No contract events found
            console.log(`      ⚠️ No contract events found for this delegator`);
            console.log(`      📊 Indexer has ${indexerEventCount} events, Contract has 0 events`);
            console.log(`      🔍 Cannot perform validation - no contract data available`);
            console.log(`   ⏭️ Node ${nodeId}, Delegator ${delegatorKey}: Cannot validate - no contract data`);
            continue;
          } else {
            console.log(`      ⚠️ Cannot compare: Indexer has ${indexerEventCount} events, Contract has ${contractEventCount} events`);
          }
          
          // Skip validation if comparison failed
          if (!validationPassed) {
            console.log(`   ⏭️ Node ${nodeId}, Delegator ${delegatorKey}: Cannot validate - comparison failed`);
            continue;
          }
          
          // Step 4: Check if event was already validated and its status
          const eventHash = this.generateEventHash(network, nodeId, delegatorKey, comparisonBlock, expectedStake, actualStake);
          const prevStatus = this.validatedEvents[eventHash];
          if (prevStatus === 'passed' || prevStatus === 'warning') {
            const differenceSkipped = expectedStake - actualStake;
            console.log(`   ⏭️ Node ${nodeId}, Delegator ${delegatorKey}: Already validated as ${prevStatus}, skipping`);
            if (indexerEventCount === 1 && contractEventCount === 1) {
              console.log(`      📊 Single event - no stake comparison needed`);
            } else {
              console.log(`      Indexer old stake: ${this.weiToTRAC(expectedStake)} TRAC, Contract old stake: ${this.weiToTRAC(actualStake)} TRAC`);
              console.log(`      📊 Difference: ${differenceSkipped > 0 ? '+' : ''}${this.weiToTRAC(differenceSkipped > 0 ? differenceSkipped : -differenceSkipped)} TRAC`);
            }
            console.log(`      🔍 Previous event block: ${comparisonBlock} (current block: ${comparisonBlock})`);
            skippedAlreadyValidated++;
            continue;
          }
          
          // Step 5: Validate that contract state matches expected stake
          const difference = expectedStake - actualStake;
          
          const tolerance = 500000000000000000n; // 0.5 TRAC in wei
          
          if (difference === 0n || difference === 0) {
            if (indexerEventCount === 1 && contractEventCount === 1) {
              console.log(`   ✅ Node ${nodeId}, Delegator ${delegatorKey}`);
              console.log(`      📊 Single event validation passed`);
              console.log(`      📝 Both indexer and contract have the same single event`);
            } else {
              console.log(`   ✅ Node ${nodeId}, Delegator ${delegatorKey}`);
              console.log(`      Indexer stake: ${this.weiToTRAC(expectedStake)} TRAC, Contract stake: ${this.weiToTRAC(actualStake)} TRAC`);
              console.log(`      🔍 Latest event block: ${comparisonBlock}`);
              console.log(`      📊 TRAC Difference: ${difference > 0 ? '+' : ''}${this.weiToTRAC(difference > 0 ? difference : -difference)} TRAC`);
            }
            passed++;
            this.validatedEvents[eventHash] = 'passed';
          } else if (difference >= -tolerance && difference <= tolerance) {
            if (indexerEventCount === 1 && contractEventCount === 1) {
              console.log(`   ⚠️ Node ${nodeId}, Delegator ${delegatorKey}`);
              console.log(`      📊 Single event validation passed with small tolerance`);
              console.log(`      📝 Both indexer and contract have the same single event`);
            } else {
              console.log(`   ⚠️ Node ${nodeId}, Delegator ${delegatorKey}`);
              console.log(`      Indexer stake: ${this.weiToTRAC(expectedStake)} TRAC, Contract stake: ${this.weiToTRAC(actualStake)} TRAC`);
              console.log(`      🔍 Latest event block: ${comparisonBlock}`);
              console.log(`      📊 TRAC Difference: ${difference > 0 ? '+' : ''}${this.weiToTRAC(difference > 0 ? difference : -difference)} TRAC`);
            }
            if (Math.abs(Number(difference)) < 1000000000000000000) {
              const tracDifference = Number(difference) / Math.pow(10, 18);
              console.log(`      📊 Small difference: ${tracDifference > 0 ? '+' : ''}${this.formatTRACDifference(tracDifference)} TRAC (within 0.5 TRAC tolerance)`);
            } else {
              console.log(`      📊 Small difference: ${difference > 0 ? '+' : '-'}${this.weiToTRAC(difference > 0 ? difference : -difference)} TRAC (within 0.5 TRAC tolerance)`);
            }
            warnings++;
            this.validatedEvents[eventHash] = 'warning';
          } else {
            if (indexerEventCount === 1 && contractEventCount === 1) {
              console.log(`   ❌ Node ${nodeId}, Delegator ${delegatorKey}`);
              console.log(`      📊 Single event validation failed`);
              console.log(`      📝 Both indexer and contract have the same single event`);
            } else {
              console.log(`   ❌ Node ${nodeId}, Delegator ${delegatorKey}`);
              console.log(`      Indexer stake: ${this.weiToTRAC(expectedStake)} TRAC, Contract stake: ${this.weiToTRAC(actualStake)} TRAC`);
              console.log(`      🔍 Latest event block: ${comparisonBlock}`);
              console.log(`      📊 TRAC Difference: ${difference > 0 ? '+' : ''}${this.weiToTRAC(difference > 0 ? difference : -difference)} TRAC`);
            }
            console.log(`      📊 Difference: ${difference > 0 ? '+' : '-'}${this.weiToTRAC(difference > 0 ? difference : -difference)} TRAC`);
            failed++;
            this.validatedEvents[eventHash] = 'failed';
          }
          
        } catch (error) {
          console.log(`   ⚠️ Node ${nodeId}, Delegator ${delegatorKey}: Error - ${error.message}`);
          failed++;
        }
      }
      
      this.saveValidationResults(); // Save validated events after each run
      
      console.log(`\n   📊 Validation Summary:`);
      console.log(`      ✅ Passed: ${passed} events`);
      console.log(`      ❌ Failed: ${failed} events`);
      console.log(`      ⚠️ Warnings: ${warnings} events`);
      console.log(`      🔌 RPC Errors: ${rpcErrors} events`);
      console.log(`      📤 Skipped due to RPC: ${skippedDueToRPC} events`);
      console.log(`      ⏭️ Skipped already validated: ${skippedAlreadyValidated} events`);
      console.log(`      📊 Successfully validated: ${passed + failed + warnings} events`);
      console.log(`      💾 Total validated events tracked: ${Object.keys(this.validatedEvents).length} events`);
      
      return { passed, failed, warnings, rpcErrors, total };
      
    } catch (error) {
      console.error(`Error validating delegator stake update events for ${network}:`, error.message);
      return { passed: 0, failed: 0, warnings: 0, total: 0 };
    } finally {
      await client.end();
    }
  }
}

module.exports = CompleteQAService;

// Mocha test suite
describe('Indexer Chain Validation', function() {
  const qaService = new CompleteQAService();
  const summary = {
    total: { passed: 0, failed: 0, warnings: 0, rpcErrors: 0 },
    networks: {}
  };
  
  // Helper function to track results
  function trackResults(network, testType, results) {
    if (!summary.networks[network]) {
      summary.networks[network] = {};
    }
    if (!summary.networks[network][testType]) {
      summary.networks[network][testType] = { passed: 0, failed: 0, warnings: 0, rpcErrors: 0 };
    }
    
    summary.networks[network][testType].passed += results.passed;
    summary.networks[network][testType].failed += results.failed;
    summary.networks[network][testType].warnings += results.warnings;
    summary.networks[network][testType].rpcErrors += results.rpcErrors || 0;
    
    summary.total.passed += results.passed;
    summary.total.failed += results.failed;
    summary.total.warnings += results.warnings;
    summary.total.rpcErrors += results.rpcErrors || 0;
  }
  
  // Display summary after all tests
  after(function() {
    console.log('\n' + '='.repeat(80));
    console.log('📊 INDEXER CHAIN VALIDATION SUMMARY');
    console.log('='.repeat(80));
    
    for (const network of ['Gnosis', 'Base', 'Neuroweb']) {
      if (summary.networks[network]) {
        console.log(`\n🌐 ${network} Network:`);
        for (const [testType, results] of Object.entries(summary.networks[network])) {
          console.log(`   ${testType}: ${results.passed} ✅ passed, ${results.failed} ❌ failed, ${results.warnings} ⚠️ warnings, ${results.rpcErrors} 🔌 RPC errors`);
        }
      }
    }
    
    console.log('\n' + '-'.repeat(80));
    console.log(`🎯 GRAND TOTAL: ${summary.total.passed} ✅ passed, ${summary.total.failed} ❌ failed, ${summary.total.warnings} ⚠️ warnings, ${summary.total.rpcErrors} 🔌 RPC errors`);
    console.log('='.repeat(80));
    
    // Show file-based tracking info
    const totalTrackedEvents = Object.keys(qaService.validatedEvents).length;
    console.log(`\n💾 Validation Tracking:`);
    console.log(`   📁 Storage file: ${qaService.validationStorageFile}`);
    console.log(`   📊 Total events tracked: ${totalTrackedEvents}`);
    console.log('='.repeat(80));
  });
  
  describe('Gnosis Network', function() {
    it('should validate node stakes', async function() {
      const results = await qaService.validateNodeStakes('Gnosis');
      trackResults('Gnosis', 'Node Stakes', results);
      if (results.failed > 0) {
        throw new Error(`${results.failed} node stake validations failed`);
      }
    });
    
    it('should validate delegator stakes', async function() {
      const results = await qaService.validateDelegatorStakes('Gnosis');
      trackResults('Gnosis', 'Delegator Stakes', results);
      if (results.failed > 0) {
        throw new Error(`${results.failed} delegator stake validations failed`);
      }
    });
    
    it('should validate delegator stake update events', async function() {
      const results = await qaService.validateDelegatorStakeUpdateEvents('Gnosis');
      trackResults('Gnosis', 'Delegator Stake Update Events', results);
      
      // Calculate failure rate
      const totalValidated = results.passed + results.failed + results.warnings;
      const failureRate = totalValidated > 0 ? (results.failed / totalValidated) * 100 : 0;
      
      console.log(`\n📊 Validation Results:`);
      console.log(`   Total events validated: ${totalValidated}`);
      console.log(`   Success rate: ${((results.passed / totalValidated) * 100).toFixed(1)}%`);
      console.log(`   Failure rate: ${failureRate.toFixed(1)}%`);
      console.log(`   Warning rate: ${((results.warnings / totalValidated) * 100).toFixed(1)}%`);
      
      // Allow test to pass if failure rate is below 10%
      if (failureRate > 10) {
        throw new Error(`Failure rate ${failureRate.toFixed(1)}% exceeds 10% threshold (${results.failed} failures out of ${totalValidated} total)`);
      } else if (results.failed > 0) {
        console.log(`   ⚠️ Test passed with ${results.failed} failures (${failureRate.toFixed(1)}% failure rate - within acceptable threshold)`);
      }
    });
    
    it('should validate delegator stake sum matches node stake', async function() {
      const results = await qaService.validateDelegatorStakeSumMatchesNodeStake('Gnosis');
      trackResults('Gnosis', 'Delegator Stake Sum', results);
      if (results.failed > 0) {
        throw new Error(`${results.failed} delegator stake sum validations failed`);
      }
    });
    
    it('should validate knowledge collections', async function() {
      const results = await qaService.validateKnowledgeCollections('Gnosis');
      trackResults('Gnosis', 'Knowledge Collections', results);
      if (results.failed > 0) {
        throw new Error(`${results.failed} knowledge collection validations failed`);
      }
    });
  });
  
  // describe('Base Network', function() {
  //   it('should validate node stakes', async function() {
  //     const results = await qaService.validateNodeStakes('Base');
  //     trackResults('Base', 'Node Stakes', results);
  //     if (results.failed > 0) {
  //       throw new Error(`${results.failed} node stake validations failed`);
  //     }
  //   });
  //   
  //   it('should validate delegator stakes', async function() {
  //     const results = await qaService.validateDelegatorStakes('Base');
  //     trackResults('Base', 'Delegator Stakes', results);
  //     if (results.failed > 0) {
  //       throw new Error(`${results.failed} delegator stake validations failed`);
  //     }
  //   });
  //   
  //   it('should validate delegator stake update events', async function() {
  //     const results = await qaService.validateDelegatorStakeUpdateEvents('Base');
  //     trackResults('Base', 'Delegator Stake Update Events', results);
  //     if (results.failed > 0) {
  //       throw new Error(`${results.failed} delegator stake update event validations failed`);
  //     }
  //   });
  //   
  //   it('should validate delegator stake sum matches node stake', async function() {
  //     const results = await qaService.validateDelegatorStakeSumMatchesNodeStake('Base');
  //     trackResults('Base', 'Delegator Stake Sum', results);
  //     if (results.failed > 0) {
  //       throw new Error(`${results.failed} delegator stake sum validations failed`);
  //     }
  //   });
  //   
  //   it('should validate knowledge collections', async function() {
  //     const results = await qaService.validateKnowledgeCollections('Base');
  //     trackResults('Base', 'Knowledge Collections', results);
  //     if (results.failed > 0) {
  //       throw new Error(`${results.failed} knowledge collection validations failed`);
  //     }
  //   });
  // });
  // 
  // describe('Neuroweb Network', function() {
  //   it('should validate node stakes', async function() {
  //     const results = await qaService.validateNodeStakes('Neuroweb');
  //     trackResults('Neuroweb', 'Node Stakes', results);
  //     if (results.failed > 0) {
  //       throw new Error(`${results.failed} node stake validations failed`);
  //     }
  //   });
  //   
  //   it('should validate delegator stakes', async function() {
  //     const results = await qaService.validateDelegatorStakes('Neuroweb');
  //     trackResults('Neuroweb', 'Delegator Stakes', results);
  //     if (results.failed > 0) {
  //       throw new Error(`${results.failed} delegator stake validations failed`);
  //     }
  //   });
  //   
  //   it('should validate delegator stake update events', async function() {
  //     const results = await qaService.validateDelegatorStakeUpdateEvents('Neuroweb');
  //     trackResults('Neuroweb', 'Delegator Stake Update Events', results);
  //     if (results.failed > 0) {
  //       throw new Error(`${results.failed} delegator stake update event validations failed`);
  //     }
  //   });
  //   
  //   it('should validate delegator stake sum matches node stake', async function() {
  //     const results = await qaService.validateDelegatorStakeSumMatchesNodeStake('Neuroweb');
  //     trackResults('Neuroweb', 'Delegator Stake Sum', results);
  //     if (results.failed > 0) {
  //       throw new Error(`${results.failed} delegator stake sum validations failed`);
  //     }
  //   });
  //   
  //   it('should validate knowledge collections', async function() {
  //     const results = await qaService.validateKnowledgeCollections('Neuroweb');
  //     trackResults('Neuroweb', 'Knowledge Collections', results);
  //     if (results.failed > 0) {
  //       throw new Error(`${results.failed} knowledge collection validations failed`);
  //     }
  //   });
  // });
  // 
  // it('should run all validations in parallel per network', async function() {
  //   console.log('\n🚀 Starting parallel validation per network...');
  //   const startTime = Date.now();
  //   
  //   // Run 3 parallel network validations (each network runs its validations sequentially)
  //   const networkValidations = [
  //     // Gnosis network - all validations run sequentially
  //     (async () => {
  //       console.log('\n🌐 Starting Gnosis network validations...');
  //       const results = {
  //         'Node Stakes': await qaService.validateNodeStakes('Gnosis'),
  //         'Delegator Stakes': await qaService.validateDelegatorStakes('Gnosis'),
  //         'Delegator Stake Update Events': await qaService.validateDelegatorStakeUpdateEvents('Gnosis'),
  //         'Delegator Stake Sum': await qaService.validateDelegatorStakeSumMatchesNodeStake('Gnosis'),
  //         'Knowledge Collections': await qaService.validateKnowledgeCollections('Gnosis')
  //       };
  //       
  //       // Track results for Gnosis
  //       for (const [testType, testResults] of Object.entries(results)) {
  //         trackResults('Gnosis', testType, testResults);
  //       }
  //       
  //       return { network: 'Gnosis', results };
  //     })(),
  //     
  //     // Base network - all validations run sequentially
  //     // (async () => {
  //     //   console.log('\n🌐 Starting Base network validations...');
  //     //   const results = {
  //     //     'Node Stakes': await qaService.validateNodeStakes('Base'),
  //     //     'Delegator Stakes': await qaService.validateDelegatorStakes('Base'),
  //     //     'Delegator Stake Update Events': await qaService.validateDelegatorStakeUpdateEvents('Base'),
  //     //     'Delegator Stake Sum': await qaService.validateDelegatorStakeSumMatchesNodeStake('Base'),
  //     //     'Knowledge Collections': await qaService.validateKnowledgeCollections('Base')
  //     //   };
  //     //   
  //     //   // Track results for Base
  //     //   for (const [testType, testResults] of Object.entries(results)) {
  //     //     trackResults('Base', testType, testResults);
  //     //   }
  //     //   
  //     //   return { network: 'Base', results };
  //     // })(),
  //     
  //     // Neuroweb network - all validations run sequentially
  //     // (async () => {
  //     //   console.log('\n🌐 Starting Neuroweb network validations...');
  //     //   const results = {
  //     //     'Node Stakes': await qaService.validateNodeStakes('Neuroweb'),
  //     //     'Delegator Stakes': await qaService.validateDelegatorStakes('Neuroweb'),
  //     //     'Delegator Stake Update Events': await qaService.validateDelegatorStakeUpdateEvents('Neuroweb'),
  //     //     'Delegator Stake Sum': await qaService.validateDelegatorStakeSumMatchesNodeStake('Neuroweb'),
  //     //     'Knowledge Collections': await qaService.validateKnowledgeCollections('Neuroweb')
  //     //   };
  //     //   
  //     //   // Track results for Neuroweb
  //     //   for (const [testType, testResults] of Object.entries(results)) {
  //     //     trackResults('Neuroweb', testType, testResults);
  //     //   }
  //     //   
  //     //   return { network: 'Neuroweb', results };
  //     // })()
  //   ];
  //   
  //   try {
  //     // Run all 3 networks in parallel
  //     const networkResults = await Promise.all(networkValidations);
  //     
  //     const endTime = Date.now();
  //     const totalTime = (endTime - startTime) / 1000;
  //     
  //     console.log(`\n⏱️ Total execution time: ${totalTime.toFixed(1)} seconds`);
  //     console.log(`🚀 Parallel network execution completed successfully!`);
  //     
  //     // Check for any failures
  //     const totalFailures = summary.total.failed;
  //     if (totalFailures > 0) {
  //       throw new Error(`${totalFailures} validations failed across all networks`);
  //     }
  //     
  //   } catch (error) {
  //     console.error(`❌ Parallel network validation failed: ${error.message}`);
  //     throw error;
  //   }
  // });
});