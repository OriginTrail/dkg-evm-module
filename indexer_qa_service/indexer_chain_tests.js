const { ethers } = require('ethers');
const { Client } = require('pg');
const config = require('./config');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

class ComprehensiveQAService {
  constructor() {
    this.dbConfig = {
      host: process.env.DB_HOST_INDEXER,
      port: 5432,
      user: process.env.DB_USER_INDEXER,
      password: process.env.DB_PASSWORD_INDEXER,
      database: 'postgres',
      // Add connection timeout and keep-alive settings
      connectionTimeoutMillis: 60000, // 60 seconds
      idleTimeoutMillis: 30000, // 30 seconds
      max: 20, // Maximum number of clients in the pool
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000 // 10 seconds
    };
    this.databaseMap = {
      'Gnosis': 'gnosis-mainnet-db',
      'Base': 'base-mainnet-db',
      'Neuroweb': 'nw-mainnet-db'
    };
    
    // Cache storage
    this.gnosisCache = null;
    this.baseCache = null;
    this.neurowebCache = null;
  }

  weiToTRAC(weiAmount) {
    const wei = BigInt(weiAmount);
    const trac = Number(wei) / Math.pow(10, 18);
    
    if (trac === 0) {
      return '0';
    }
    
    // For amounts >= 1, round to 2 decimal places
    if (trac >= 1) {
      return trac.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    }
    
    // For amounts < 1, round to the last non-zero decimal
    const tracString = trac.toString();
    
    // If it's in scientific notation (e.g., 4.87584576e-9), convert it
    if (tracString.includes('e-')) {
      const [base, exponent] = tracString.split('e-');
      const decimalPlaces = parseInt(exponent);
      return trac.toFixed(decimalPlaces);
    }
    
    // For regular decimal notation, find the rightmost non-zero digit
    if (tracString.includes('.')) {
      const [wholePart, decimalPart] = tracString.split('.');
      
      // Find the rightmost non-zero digit in the decimal part
      let rightmostNonZeroIndex = -1;
      for (let i = decimalPart.length - 1; i >= 0; i--) {
        if (decimalPart[i] !== '0') {
          rightmostNonZeroIndex = i;
          break;
        }
      }
      
      if (rightmostNonZeroIndex !== -1) {
        // Round to the rightmost non-zero decimal position
        return trac.toFixed(rightmostNonZeroIndex + 1);
      }
    }
    
    // Fallback
    return trac.toString();
  }

  async getContractAddressFromHub(network, contractName) {
    try {
      const networkConfig = config.networks.find(n => n.name === network);
      if (!networkConfig) throw new Error(`Network ${network} not found in config`);

      let provider;
      let retryCount = 0;
      while (true) {
        try {
          provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
          await provider.getNetwork();
          break;
        } catch (error) {
          retryCount++;
          console.log(` ⚠️ RPC connection failed (attempt ${retryCount}): ${error.message}`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }

      const hubContract = new ethers.Contract(networkConfig.hubAddress, [
        'function getContractAddress(string memory contractName) view returns (address)'
      ], provider);

      return await hubContract.getContractAddress(contractName);
    } catch (error) {
      const networkConfig = config.networks.find(n => n.name === network);
      if (contractName === 'StakingStorage') return networkConfig.stakingStorageAddress;
      if (contractName === 'KnowledgeCollectionStorage') return networkConfig.knowledgeCollectionStorageAddress;
      throw new Error(`No fallback address for ${contractName}`);
    }
  }

  // Load cache from JSON files
  async loadCache(network) {
    // All networks now use JSON file caching
    const cacheFile = path.join(__dirname, `${network.toLowerCase()}_cache.json`);
    
    try {
      if (fs.existsSync(cacheFile)) {
        const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        console.log(`   📊 Loaded ${network} cache from file`);
        console.log(`      Node events: ${cacheData.totalNodeEvents || cacheData.nodeEvents?.length || 0}`);
        console.log(`      Delegator events: ${cacheData.totalDelegatorEvents || cacheData.delegatorEvents?.length || 0}`);
        
        // Debug: Show cache structure if it has processed data
        if (cacheData.delegatorEventsByNode) {
          const totalNodes = Object.keys(cacheData.delegatorEventsByNode).length;
          const totalDelegators = Object.values(cacheData.delegatorEventsByNode).reduce((sum, node) => sum + Object.keys(node).length, 0);
          console.log(`      Processed structure: ${totalNodes} nodes, ${totalDelegators} delegators`);
          
          // Show some sample delegators from cache
          const sampleDelegators = [];
          for (const [nodeId, delegators] of Object.entries(cacheData.delegatorEventsByNode)) {
            for (const [delegatorKey, events] of Object.entries(delegators)) {
              sampleDelegators.push({ nodeId, delegatorKey, eventCount: events.length });
              if (sampleDelegators.length >= 3) break;
            }
            if (sampleDelegators.length >= 3) break;
          }
          
          if (sampleDelegators.length > 0) {
            console.log(`      Sample delegators in cache:`);
            sampleDelegators.forEach(({ nodeId, delegatorKey, eventCount }) => {
              console.log(`         Node ${nodeId}: ${delegatorKey} (${eventCount} events)`);
            });
          }
        }
        
        // If cache doesn't have processed structure, process it
        if (!cacheData.nodeEventsByNode) {
          console.log(`   📊 Processing existing cache data...`);
          return await this.buildCache(network);
        }
        
        return cacheData;
      }
    } catch (error) {
      console.log(`   ⚠️ Error loading ${network} cache: ${error.message}`);
    }
    
    return null;
  }

  // Save cache to JSON files (for all networks)
  async saveCache(network, cacheData) {
    const cacheFile = path.join(__dirname, `${network.toLowerCase()}_cache.json`);
    
    try {
      fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2));
      console.log(`   📊 Saved ${network} cache to file`);
    } catch (error) {
      console.log(`   ⚠️ Error saving ${network} cache: ${error.message}`);
    }
  }

  // Query all contract events for Base/Gnosis (chunked approach)
  async queryAllContractEvents(network) {
    console.log(`\n[${network}] 📊 Querying all contract events for ${network}...`);
    
    const networkConfig = config.networks.find(n => n.name === network);
    if (!networkConfig) {
      throw new Error(`Network ${network} not found in config`);
    }
    
    // Add retry logic for RPC connection
    let provider;
    let retryCount = 0;
    while (true) {
      try {
        provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
        await provider.getNetwork(); // Test the connection
        if (retryCount > 0) {
          console.log(`[${network}] ✅ RPC connection succeeded after ${retryCount} retries`);
        }
        break;
      } catch (error) {
        retryCount++;
        console.log(`[${network}] ⚠️ RPC connection failed (attempt ${retryCount}): ${error.message}`);
        console.log(`[${network}] ⏳ Retrying in 3 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    const stakingAddress = await this.getContractAddressFromHub(network, 'StakingStorage');
    console.log(`[${network}] 📊 Staking contract address: ${stakingAddress}`);
    
    const stakingContract = new ethers.Contract(stakingAddress, [
      'event NodeStakeUpdated(uint72 indexed identityId, uint96 stake)',
      'event DelegatorBaseStakeUpdated(uint72 indexed identityId, bytes32 indexed delegatorKey, uint96 stakeBase)'
    ], provider);
    
    // Test the contract address and RPC functionality
    try {
      const testFilter = stakingContract.filters.NodeStakeUpdated();
      const testEvents = await stakingContract.queryFilter(testFilter, 0, 100); // Test first 100 blocks
      console.log(`[${network}] 📊 Test query found ${testEvents.length} events in blocks 0-100`);
      
      if (testEvents.length > 0) {
        console.log(`[${network}] 📊 Sample test event: Node ${testEvents[0].args.identityId}, Block ${testEvents[0].blockNumber}`);
      }
    } catch (error) {
      console.log(`[${network}] ⚠️ Test query failed: ${error.message}`);
    }
    
    // Get current block number
    const currentBlock = await provider.getBlockNumber();
    console.log(`[${network}] 📊 Current block: ${currentBlock.toLocaleString()}`);
    
    // Get oldest indexer block to determine start point
    const dbName = this.databaseMap[network];
    const client = await this.createDatabaseConnection(network);
    
    try {
      const oldestNodeResult = await this.executeQuery(client, `
        SELECT MIN(block_number) as oldest_block FROM node_stake_updated
      `);
      const oldestDelegatorResult = await this.executeQuery(client, `
        SELECT MIN(block_number) as oldest_block FROM delegator_base_stake_updated
      `);
      
      const oldestNodeBlock = oldestNodeResult.rows[0]?.oldest_block || currentBlock;
      const oldestDelegatorBlock = oldestDelegatorResult.rows[0]?.oldest_block || currentBlock;
      const oldestBlock = Math.min(oldestNodeBlock, oldestDelegatorBlock);
      
      console.log(`[${network}] 📊 Oldest node block: ${oldestNodeBlock?.toLocaleString() || 'N/A'}`);
      console.log(`[${network}] 📊 Oldest delegator block: ${oldestDelegatorBlock?.toLocaleString() || 'N/A'}`);
      console.log(`[${network}] 📊 Using oldest block: ${oldestBlock.toLocaleString()}`);
      
      // Query from the oldest indexer block (with some buffer)
      const fromBlock = Math.max(0, oldestBlock - 1000);
      console.log(`[${network}] 📊 Querying from block ${fromBlock.toLocaleString()} to ${currentBlock.toLocaleString()}`);
      console.log(`[${network}] 📊 Total blocks to query: ${(currentBlock - fromBlock + 1).toLocaleString()}`);
      
      // Determine chunk size based on network
      const chunkSize = network === 'Base' ? 100000 : 1000000;
      console.log(`[${network}] 📊 Using chunk size: ${chunkSize.toLocaleString()} blocks`);
      
      const nodeEvents = [];
      const delegatorEvents = [];
      
      // Process chunks
      let totalChunks = Math.ceil((currentBlock - fromBlock) / chunkSize);
      let processedChunks = 0;
      let totalNodeEventsFound = 0;
      let totalDelegatorEventsFound = 0;
      
      for (let startBlock = fromBlock; startBlock < currentBlock; startBlock += chunkSize) {
        const endBlock = Math.min(startBlock + chunkSize - 1, currentBlock);
        processedChunks++;
        
        console.log(`[${network}] 📊 Processing chunk ${processedChunks}/${totalChunks} (blocks ${startBlock.toLocaleString()}-${endBlock.toLocaleString()})`);
        
        // Query NodeStakeUpdated events with retry logic
        let nodeFilter;
        let delegatorFilter;
        let nodeEventsChunk = [];
        let delegatorEventsChunk = [];
        
        // Retry logic for chunk queries
        let chunkRetryCount = 0;
        const maxChunkRetries = network === 'Neuroweb' ? Infinity : 1000; // Base/Gnosis: 1000 retries, Neuroweb: Infinite retries
        
        while (chunkRetryCount < maxChunkRetries) {
          try {
            nodeFilter = stakingContract.filters.NodeStakeUpdated();
            delegatorFilter = stakingContract.filters.DelegatorBaseStakeUpdated();
            
            const [nodeEventsResult, delegatorEventsResult] = await Promise.all([
              stakingContract.queryFilter(nodeFilter, startBlock, endBlock),
              stakingContract.queryFilter(delegatorFilter, startBlock, endBlock)
            ]);
            
            nodeEventsChunk = nodeEventsResult;
            delegatorEventsChunk = delegatorEventsResult;
            totalNodeEventsFound += nodeEventsChunk.length;
            totalDelegatorEventsFound += delegatorEventsChunk.length;
            
            console.log(`[${network}] 📊 Chunk ${processedChunks}: Found ${nodeEventsChunk.length} node events, ${delegatorEventsChunk.length} delegator events`);
            console.log(`[${network}] 📊 Running totals: ${totalNodeEventsFound} node events, ${totalDelegatorEventsFound} delegator events`);
            
            // Debug: Show some delegator keys found in this chunk
            if (delegatorEventsChunk.length > 0) {
                const sampleKeys = delegatorEventsChunk.map(e => e.args.delegatorKey); // Log all keys
                console.log(`[${network}] 📊 Sample delegator keys in chunk: ${sampleKeys.join(', ')}`);
            }
            
            // Debug: Show some sample events if found
            if (nodeEventsChunk.length > 0) {
              const sampleEvents = nodeEventsChunk.slice(0, 3);
              console.log(`[${network}] 📊 Sample node events in chunk:`);
              sampleEvents.forEach((event, index) => {
                console.log(`[${network}]    ${index + 1}. Node ${event.args.identityId}, Block ${event.blockNumber}, Stake: ${event.args.stake.toString()}`);
              });
            }
            
            break; // Success, exit retry loop
            
          } catch (error) {
            chunkRetryCount++;
            console.log(`[${network}] ⚠️ Chunk ${processedChunks} failed (attempt ${chunkRetryCount}/${maxChunkRetries}): ${error.message}`);
            
            if (chunkRetryCount >= maxChunkRetries) {
              console.log(`[${network}] ❌ Chunk ${processedChunks} failed after ${maxChunkRetries} attempts, skipping...`);
              break;
            }
            
            console.log(`[${network}] ⏳ Retrying chunk in 3 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        }
        
        // Add events to main arrays
        nodeEvents.push(...nodeEventsChunk);
        delegatorEvents.push(...delegatorEventsChunk);
      }
      
      console.log(`[${network}] 📊 Total events found: ${nodeEvents.length} node events, ${delegatorEvents.length} delegator events`);
      
      // Verification: Check if we found a reasonable number of events
      const totalBlocksQueried = currentBlock - fromBlock + 1;
      const nodeEventsPerBlock = nodeEvents.length / totalBlocksQueried;
      const delegatorEventsPerBlock = delegatorEvents.length / totalBlocksQueried;
      
      console.log(`[${network}] 📊 Verification:`);
      console.log(`[${network}]    Total blocks queried: ${totalBlocksQueried.toLocaleString()}`);
      console.log(`[${network}]    Node events per block: ${nodeEventsPerBlock.toFixed(4)}`);
      console.log(`[${network}]    Delegator events per block: ${delegatorEventsPerBlock.toFixed(4)}`);
      
      // Warning if events per block is suspiciously low
      if (nodeEventsPerBlock < 0.001 && delegatorEventsPerBlock < 0.001) {
        console.log(`[${network}] ⚠️ WARNING: Very low events per block detected. This might indicate:`);
        console.log(`[${network}]    - Wrong contract address`);
        console.log(`[${network}]    - RPC not returning all events`);
        console.log(`[${network}]    - Network has very few staking events`);
        console.log(`[${network}]    - Query range is incorrect`);
      }
      
      // Debug: Show some sample delegator events to verify coverage
      if (delegatorEvents.length > 0) {
        const sampleEvents = delegatorEvents.slice(0, 5);
        console.log(`[${network}] 📊 Sample delegator events found:`);
        sampleEvents.forEach((event, index) => {
          console.log(`[${network}]    ${index + 1}. Node ${event.args.identityId}, Block ${event.blockNumber}, Key: ${event.args.delegatorKey.slice(0, 20)}...`);
        });
        
        // Show block range of found events
        const delegatorBlockNumbers = delegatorEvents.map(e => e.blockNumber);
        const minBlock = Math.min(...delegatorBlockNumbers);
        const maxBlock = Math.max(...delegatorBlockNumbers);
        console.log(`[${network}] 📊 Delegator events block range: ${minBlock.toLocaleString()} to ${maxBlock.toLocaleString()}`);
      }
      
      // Convert BigInt to string for JSON serialization
      const processedNodeEvents = nodeEvents.map(event => ({
        identityId: event.args.identityId.toString(),
        stake: event.args.stake.toString(),
        blockNumber: event.blockNumber
      }));
      
      const processedDelegatorEvents = delegatorEvents.map(event => ({
        identityId: event.args.identityId.toString(),
        delegatorKey: event.args.delegatorKey,
        stakeBase: event.args.stakeBase.toString(),
        blockNumber: event.blockNumber
      }));
      
      return {
        nodeEvents: processedNodeEvents,
        delegatorEvents: processedDelegatorEvents
      };
      
    } finally {
      await client.end();
    }
  }

  // Query all contract events for Neuroweb (chunked approach)
  async queryAllNeurowebContractEvents() {
    console.log(`\n[Neuroweb] 🔍 Querying all contract events for Neuroweb...`);
    
    const networkConfig = config.networks.find(n => n.name === 'Neuroweb');
    if (!networkConfig) throw new Error(`Network Neuroweb not found in config`);

    let provider;
    let retryCount = 0;
    while (true) {
      try {
        provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
        await provider.getNetwork();
        if (retryCount > 0) {
          console.log(`[Neuroweb] ✅ RPC connection succeeded after ${retryCount} retries`);
        }
        break;
      } catch (error) {
        retryCount++;
        console.log(`[Neuroweb] ⚠️ RPC connection failed (attempt ${retryCount}): ${error.message}`);
        // Neuroweb: Infinite retries for RPC connection
        console.log(`[Neuroweb] ⏳ Retrying in 3 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    const stakingAddress = await this.getContractAddressFromHub('Neuroweb', 'StakingStorage');
    console.log(`[Neuroweb] 📊 Staking contract address: ${stakingAddress}`);
    
    const stakingContract = new ethers.Contract(stakingAddress, [
      'event NodeStakeUpdated(uint72 indexed identityId, uint96 stake)',
      'event DelegatorBaseStakeUpdated(uint72 indexed identityId, bytes32 indexed delegatorKey, uint96 stakeBase)'
    ], provider);
    
    // Test the contract address and RPC functionality
    try {
      const testFilter = stakingContract.filters.NodeStakeUpdated();
      const testEvents = await stakingContract.queryFilter(testFilter, 0, 100); // Test first 100 blocks
      console.log(`[Neuroweb] 📊 Test query found ${testEvents.length} events in blocks 0-100`);
      
      if (testEvents.length > 0) {
        console.log(`[Neuroweb] 📊 Sample test event: Node ${testEvents[0].args.identityId}, Block ${testEvents[0].blockNumber}`);
      }
    } catch (error) {
      console.log(`[Neuroweb] ⚠️ Test query failed: ${error.message}`);
    }
    
    const currentBlock = await provider.getBlockNumber();
    console.log(`[Neuroweb] 📊 Current block: ${currentBlock.toLocaleString()}`);

    // Get oldest indexer block
    const dbName = this.databaseMap['Neuroweb'];
    const client = await this.createDatabaseConnection('Neuroweb');
    
    try {
      const oldestNodeResult = await this.executeQuery(client, `
        SELECT MIN(block_number) as oldest_block FROM node_stake_updated
      `);
      const oldestDelegatorResult = await this.executeQuery(client, `
        SELECT MIN(block_number) as oldest_block FROM delegator_base_stake_updated
      `);
      
      const oldestNodeBlock = oldestNodeResult.rows[0]?.oldest_block || currentBlock;
      const oldestDelegatorBlock = oldestDelegatorResult.rows[0]?.oldest_block || currentBlock;
      const oldestBlock = Math.min(oldestNodeBlock, oldestDelegatorBlock);
      
      console.log(`[Neuroweb] 📊 Oldest node block: ${oldestNodeBlock?.toLocaleString() || 'N/A'}`);
      console.log(`[Neuroweb] 📊 Oldest delegator block: ${oldestDelegatorBlock?.toLocaleString() || 'N/A'}`);
      console.log(`[Neuroweb] 📊 Using oldest block: ${oldestBlock.toLocaleString()}`);
      
      const fromBlock = Math.max(0, oldestBlock - 1000);
      console.log(`[Neuroweb] 📊 Querying from block ${fromBlock.toLocaleString()} to ${currentBlock.toLocaleString()}`);
      console.log(`[Neuroweb] 📊 Total blocks to query: ${(currentBlock - fromBlock + 1).toLocaleString()}`);
      
      // Use 10,000 chunks for Neuroweb
      const chunkSize = 10000; // 10k chunks for Neuroweb
      console.log(`[Neuroweb] 📊 Using chunk size: ${chunkSize.toLocaleString()}`);
      
      let allNodeEvents = [];
      let allDelegatorEvents = [];
      
      // Query node events
      console.log(`[Neuroweb] 📊 Querying NodeStakeUpdated events...`);
      const nodeFilter = stakingContract.filters.NodeStakeUpdated();
      
      let totalChunks = Math.ceil((currentBlock - fromBlock + 1) / chunkSize);
      let processedChunks = 0;
      let totalNodeEventsFound = 0;
      
      for (let startBlock = fromBlock; startBlock <= currentBlock; startBlock += chunkSize) {
        const endBlock = Math.min(startBlock + chunkSize - 1, currentBlock);
        processedChunks++;
        
        console.log(`[Neuroweb] 📊 Processing chunk ${processedChunks}/${totalChunks} (blocks ${startBlock.toLocaleString()}-${endBlock.toLocaleString()})`);
        
        let chunkRetryCount = 0;
        while (true) {
          try {
            const chunkEvents = await stakingContract.queryFilter(nodeFilter, startBlock, endBlock);
            allNodeEvents = allNodeEvents.concat(chunkEvents);
            totalNodeEventsFound += chunkEvents.length;
            
            console.log(`[Neuroweb] ✅ Found ${chunkEvents.length} node events in chunk ${processedChunks} (Total: ${totalNodeEventsFound})`);
            
            // Debug: Show some sample events if found
            if (chunkEvents.length > 0) {
              const sampleEvents = chunkEvents.slice(0, 3);
              console.log(`[Neuroweb] 📊 Sample node events in chunk:`);
              sampleEvents.forEach((event, index) => {
                console.log(`[Neuroweb]    ${index + 1}. Node ${event.args.identityId}, Block ${event.blockNumber}, Stake: ${event.args.stake.toString()}`);
              });
            }
            
            if (chunkRetryCount > 0) {
              console.log(`[Neuroweb] ✅ Chunk ${startBlock}-${endBlock} succeeded after ${chunkRetryCount} retries`);
            }
            break;
          } catch (error) {
            chunkRetryCount++;
            console.log(`[Neuroweb] ⚠️ Chunk ${startBlock}-${endBlock} failed (attempt ${chunkRetryCount}): ${error.message}`);
            // Neuroweb: Infinite retries for chunk queries
            console.log(`[Neuroweb] ⏳ Retrying in 3 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        }
      }
      
      // Query delegator events
      console.log(`[Neuroweb] 📊 Querying DelegatorBaseStakeUpdated events...`);
      const delegatorFilter = stakingContract.filters.DelegatorBaseStakeUpdated();
      
      processedChunks = 0;
      let totalDelegatorEventsFound = 0;
      
      for (let startBlock = fromBlock; startBlock <= currentBlock; startBlock += chunkSize) {
        const endBlock = Math.min(startBlock + chunkSize - 1, currentBlock);
        processedChunks++;
        
        console.log(`[Neuroweb] 📊 Processing chunk ${processedChunks}/${totalChunks} (blocks ${startBlock.toLocaleString()}-${endBlock.toLocaleString()})`);
        
        let chunkRetryCount = 0;
        while (true) {
          try {
            const chunkEvents = await stakingContract.queryFilter(delegatorFilter, startBlock, endBlock);
            allDelegatorEvents = allDelegatorEvents.concat(chunkEvents);
            totalDelegatorEventsFound += chunkEvents.length;
            
            console.log(`[Neuroweb] ✅ Found ${chunkEvents.length} delegator events in chunk ${processedChunks} (Total: ${totalDelegatorEventsFound})`);
            
            // Debug: Show some sample events if found
            if (chunkEvents.length > 0) {
              const sampleEvents = chunkEvents.slice(0, 3);
              console.log(`[Neuroweb] 📊 Sample delegator events in chunk:`);
              sampleEvents.forEach((event, index) => {
                console.log(`[Neuroweb]    ${index + 1}. Node ${event.args.identityId}, Delegator ${event.args.delegatorKey}, Block ${event.blockNumber}, Stake: ${event.args.stakeBase.toString()}`);
              });
            }
            
            if (chunkRetryCount > 0) {
              console.log(`[Neuroweb] ✅ Chunk ${startBlock}-${endBlock} succeeded after ${chunkRetryCount} retries`);
            }
            break;
          } catch (error) {
            chunkRetryCount++;
            console.log(`[Neuroweb] ⚠️ Chunk ${startBlock}-${endBlock} failed (attempt ${chunkRetryCount}): ${error.message}`);
            // Neuroweb: Infinite retries for chunk queries
            console.log(`[Neuroweb] ⏳ Retrying in 3 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        }
      }
      
      console.log(`[Neuroweb] 📊 Found ${allNodeEvents.length} node events and ${allDelegatorEvents.length} delegator events`);
      
      // Verification: Check if we found a reasonable number of events
      const totalBlocksQueried = currentBlock - fromBlock + 1;
      const nodeEventsPerBlock = allNodeEvents.length / totalBlocksQueried;
      const delegatorEventsPerBlock = allDelegatorEvents.length / totalBlocksQueried;
      
      console.log(`[Neuroweb] 📊 Verification:`);
      console.log(`[Neuroweb]    Total blocks queried: ${totalBlocksQueried.toLocaleString()}`);
      console.log(`[Neuroweb]    Node events per block: ${nodeEventsPerBlock.toFixed(4)}`);
      console.log(`[Neuroweb]    Delegator events per block: ${delegatorEventsPerBlock.toFixed(4)}`);
      
      // Warning if events per block is suspiciously low
      if (nodeEventsPerBlock < 0.001 && delegatorEventsPerBlock < 0.001) {
        console.log(`[Neuroweb] ⚠️ WARNING: Very low events per block detected. This might indicate:`);
        console.log(`[Neuroweb]    - Wrong contract address`);
        console.log(`[Neuroweb]    - RPC not returning all events`);
        console.log(`[Neuroweb]    - Network has very few staking events`);
        console.log(`[Neuroweb]    - Query range is incorrect`);
      }
      
      // Process events into cache format
      const cacheData = {
        nodeEvents: allNodeEvents.map(event => ({
          blockNumber: event.blockNumber,
          identityId: event.args.identityId.toString(),
          stake: event.args.stake.toString()
        })),
        delegatorEvents: allDelegatorEvents.map(event => ({
          blockNumber: event.blockNumber,
          identityId: event.args.identityId.toString(),
          delegatorKey: event.args.delegatorKey,
          stakeBase: event.args.stakeBase.toString()
        })),
        totalNodeEvents: allNodeEvents.length,
        totalDelegatorEvents: allDelegatorEvents.length,
        lastUpdated: new Date().toISOString()
      };
      
      return cacheData;
      
    } finally {
      await client.end();
    }
  }

  // Build cache for a network
  async buildCache(network) {
    console.log(`\n[${network}] 🔍 Building cache for ${network}...`);
    
    // Always load cache from GitHub or another specified source
    const existingCache = await this.loadCache(network);
    
    let cacheData;
    if (existingCache && existingCache.nodeEventsByNode) {
      console.log(`[${network}] 📊 Using existing ${network} cache from file`);
      console.log(`[${network}]    Node events: ${existingCache.totalNodeEvents || 0}`);
      console.log(`[${network}]    Delegator events: ${existingCache.totalDelegatorEvents || 0}`);
      
      // In CI, always check for updates to get fresh data
      if (process.env.CI || process.env.JENKINS_URL) {
        console.log(`[${network}] 📊 CI environment: Checking for cache updates...`);
        const needsUpdate = await this.checkCacheNeedsUpdate(network, existingCache);
        if (needsUpdate) {
          console.log(`[${network}] 📊 ${network} cache needs update, querying new blocks...`);
          const newEvents = await this.queryNewEvents(network, existingCache);
          if (newEvents.nodeEvents.length > 0 || newEvents.delegatorEvents.length > 0) {
            console.log(`[${network}] 📊 Found ${newEvents.nodeEvents.length} new node events and ${newEvents.delegatorEvents.length} new delegator events`);
            return await this.mergeCacheWithNewEvents(network, existingCache, newEvents);
          } else {
            console.log(`[${network}] 📊 No new events found, using existing cache`);
          }
        } else {
          console.log(`[${network}] 📊 Cache is up to date`);
        }
      } else {
        // Local development: Check if we need to add new blocks
        const needsUpdate = await this.checkCacheNeedsUpdate(network, existingCache);
        if (needsUpdate) {
          console.log(`[${network}] 📊 ${network} cache needs update, querying new blocks...`);
          const newEvents = await this.queryNewEvents(network, existingCache);
          if (newEvents.nodeEvents.length > 0 || newEvents.delegatorEvents.length > 0) {
            console.log(`[${network}] 📊 Found ${newEvents.nodeEvents.length} new node events and ${newEvents.delegatorEvents.length} new delegator events`);
            return await this.mergeCacheWithNewEvents(network, existingCache, newEvents);
          } else {
            console.log(`[${network}] 📊 No new events found, using existing cache`);
          }
        }
      }
      
      return existingCache; // Return existing cache
    } else {
      // No existing cache found, build from scratch
      console.log(`[${network}] 📊 No existing cache found, building from scratch...`);
      
      if (network === 'Neuroweb') {
        cacheData = await this.queryAllNeurowebContractEvents();
      } else {
        cacheData = await this.queryAllContractEvents(network);
      }
      
      // Process the raw events into the organized structure
      const nodeEventsByNode = {};
      const delegatorEventsByNode = {};
      
      // Process node events
      for (const event of cacheData.nodeEvents) {
        const nodeId = event.identityId;
        if (!nodeEventsByNode[nodeId]) {
          nodeEventsByNode[nodeId] = [];
        }
        nodeEventsByNode[nodeId].push({
          blockNumber: event.blockNumber,
          stake: event.stake
        });
      }
      
      // Process delegator events
      for (const event of cacheData.delegatorEvents) {
        const nodeId = event.identityId;
        const delegatorKey = event.delegatorKey;
        
        if (!delegatorEventsByNode[nodeId]) {
          delegatorEventsByNode[nodeId] = {};
        }
        if (!delegatorEventsByNode[nodeId][delegatorKey]) {
          delegatorEventsByNode[nodeId][delegatorKey] = [];
        }
        
        delegatorEventsByNode[nodeId][delegatorKey].push({
          blockNumber: event.blockNumber,
          stakeBase: event.stakeBase
        });
      }
      
      // Create the final cache structure
      const finalCacheData = {
        nodeEvents: cacheData.nodeEvents,
        delegatorEvents: cacheData.delegatorEvents,
        nodeEventsByNode,
        delegatorEventsByNode,
        totalNodeEvents: cacheData.nodeEvents.length,
        totalDelegatorEvents: cacheData.delegatorEvents.length,
        lastUpdated: new Date().toISOString()
      };
      
      // Save the cache
      await this.saveCache(network, finalCacheData);
      
      return finalCacheData;
    }
  }

  // Merge new events with existing cache (for all networks)
  async mergeCacheWithNewEvents(network, existingCache, newEvents) {
    console.log(`   📊 Merging new events with existing cache for ${network}...`);
    
    // Get the latest block from existing cache (using processed structure)
    let latestExistingBlock = 0;
    
    // Check node events from processed structure
    if (existingCache.nodeEventsByNode) {
      for (const [nodeId, events] of Object.entries(existingCache.nodeEventsByNode)) {
        for (const event of events) {
          if (event.blockNumber > latestExistingBlock) {
            latestExistingBlock = event.blockNumber;
          }
        }
      }
    }
    
    // Check delegator events from processed structure
    if (existingCache.delegatorEventsByNode) {
      for (const [nodeId, delegators] of Object.entries(existingCache.delegatorEventsByNode)) {
        for (const [delegatorKey, events] of Object.entries(delegators)) {
          for (const event of events) {
            if (event.blockNumber > latestExistingBlock) {
              latestExistingBlock = event.blockNumber;
            }
          }
        }
      }
    }
    
    console.log(`   📊 Latest existing block: ${latestExistingBlock.toLocaleString()}`);
    
    // Filter new events to only include blocks newer than existing cache
    const newNodeEvents = newEvents.nodeEvents.filter(event => event.blockNumber > latestExistingBlock);
    const newDelegatorEvents = newEvents.delegatorEvents.filter(event => event.blockNumber > latestExistingBlock);
    
    console.log(`   📊 New node events: ${newNodeEvents.length} (after ${latestExistingBlock.toLocaleString()})`);
    console.log(`   📊 New delegator events: ${newDelegatorEvents.length} (after ${latestExistingBlock.toLocaleString()})`);
    
    // If no new events, return existing cache unchanged
    if (newNodeEvents.length === 0 && newDelegatorEvents.length === 0) {
      console.log(`   📊 No new events to merge, keeping existing cache unchanged`);
      return existingCache;
    }
    
    // Convert existing processed structure back to flat arrays for merging
    const existingNodeEvents = [];
    const existingDelegatorEvents = [];
    
    // Convert node events
    for (const [nodeId, events] of Object.entries(existingCache.nodeEventsByNode || {})) {
      for (const event of events) {
        existingNodeEvents.push({
          identityId: nodeId,
          blockNumber: event.blockNumber,
          stake: event.stake
        });
      }
    }
    
    // Convert delegator events
    for (const [nodeId, delegators] of Object.entries(existingCache.delegatorEventsByNode || {})) {
      for (const [delegatorKey, events] of Object.entries(delegators)) {
        for (const event of events) {
          existingDelegatorEvents.push({
            identityId: nodeId,
            delegatorKey: delegatorKey,
            blockNumber: event.blockNumber,
            stakeBase: event.stakeBase
          });
        }
      }
    }
    
    // Merge events
    const mergedNodeEvents = [...existingNodeEvents, ...newNodeEvents];
    const mergedDelegatorEvents = [...existingDelegatorEvents, ...newDelegatorEvents];
    
    // Process merged events into organized structure
    const nodeEventsByNode = {};
    for (const event of mergedNodeEvents) {
      const nodeId = event.identityId;
      if (!nodeEventsByNode[nodeId]) {
        nodeEventsByNode[nodeId] = [];
      }
      nodeEventsByNode[nodeId].push({
        blockNumber: event.blockNumber,
        stake: event.stake
      });
    }
    
    const delegatorEventsByNode = {};
    for (const event of mergedDelegatorEvents) {
      const nodeId = event.identityId;
      const delegatorKey = event.delegatorKey;
      
      if (!delegatorEventsByNode[nodeId]) {
        delegatorEventsByNode[nodeId] = {};
      }
      if (!delegatorEventsByNode[nodeId][delegatorKey]) {
        delegatorEventsByNode[nodeId][delegatorKey] = [];
      }
      delegatorEventsByNode[nodeId][delegatorKey].push({
        blockNumber: event.blockNumber,
        stakeBase: event.stakeBase
      });
    }
    
    // Create merged cache data
    const mergedCacheData = {
      nodeEvents: mergedNodeEvents,
      delegatorEvents: mergedDelegatorEvents,
      nodeEventsByNode,
      delegatorEventsByNode,
      totalNodeEvents: mergedNodeEvents.length,
      totalDelegatorEvents: mergedDelegatorEvents.length,
      lastUpdated: new Date().toISOString()
    };
    
    console.log(`   📊 Merged cache: ${Object.keys(nodeEventsByNode).length} nodes, ${Object.keys(delegatorEventsByNode).length} nodes with delegators`);
    
    // Save merged cache (for all networks)
    await this.saveCache(network, mergedCacheData);
    
    return mergedCacheData;
  }

  // Build caches for all networks in parallel
  async buildAllCaches() {
    console.log(`\n🚀 Building caches for all networks in parallel...`);
    
    const networks = ['Base', 'Gnosis', 'Neuroweb'];
    const cachePromises = networks.map(async (network) => {
      try {
        console.log(`\n${'='.repeat(40)}`);
        console.log(`[${network}] 🔍 Building cache for ${network}...`);
        console.log(`${'='.repeat(40)}`);
        
        const cache = await this.buildCache(network);
        
        // Store cache in instance
        if (network === 'Gnosis') this.gnosisCache = cache;
        else if (network === 'Base') this.baseCache = cache;
        else if (network === 'Neuroweb') this.neurowebCache = cache;
        
        console.log(`[${network}] ✅ Cache built for ${network}`);
        return { network, cache, success: true };
      } catch (error) {
        console.log(`[${network}] ❌ Failed to build cache for ${network}: ${error.message}`);
        return { network, error: error.message, success: false };
      }
    });
    
    const results = await Promise.all(cachePromises);
    
    console.log(`\n📊 Cache building results:`);
    for (const result of results) {
      if (result.success) {
        console.log(`   ✅ [${result.network}]: Success`);
      } else {
        console.log(`   ❌ [${result.network}]: ${result.error}`);
      }
    }
    
    return results;
  }

  // Validate node stakes with provided cache
  async validateNodeStakesWithCache(network, cache) {
    console.log(`\n🔍 1. Validating node stakes comprehensively for ${network} (all blocks)...`);
    
    const dbName = this.databaseMap[network];
    const client = new Client({ ...this.dbConfig, database: dbName });
    
    try {
      await client.connect();
      
      // Get ALL nodes from indexer (not just active ones)
      let nodesResult;
      
      if (network === 'Base') {
        nodesResult = await client.query(`
          SELECT DISTINCT n.identity_id, n.stake FROM node_stake_updated n
          INNER JOIN (SELECT identity_id, MAX(block_number) as max_block FROM node_stake_updated GROUP BY identity_id) latest 
          ON n.identity_id = latest.identity_id AND n.block_number = latest.max_block
          WHERE n.stake > 0
          ORDER BY n.stake DESC
        `);
      } else {
        nodesResult = await client.query(`
          SELECT DISTINCT ON (n.identity_id) n.identity_id, n.stake FROM node_stake_updated n
          WHERE n.stake > 0
          ORDER BY n.identity_id, n.block_number DESC
        `);
      }
      
      if (nodesResult.rows.length === 0) {
        console.log(`   ⚠️ No nodes found in ${network} indexer`);
        return { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 };
      }
      
      let passed = 0, failed = 0, warnings = 0, rpcErrors = 0;
      const total = nodesResult.rows.length;
      
      console.log(`   📊 Validating ${total} nodes comprehensively (all blocks)...`);
      
      let nodesWithCacheData = 0;
      let nodesSkipped = 0;
      
      for (const row of nodesResult.rows) {
        const nodeId = parseInt(row.identity_id);
        const nodeStake = BigInt(row.stake);
        
        // Check if this node has cache data (same logic as node stakes)
        const cachedDelegatorEvents = cache.delegatorEventsByNode?.[nodeId] || [];
        
        if (cachedDelegatorEvents.length === 0) {
          console.log(`   ⚠️ Node ${nodeId}: No delegator events in cache, skipping`);
          nodesSkipped++;
          continue;
        }
        
        nodesWithCacheData++;
        
        try {
          const result = await this.validateSingleNodeComprehensiveWithCache(client, network, nodeId, cache);
          
          switch (result.type) {
            case 'passed': passed++; break;
            case 'failed': failed++; break;
            case 'warning': warnings++; break;
            case 'rpcError': rpcErrors++; break;
            case 'skipped': break; // Don't count skipped
          }
        } catch (error) {
          console.log(`   ⚠️ [${network}] Node ${nodeId}: Error - ${error.message}`);
          if (error.message.includes('RPC') || error.message.includes('network') || error.message.includes('connection')) {
            rpcErrors++;
          } else {
            failed++;
          }
        }
      }
      
      console.log(`   📊 Node Stakes Summary: ✅ ${passed} ❌ ${failed} ⚠️ ${warnings} 🔌 ${rpcErrors}`);
      console.log(`   📊 Cache Coverage: ${nodesWithCacheData} nodes validated, ${nodesSkipped} nodes skipped (no cache data)`);
      return { passed, failed, warnings, rpcErrors, total };
      
    } catch (error) {
      console.error(`Error validating node stakes: ${error.message}`);
      return { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 };
    } finally {
      await client.end();
    }
  }

  // Validate delegator stakes with provided cache
  async validateDelegatorStakesComprehensiveWithCache(network, cache) {
    console.log(`\n🔍 2. Validating delegator stakes comprehensively for ${network} (all blocks)...`);
    
    const dbName = this.databaseMap[network];
    const client = new Client({ ...this.dbConfig, database: dbName });
    
    try {
      await client.connect();
      
      // Get ALL delegators from indexer (not just those of active nodes)
      const delegatorsResult = await client.query(`
        SELECT DISTINCT d.identity_id, d.delegator_key FROM delegator_base_stake_updated d
        INNER JOIN (SELECT identity_id, delegator_key, MAX(block_number) as max_block FROM delegator_base_stake_updated GROUP BY identity_id, delegator_key) latest 
        ON d.identity_id = latest.identity_id AND d.delegator_key = latest.delegator_key AND d.block_number = latest.max_block
        WHERE d.stake_base > 0 AND EXISTS (SELECT 1 FROM node_stake_updated n WHERE n.identity_id = d.identity_id AND n.stake > 0) ORDER BY d.identity_id, d.delegator_key
      `);
      
      console.log(`[${network}] 📊 Found ${delegatorsResult.rows.length} delegators in indexer`);
      
      if (delegatorsResult.rows.length === 0) {
        console.log(`   ⚠️ No delegators found in ${network} indexer`);
        return { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 };
      }
      
      let passed = 0, failed = 0, warnings = 0, rpcErrors = 0;
      const total = delegatorsResult.rows.length;
      
      console.log(`   📊 Validating ${total} delegators comprehensively (all blocks)...`);
      
      let delegatorsWithCacheData = 0;
      let delegatorsSkipped = 0;
      
      for (const row of delegatorsResult.rows) {
        const nodeId = parseInt(row.identity_id);
        const delegatorKey = row.delegator_key;
        const result = await this.validateSingleDelegatorComprehensiveWithCache(client, network, nodeId, delegatorKey, cache);
        
        switch (result.type) {
          case 'passed': passed++; break;
          case 'failed': failed++; break;
          case 'warning': warnings++; break;
          case 'rpcError': rpcErrors++; break;
          case 'skipped': break; // Don't count skipped
        }
        
        // Check if this delegator has cache data
        const cachedDelegatorEvents = cache.delegatorEventsByNode?.[nodeId]?.[delegatorKey] || [];
        if (cachedDelegatorEvents.length > 0) {
          delegatorsWithCacheData++;
        } else {
          delegatorsSkipped++;
        }
      }
      
      console.log(`   📊 Delegator Stakes Summary: ✅ ${passed} ❌ ${failed} ⚠️ ${warnings} 🔌 ${rpcErrors}`);
      console.log(`   �� Cache Coverage: ${delegatorsWithCacheData} delegators validated, ${delegatorsSkipped} delegators skipped (no cache data)`);
      return { passed, failed, warnings, rpcErrors, total };
      
    } catch (error) {
      console.error(`Error validating delegator stakes: ${error.message}`);
      return { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 };
    } finally {
      await client.end();
    }
  }

  // Validate delegator sum with provided cache
  async validateDelegatorStakeSumWithCache(network, cache) {
    console.log(`\n🔍 3. Validating delegator sum matches node stake for ${network}...`);
    
    const dbName = this.databaseMap[network];
    const client = new Client({ ...this.dbConfig, database: dbName });
    
    try {
      await client.connect();
      
      // Get ALL nodes from indexer (not just active ones)
      let nodesResult;
      
      if (network === 'Base') {
        nodesResult = await client.query(`
          SELECT DISTINCT n.identity_id, n.stake FROM node_stake_updated n
          INNER JOIN (SELECT identity_id, MAX(block_number) as max_block FROM node_stake_updated GROUP BY identity_id) latest 
          ON n.identity_id = latest.identity_id AND n.block_number = latest.max_block
          WHERE n.stake > 0
          ORDER BY n.stake DESC
        `);
      } else {
        nodesResult = await client.query(`
          SELECT DISTINCT ON (n.identity_id) n.identity_id, n.stake FROM node_stake_updated n
          WHERE n.stake > 0
          ORDER BY n.identity_id, n.block_number DESC
        `);
      }
      
      if (nodesResult.rows.length === 0) {
        console.log(`   ⚠️ No nodes found in ${network} indexer`);
        return { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 };
      }
      
      let passed = 0, failed = 0, warnings = 0, rpcErrors = 0;
      const total = nodesResult.rows.length;
      
      console.log(`   📊 Validating ${total} nodes...`);
      
      let nodesWithCacheData = 0;
      let nodesSkipped = 0;
      
      for (const row of nodesResult.rows) {
        const nodeId = parseInt(row.identity_id);
        const nodeStake = BigInt(row.stake);
        
        // Remove cache checks to ensure only indexer data is used
        // const cachedDelegatorEvents = cache.delegatorEventsByNode?.[nodeId] || [];
        // const cachedNodeEvents = cache.nodeEventsByNode?.[nodeId] || [];
        
        // Fetch latest delegator stakes from indexer
        const delegatorStakes = await client.query(`
          SELECT DISTINCT ON (delegator_key) *
          FROM delegator_base_stake_updated 
          WHERE identity_id = $1
          ORDER BY delegator_key, block_number DESC
        `, [nodeId]);

        // Sum the latest stakes for all delegators
        const indexerTotalDelegatorStake = delegatorStakes.rows.reduce((sum, row) => sum + BigInt(row.stake_base), 0n);

        // Get the latest node stake from indexer
        const nodeStakeResult = await client.query(`
          SELECT stake FROM node_stake_updated 
          WHERE identity_id = $1 
          ORDER BY block_number DESC 
          LIMIT 1
        `, [nodeId]);

        const indexerNodeStake = nodeStakeResult.rows.length > 0 ? BigInt(nodeStakeResult.rows[0].stake) : 0n;

        // Log the node being tested and the stakes
        console.log(`   📊 Node ${nodeId}:`);
        console.log(`      Indexer: Sum of delegations: ${this.weiToTRAC(indexerTotalDelegatorStake)} TRAC, Node stake: ${this.weiToTRAC(indexerNodeStake)} TRAC`);

        // Compare delegator sum with node stake
        const difference = indexerTotalDelegatorStake - indexerNodeStake;
        const tolerance = 20n; // 20 WEI tolerance (0.000000000000000020 TRAC)

        if (difference === 0n || (difference > -tolerance && difference < tolerance)) {
          console.log(`      ✅ Delegator sum matches node stake (within tolerance)`);
          passed++;
        } else {
          console.log(`      ❌ Delegator sum does not match node stake`);
          console.log(`      📊 Difference: ${this.weiToTRAC(difference)} TRAC`);
          failed++;
        }
      }
      
      console.log(`   📊 Delegator Sum Summary: ✅ ${passed} ❌ ${failed} ⚠️ ${warnings} 🔌 ${rpcErrors}`);
      console.log(`   📊 Cache Coverage: ${nodesWithCacheData} nodes validated, ${nodesSkipped} nodes skipped (no cache data)`);
      return { passed, failed, warnings, rpcErrors, total };
      
    } catch (error) {
      console.error(`Error validating delegator stake sum: ${error.message}`);
      return { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 };
    } finally {
      await client.end();
    }
  }

  // Validate knowledge collections with provided cache
  async validateKnowledgeCollectionsWithCache(network, cache) {
    console.log(`\n🔍 4. Validating knowledge collections for ${network}...`);
    
    const dbName = this.databaseMap[network];
    const client = new Client({ ...this.dbConfig, database: dbName });
    
    try {
      await client.connect();
      
      // Debug: Check what's in the knowledge collection table
      const debugResult = await client.query(`
        SELECT COUNT(*) as total_count, 
               MIN(id) as min_id, 
               MAX(id) as max_id,
               COUNT(CASE WHEN id IS NULL THEN 1 END) as null_count,
               COUNT(CASE WHEN id = '999999' THEN 1 END) as suspicious_count
        FROM knowledge_collection_created
      `);
      
      console.log(`[${network}] 📊 Knowledge Collection Debug:`);
      console.log(`[${network}]    Total records: ${debugResult.rows[0].total_count}`);
      console.log(`[${network}]    Min ID: ${debugResult.rows[0].min_id}`);
      console.log(`[${network}]    Max ID: ${debugResult.rows[0].max_id}`);
      console.log(`[${network}]    Null IDs: ${debugResult.rows[0].null_count}`);
      console.log(`[${network}]    Suspicious IDs (999999): ${debugResult.rows[0].suspicious_count}`);
      
      // Get latest knowledge collection ID from indexer - use COUNT instead of MAX
      const indexerResult = await client.query(`
        SELECT COUNT(*) as total_count FROM knowledge_collection_created
      `);
      const indexerLatestId = parseInt(indexerResult.rows[0].total_count);
      
      // Get latest knowledge collection ID from contract
      const networkConfig = config.networks.find(n => n.name === network);
      const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
      const knowledgeAddress = await this.getContractAddressFromHub(network, 'KnowledgeCollectionStorage');
      
      console.log(`[${network}] 📊 Knowledge Collection Contract Address: ${knowledgeAddress}`);
      
      const knowledgeContract = new ethers.Contract(knowledgeAddress, [
        'function getLatestKnowledgeCollectionId() view returns (uint256)'
      ], provider);
      
      const contractLatestId = await knowledgeContract.getLatestKnowledgeCollectionId();
      
      console.log(`   📊 Indexer knowledge collections: ${indexerLatestId.toLocaleString()}`);
      console.log(`   📊 Contract knowledge collections: ${contractLatestId.toLocaleString()}`);
      
      // Compare knowledge collection counts directly (no block number comparison)
      const difference = BigInt(contractLatestId) - BigInt(indexerLatestId);
      const tolerance = 20n; // 20 WEI tolerance
      
      if (difference === 0n || (difference > 0n && difference < tolerance)) {
        console.log(`   ✅ Knowledge collections match (within tolerance): Indexer ${indexerLatestId.toLocaleString()}, Contract ${contractLatestId.toLocaleString()}`);
        return { passed: 1, failed: 0, warnings: 0, rpcErrors: 0, total: 1 };
      } else {
        console.log(`   ❌ Knowledge collections mismatch: Indexer ${indexerLatestId.toLocaleString()}, Contract ${contractLatestId.toLocaleString()}`);
        console.log(`   📊 Difference: ${difference > 0 ? '+' : ''}${difference}`);
        return { passed: 0, failed: 1, warnings: 0, rpcErrors: 0, total: 1 };
      }
      
    } catch (error) {
      console.error(`Error validating knowledge collections: ${error.message}`);
      return { passed: 0, failed: 0, warnings: 0, rpcErrors: 1, total: 1 };
    } finally {
      await client.end();
    }
  }

  // Operation 5: Missing Events Detection
  async validateMissingEventsDetection(network, cache) {
    console.log(`\n🔍 5. Detecting missing events for ${network}...`);
  
    const dbName = this.databaseMap[network];
    const client = new Client({ ...this.dbConfig, database: dbName });
  
    try {
      await client.connect();
  
      // Step 1: Determine safe upper bound
      console.log(`   📊 Step 1: Determining safe upper bound...`);
      const indexedTipResult = await client.query(`
        SELECT MAX(block_number) as latest_block FROM (
          SELECT block_number FROM node_stake_updated
          UNION
          SELECT block_number FROM delegator_base_stake_updated
        ) all_blocks
      `);
  
      const indexedTip = indexedTipResult.rows[0]?.latest_block || 0;
      const confirmationsBuffer = 10;
      const scanTo = indexedTip - confirmationsBuffer;
  
      console.log(`   📊 Indexed tip: ${indexedTip.toLocaleString()}`);
      console.log(`   📊 Safe scan bound: ${scanTo.toLocaleString()} (with ${confirmationsBuffer} block buffer)`);
  
      if (scanTo <= 0) {
        console.log(`   ⚠️ No safe blocks to scan, skipping`);
        return { passed: 1, failed: 0, warnings: 0, rpcErrors: 0, total: 1 };
      }
  
      // Step 2: Get contract events from cache
      console.log(`   📊 Step 2: Getting contract events from cache...`);
  
      if (!cache || !cache.nodeEvents || !cache.delegatorEvents) {
        console.log(`   ⚠️ No cache data available, skipping`);
        return { passed: 1, failed: 0, warnings: 0, rpcErrors: 0, total: 1 };
      }
  
      const inRange = (b) => b > 0 && b <= scanTo;
  
      const onchainNodeEvents = (cache.nodeEvents || []).filter(e => inRange(e.blockNumber));
      const onchainDelegatorEvents = (cache.delegatorEvents || []).filter(e => inRange(e.blockNumber));
  
      console.log(`      Cached node events: ${onchainNodeEvents.length}`);
      console.log(`      Cached delegator events: ${onchainDelegatorEvents.length}`);
  
      // Step 3: Build on-chain event keys
      const onchainKeys = new Set();
      for (const e of onchainNodeEvents) {
        const key = e.transactionHash && e.logIndex !== undefined
          ? `${e.blockNumber}:${e.transactionHash}:${e.logIndex}`
          : `${e.blockNumber}:Node:${e.identityId}:${e.stake}`;
        onchainKeys.add(key);
      }
      for (const e of onchainDelegatorEvents) {
        const key = e.transactionHash && e.logIndex !== undefined
          ? `${e.blockNumber}:${e.transactionHash}:${e.logIndex}`
          : `${e.blockNumber}:Delegator:${e.identityId}:${e.delegatorKey}:${e.stakeBase}`;
        onchainKeys.add(key);
      }
  
      console.log(`   📊 On-chain unique events in range: ${onchainKeys.size}`);
  
      // Step 4: Fetch indexer events up to scanTo
      console.log(`   📊 Step 3: Fetching indexer events...`);
  
      const indexerNodeEvents = await client.query(`
        SELECT identity_id, stake, block_number, transaction_hash, log_index
        FROM node_stake_updated
        WHERE block_number <= $1
        ORDER BY block_number ASC
      `, [scanTo]);
  
      const indexerDelegatorEvents = await client.query(`
        SELECT identity_id, delegator_key, stake_base, block_number, transaction_hash, log_index
        FROM delegator_base_stake_updated
        WHERE block_number <= $1
        ORDER BY block_number ASC
      `, [scanTo]);
  
      // Step 5: Build indexer event keys
      const indexerKeys = new Set();
      for (const r of indexerNodeEvents.rows) {
        const key = r.transaction_hash && r.log_index !== null
          ? `${r.block_number}:${r.transaction_hash}:${r.log_index}`
          : `${r.block_number}:Node:${r.identity_id}:${r.stake}`;
        indexerKeys.add(key);
      }
      for (const r of indexerDelegatorEvents.rows) {
        const key = r.transaction_hash && r.log_index !== null
          ? `${r.block_number}:${r.transaction_hash}:${r.log_index}`
          : `${r.block_number}:Delegator:${r.identity_id}:${r.delegator_key}:${r.stake_base}`;
        indexerKeys.add(key);
      }
  
      console.log(`   📊 Indexer unique events in range: ${indexerKeys.size}`);
  
      // Step 6: Compare sets
      const missingEvents = [];
      for (const e of [...onchainNodeEvents, ...onchainDelegatorEvents]) {
        const k = (e.transactionHash && e.logIndex !== undefined)
          ? `${e.blockNumber}:${e.transactionHash}:${e.logIndex}`
          : (e.eventType === 'NodeStakeUpdated'
            ? `${e.blockNumber}:Node:${e.identityId}:${e.stake}`
            : `${e.blockNumber}:Delegator:${e.identityId}:${e.delegatorKey}:${e.stakeBase}`);
  
        if (!indexerKeys.has(k)) {
          missingEvents.push(e);
        }
      }
  
      console.log(`   📊 Missing events found: ${missingEvents.length}`);
      for (const m of missingEvents) {
        if (m.eventType === 'NodeStakeUpdated') {
          console.log(`      ❌ Missing NodeStakeUpdated at block ${m.blockNumber} for Node ${m.identityId} stake ${this.weiToTRAC(m.stake)} TRAC`);
        } else {
          console.log(`      ❌ Missing DelegatorBaseStakeUpdated at block ${m.blockNumber} for Node ${m.identityId}, Delegator ${m.delegatorKey}, stake ${this.weiToTRAC(m.stakeBase)} TRAC`);
        }
      }
  
      // Step 7: Summary
      const summary = {
        network,
        scannedBlocks: scanTo,
        onchainEvents: onchainKeys.size,
        indexerEvents: indexerKeys.size,
        missingEvents: missingEvents.length
      };
  
      console.log(`   📊 Summary:`);
      console.log(`      Scanned blocks: ${summary.scannedBlocks.toLocaleString()}`);
      console.log(`      On-chain events: ${summary.onchainEvents}`);
      console.log(`      Indexer events: ${summary.indexerEvents}`);
      console.log(`      Missing events: ${summary.missingEvents}`);
  
      if (missingEvents.length === 0) {
        console.log(`   ✅ No missing events detected`);
        return { passed: 1, failed: 0, warnings: 0, rpcErrors: 0, total: 1 };
      } else {
        console.log(`   ❌ Missing events detected`);
        return { passed: 0, failed: 1, warnings: 0, rpcErrors: 0, total: 1 };
      }
  
    } catch (error) {
      console.error(`Error detecting missing events: ${error.message}`);
      return { passed: 0, failed: 0, warnings: 0, rpcErrors: 1, total: 1 };
    } finally {
      await client.end();
    }
  }
  

  // RUN ALL VALIDATIONS
  async runAllValidations(network, cache) {
    console.log(`\n🚀 Running all validations for ${network}...`);
    
    // Use provided cache instead of building again
    console.log(`\n🔍 Using existing cache for ${network}...`);
    
    const results = {
      nodeStakes: await this.validateNodeStakesWithCache(network, cache),
      delegatorStakes: await this.validateDelegatorStakesComprehensiveWithCache(network, cache),
      delegatorSum: await this.validateDelegatorStakeSumWithCache(network, cache),
      knowledgeCollections: await this.validateKnowledgeCollectionsWithCache(network, cache),
      missingEvents: await this.validateMissingEventsDetection(network, cache)
    };
    
    console.log(`\n📊 FINAL SUMMARY FOR ${network}:`);
    console.log(`   1. Node Stakes: ✅ ${results.nodeStakes.passed} ❌ ${results.nodeStakes.failed} ⚠️ ${results.nodeStakes.warnings} 🔌 ${results.nodeStakes.rpcErrors}`);
    console.log(`   2. Delegator Stakes (All Blocks): ✅ ${results.delegatorStakes.passed} ❌ ${results.delegatorStakes.failed} ⚠️ ${results.delegatorStakes.warnings} 🔌 ${results.delegatorStakes.rpcErrors}`);
    console.log(`   3. Delegator Sum: ✅ ${results.delegatorSum.passed} ❌ ${results.delegatorSum.failed} ⚠️ ${results.delegatorSum.warnings} 🔌 ${results.delegatorSum.rpcErrors}`);
    console.log(`   4. Knowledge Collections: ✅ ${results.knowledgeCollections.passed} ❌ ${results.knowledgeCollections.failed} ⚠️ ${results.knowledgeCollections.warnings} 🔌 ${results.knowledgeCollections.rpcErrors}`);
    console.log(`   5. Missing Events Detection: ✅ ${results.missingEvents.passed} ❌ ${results.missingEvents.failed} ⚠️ ${results.missingEvents.warnings} 🔌 ${results.missingEvents.rpcErrors}`);
    
    return results;
  }

  // Check if Neuroweb cache needs updates by comparing latest block
  async checkCacheNeedsUpdate(network, existingCache) {
    const networkConfig = config.networks.find(n => n.name === network);
    if (!networkConfig) throw new Error(`Network ${network} not found in config`);

    let provider;
    let retryCount = 0;
    while (true) {
      try {
        provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
        await provider.getNetwork();
        break;
      } catch (error) {
        retryCount++;
        if (retryCount >= 10) {
          console.log(`   ⚠️ Cannot check for updates, using existing cache`);
          return false;
        }
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    const currentBlock = await provider.getBlockNumber();
    
    // Get the latest block from existing cache (using processed structure)
    let latestExistingBlock = 0;
    
    // Check node events from processed structure
    if (existingCache.nodeEventsByNode) {
      for (const [nodeId, events] of Object.entries(existingCache.nodeEventsByNode)) {
        for (const event of events) {
          if (event.blockNumber > latestExistingBlock) {
            latestExistingBlock = event.blockNumber;
          }
        }
      }
    }
    
    // Check delegator events from processed structure
    if (existingCache.delegatorEventsByNode) {
      for (const [nodeId, delegators] of Object.entries(existingCache.delegatorEventsByNode)) {
        for (const [delegatorKey, events] of Object.entries(delegators)) {
          for (const event of events) {
            if (event.blockNumber > latestExistingBlock) {
              latestExistingBlock = event.blockNumber;
            }
          }
        }
      }
    }
    
    console.log(`   📊 Latest cache block: ${latestExistingBlock.toLocaleString()}`);
    console.log(`   📊 Current blockchain block: ${currentBlock.toLocaleString()}`);
    
    const needsUpdate = currentBlock > latestExistingBlock;
    console.log(`   📊 Cache ${needsUpdate ? 'needs' : 'does not need'} update`);
    
    return needsUpdate;
  }

  // Query only new events (after the latest cached block)
  async queryNewEvents(network, existingCache) {
    const networkConfig = config.networks.find(n => n.name === network);
    if (!networkConfig) throw new Error(`Network ${network} not found in config`);

    let provider;
    let retryCount = 0;
    while (true) {
      try {
        provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
        await provider.getNetwork();
        break;
      } catch (error) {
        retryCount++;
        // Base/Gnosis: 1000 retries, Neuroweb: Infinite retries
        if (network !== 'Neuroweb' && retryCount >= 1000) {
          throw new Error(`Failed to connect to ${network} RPC after 1000 attempts`);
        }
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    const stakingAddress = await this.getContractAddressFromHub(network, 'StakingStorage');
    const stakingContract = new ethers.Contract(stakingAddress, [
      'event NodeStakeUpdated(uint72 indexed identityId, uint96 stake)',
      'event DelegatorBaseStakeUpdated(uint72 indexed identityId, bytes32 indexed delegatorKey, uint96 stakeBase)'
    ], provider);
    
    const currentBlock = await provider.getBlockNumber();
    
    // Get the latest block from existing cache (using processed structure)
    let latestExistingBlock = 0;
    
    // Check node events from processed structure
    if (existingCache.nodeEventsByNode) {
      for (const [nodeId, events] of Object.entries(existingCache.nodeEventsByNode)) {
        for (const event of events) {
          if (event.blockNumber > latestExistingBlock) {
            latestExistingBlock = event.blockNumber;
          }
        }
      }
    }
    
    // Check delegator events from processed structure
    if (existingCache.delegatorEventsByNode) {
      for (const [nodeId, delegators] of Object.entries(existingCache.delegatorEventsByNode)) {
        for (const [delegatorKey, events] of Object.entries(delegators)) {
          for (const event of events) {
            if (event.blockNumber > latestExistingBlock) {
              latestExistingBlock = event.blockNumber;
            }
          }
        }
      }
    }
    
    const fromBlock = latestExistingBlock + 1;
    console.log(`[${network}] 📊 Querying new events from block ${fromBlock.toLocaleString()} to ${currentBlock.toLocaleString()}`);
    
    if (fromBlock > currentBlock) {
      console.log(`[${network}] 📊 No new blocks to query`);
      return { nodeEvents: [], delegatorEvents: [] };
    }
    
    // Set chunk size based on network
    const chunkSize = network === 'Base' ? 100000 : network === 'Gnosis' ? 1000000 : 10000; // Base: 100k, Gnosis: 1M, Neuroweb: 10k
    console.log(`[${network}] 📊 Using chunk size: ${chunkSize.toLocaleString()}`);
    
    let allNodeEvents = [];
    let allDelegatorEvents = [];
    
    // Query node events
    console.log(`[${network}] 📊 Querying new NodeStakeUpdated events...`);
    const nodeFilter = stakingContract.filters.NodeStakeUpdated();
    
    let totalChunks = Math.ceil((currentBlock - fromBlock + 1) / chunkSize);
    let processedChunks = 0;
    
    for (let startBlock = fromBlock; startBlock <= currentBlock; startBlock += chunkSize) {
      const endBlock = Math.min(startBlock + chunkSize - 1, currentBlock);
      processedChunks++;
      
      console.log(`[${network}] 📊 Processing chunk ${processedChunks}/${totalChunks} (blocks ${startBlock.toLocaleString()}-${endBlock.toLocaleString()})`);
      
      let chunkRetryCount = 0;
      while (true) {
        try {
          const chunkEvents = await stakingContract.queryFilter(nodeFilter, startBlock, endBlock);
          allNodeEvents = allNodeEvents.concat(chunkEvents);
          
          console.log(`[${network}] ✅ Found ${chunkEvents.length} new node events in chunk ${processedChunks}`);
          
          if (chunkRetryCount > 0) {
            console.log(`[${network}] ✅ Chunk ${startBlock}-${endBlock} succeeded after ${chunkRetryCount} retries`);
          }
          break;
        } catch (error) {
          chunkRetryCount++;
          console.log(`[${network}] ⚠️ Chunk ${startBlock}-${endBlock} failed (attempt ${chunkRetryCount}): ${error.message}`);
          // Base/Gnosis: 1000 retries, Neuroweb: Infinite retries
          if (network !== 'Neuroweb' && chunkRetryCount >= 1000) {
            console.log(`[${network}] ❌ Skipping chunk ${startBlock}-${endBlock} after 1000 failed attempts`);
            break;
          }
          console.log(`[${network}] ⏳ Retrying in 3 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    }
    
    // Query delegator events
    console.log(`[${network}] 📊 Querying new DelegatorBaseStakeUpdated events...`);
    const delegatorFilter = stakingContract.filters.DelegatorBaseStakeUpdated();
    
    processedChunks = 0;
    
    for (let startBlock = fromBlock; startBlock <= currentBlock; startBlock += chunkSize) {
      const endBlock = Math.min(startBlock + chunkSize - 1, currentBlock);
      processedChunks++;
      
      console.log(`[${network}] 📊 Processing chunk ${processedChunks}/${totalChunks} (blocks ${startBlock.toLocaleString()}-${endBlock.toLocaleString()})`);
      
      let chunkRetryCount = 0;
      while (true) {
        try {
          const chunkEvents = await stakingContract.queryFilter(delegatorFilter, startBlock, endBlock);
          allDelegatorEvents = allDelegatorEvents.concat(chunkEvents);
          
          console.log(`[${network}] ✅ Found ${chunkEvents.length} new delegator events in chunk ${processedChunks}`);
          
          if (chunkRetryCount > 0) {
            console.log(`[${network}] ✅ Chunk ${startBlock}-${endBlock} succeeded after ${chunkRetryCount} retries`);
          }
          break;
        } catch (error) {
          chunkRetryCount++;
          console.log(`[${network}] ⚠️ Chunk ${startBlock}-${endBlock} failed (attempt ${chunkRetryCount}): ${error.message}`);
          // Base/Gnosis: 1000 retries, Neuroweb: Infinite retries
          if (network !== 'Neuroweb' && chunkRetryCount >= 1000) {
            console.log(`[${network}] ❌ Skipping chunk ${startBlock}-${endBlock} after 1000 failed attempts`);
            break;
          }
          console.log(`[${network}] ⏳ Retrying in 3 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    }
    
    console.log(`[${network}] 📊 Found ${allNodeEvents.length} new node events and ${allDelegatorEvents.length} new delegator events`);
    
    // Process new events into cache format
    const newEvents = {
      nodeEvents: allNodeEvents.map(event => ({
        blockNumber: event.blockNumber,
        identityId: event.args.identityId.toString(),
        stake: event.args.stake.toString()
      })),
      delegatorEvents: allDelegatorEvents.map(event => ({
        blockNumber: event.blockNumber,
        identityId: event.args.identityId.toString(),
        delegatorKey: event.args.delegatorKey,
        stakeBase: event.args.stakeBase.toString()
      }))
    };
    
    return newEvents;
  }

  // Helper function for comprehensive node validation
  async validateSingleNodeComprehensiveWithCache(client, network, nodeId, cache) {
    try {
      // Get ALL node stake events from indexer for this node
      const allIndexerEventsResult = await client.query(`
        SELECT stake, block_number FROM node_stake_updated 
        WHERE identity_id = $1 ORDER BY block_number DESC
      `, [nodeId]);
      
      if (allIndexerEventsResult.rows.length === 0) {
        return { type: 'skipped' };
      }
      
      // Group indexer events by block number and sort by stake (highest first)
      const indexerEventsByBlock = {};
      for (const event of allIndexerEventsResult.rows) {
        const blockNum = event.block_number;
        if (!indexerEventsByBlock[blockNum]) {
          indexerEventsByBlock[blockNum] = [];
        }
        indexerEventsByBlock[blockNum].push({ blockNumber: blockNum, stake: BigInt(event.stake) });
      }
      
      // Sort each block's events by stake (highest first) and keep only the highest
      const processedIndexerEvents = [];
      for (const [blockNum, events] of Object.entries(indexerEventsByBlock)) {
        events.sort((a, b) => Number(b.stake - a.stake)); // Sort by stake descending
        processedIndexerEvents.push(events[0]); // Keep only the highest stake
      }
      
      // Sort processed events by block number (newest first)
      processedIndexerEvents.sort((a, b) => b.blockNumber - a.blockNumber);
      
      // Get cached contract events for this node
      const cachedNodeEvents = cache.nodeEventsByNode?.[nodeId] || [];
      
      if (cachedNodeEvents.length === 0) {
        return { type: 'skipped' };
      }
      
      // Group contract events by block number and sort by stake (highest first)
      const contractEventsByBlock = {};
      for (const event of cachedNodeEvents) {
        const blockNum = event.blockNumber;
        if (!contractEventsByBlock[blockNum]) {
          contractEventsByBlock[blockNum] = [];
        }
        contractEventsByBlock[blockNum].push({ blockNumber: blockNum, stake: BigInt(event.stake) });
      }
      
      // Sort each block's events by stake (highest first) and keep only the highest
      const processedContractEvents = [];
      for (const [blockNum, events] of Object.entries(contractEventsByBlock)) {
        events.sort((a, b) => Number(b.stake - a.stake)); // Sort by stake descending
        processedContractEvents.push(events[0]); // Keep only the highest stake
      }
      
      // Sort processed events by block number (newest first)
      processedContractEvents.sort((a, b) => b.blockNumber - a.blockNumber);
      
      // Find common blocks between indexer and contract events
      const indexerBlocks = new Set(processedIndexerEvents.map(e => Number(e.blockNumber)));
      const contractBlocks = new Set(processedContractEvents.map(e => Number(e.blockNumber)));
      const commonBlocks = [...indexerBlocks].filter(block => contractBlocks.has(block));
      
      if (commonBlocks.length === 0) {
        return { type: 'skipped' };
      }
      
      // Sort common blocks in descending order (newest first)
      commonBlocks.sort((a, b) => b - a);
      
      console.log(`🔍 [${network}] Node ${nodeId}: ${commonBlocks.length} blocks to validate`);
      
      let validationPassed = true;
      
      // Validate each common block in descending order
      for (const blockNumber of commonBlocks) {
        const indexerEvent = processedIndexerEvents.find(e => Number(e.blockNumber) === blockNumber);
        const contractEvent = processedContractEvents.find(e => Number(e.blockNumber) === blockNumber);
        
        if (indexerEvent && contractEvent) {
          const expectedStake = indexerEvent.stake;
          const actualStake = contractEvent.stake;
          
          console.log(`   📊 Block ${blockNumber}: Indexer ${this.weiToTRAC(expectedStake)} TRAC, Contract ${this.weiToTRAC(actualStake)} TRAC`);
          
          const difference = expectedStake - actualStake;
          const tolerance = 20n; // 20 WEI tolerance
          
          if (difference === 0n) {
            console.log(`      ✅ EXACT MATCH`);
          } else if (difference >= -tolerance && difference <= tolerance) {
            console.log(`      ✅ MATCH (within tolerance: ${difference > 0 ? '+' : ''}${this.weiToTRAC(difference > 0 ? difference : -difference)} TRAC)`);
          } else {
            console.log(`      ❌ DIFFER: ${difference > 0 ? '+' : ''}${this.weiToTRAC(difference > 0 ? difference : -difference)} TRAC`);
            validationPassed = false;
          }
        }
      }
      
      if (validationPassed) {
        console.log(`   ✅ [${network}] Node ${nodeId}: All ${commonBlocks.length} blocks validated successfully`);
      } else {
        console.log(`   ❌ [${network}] Node ${nodeId}: Validation failed for some blocks`);
      }
      
      return { type: validationPassed ? 'passed' : 'failed' };
      
    } catch (error) {
      console.log(`   ⚠️ [${network}] Node ${nodeId}: Error - ${error.message}`);
      if (error.message.includes('RPC') || error.message.includes('network') || error.message.includes('connection')) {
        return { type: 'rpcError' };
      } else {
        return { type: 'failed' };
      }
    }
  }

  // Helper function for comprehensive delegator validation
  async validateSingleDelegatorComprehensiveWithCache(client, network, nodeId, delegatorKey, cache) {
    try {
      // Get ALL delegator stake events from indexer for this node/delegator
      const allIndexerEventsResult = await client.query(`
        SELECT stake_base, block_number FROM delegator_base_stake_updated 
        WHERE identity_id = $1 AND delegator_key = $2 ORDER BY block_number DESC
      `, [nodeId, delegatorKey]);
      
      if (allIndexerEventsResult.rows.length === 0) {
        return { type: 'skipped' };
      }
      
      // Group indexer events by block number and sort by stake (highest first)
      const indexerEventsByBlock = {};
      for (const event of allIndexerEventsResult.rows) {
        const blockNum = event.block_number;
        if (!indexerEventsByBlock[blockNum]) {
          indexerEventsByBlock[blockNum] = [];
        }
        indexerEventsByBlock[blockNum].push({ blockNumber: blockNum, stakeBase: BigInt(event.stake_base) });
      }
      
      // Sort each block's events by stake (highest first) and keep only the highest
      const processedIndexerEvents = [];
      for (const [blockNum, events] of Object.entries(indexerEventsByBlock)) {
        events.sort((a, b) => Number(b.stakeBase - a.stakeBase)); // Sort by stake descending
        processedIndexerEvents.push(events[0]); // Keep only the highest stake
      }
      
      // Sort processed events by block number (newest first)
      processedIndexerEvents.sort((a, b) => b.blockNumber - a.blockNumber);
      
      // Get cached contract events for this node/delegator
      const cachedDelegatorEvents = cache.delegatorEventsByNode?.[nodeId]?.[delegatorKey] || [];
      
      if (cachedDelegatorEvents.length === 0) {
        return { type: 'skipped' };
      }
      
      // Group contract events by block number and sort by stake (highest first)
      const contractEventsByBlock = {};
      for (const event of cachedDelegatorEvents) {
        const blockNum = event.blockNumber;
        if (!contractEventsByBlock[blockNum]) {
          contractEventsByBlock[blockNum] = [];
        }
        contractEventsByBlock[blockNum].push({ blockNumber: blockNum, stakeBase: BigInt(event.stakeBase) });
      }
      
      // Sort each block's events by stake (highest first) and keep only the highest
      const processedContractEvents = [];
      for (const [blockNum, events] of Object.entries(contractEventsByBlock)) {
        events.sort((a, b) => Number(b.stakeBase - a.stakeBase)); // Sort by stake descending
        processedContractEvents.push(events[0]); // Keep only the highest stake
      }
      
      // Sort processed events by block number (newest first)
      processedContractEvents.sort((a, b) => b.blockNumber - a.blockNumber);
      
      // Find common blocks between indexer and contract events
      const indexerBlocks = new Set(processedIndexerEvents.map(e => Number(e.blockNumber)));
      const contractBlocks = new Set(processedContractEvents.map(e => Number(e.blockNumber)));
      const commonBlocks = [...indexerBlocks].filter(block => contractBlocks.has(block));
      
      if (commonBlocks.length === 0) {
        return { type: 'skipped' };
      }
      
      // Sort common blocks in descending order (newest first)
      commonBlocks.sort((a, b) => b - a);
      
      console.log(`🔍 [${network}] Node ${nodeId}, Delegator ${delegatorKey}: ${commonBlocks.length} blocks to validate`);
      
      let validationPassed = true;
      
      // Validate each common block in descending order
      for (const blockNumber of commonBlocks) {
        const indexerEvent = processedIndexerEvents.find(e => Number(e.blockNumber) === blockNumber);
        const contractEvent = processedContractEvents.find(e => Number(e.blockNumber) === blockNumber);
        
        if (indexerEvent && contractEvent) {
          const expectedStake = indexerEvent.stakeBase;
          const actualStake = contractEvent.stakeBase;
          
          console.log(`   📊 Block ${blockNumber}: Indexer ${this.weiToTRAC(expectedStake)} TRAC, Contract ${this.weiToTRAC(actualStake)} TRAC`);
          
          const difference = expectedStake - actualStake;
          const tolerance = 20n; // 20 WEI tolerance
          
          if (difference === 0n) {
            console.log(`      ✅ MATCH`);
          } else if (difference >= -tolerance && difference <= tolerance) {
            console.log(`      ✅ MATCH (within tolerance: ${difference > 0 ? '+' : ''}${this.weiToTRAC(difference > 0 ? difference : -difference)} TRAC)`);
        } else {
            console.log(`      ❌ DIFFER: ${difference > 0 ? '+' : ''}${this.weiToTRAC(difference > 0 ? difference : -difference)} TRAC`);
            validationPassed = false;
          }
        }
      }
      
      if (validationPassed) {
        console.log(`   ✅ [${network}] Node ${nodeId}, Delegator ${delegatorKey}: All ${commonBlocks.length} blocks validated successfully`);
        } else {
        console.log(`   ❌ [${network}] Node ${nodeId}, Delegator ${delegatorKey}: Validation failed for some blocks`);
      }
      
      return { type: validationPassed ? 'passed' : 'failed' };
      
    } catch (error) {
      console.log(`   ⚠️ [${network}] Node ${nodeId}, Delegator ${delegatorKey}: Error - ${error.message}`);
      if (error.message.includes('RPC') || error.message.includes('network') || error.message.includes('connection')) {
        return { type: 'rpcError' };
      } else {
        return { type: 'failed' };
      }
    }
  }

  // Helper function to create database connection with retry logic
  async createDatabaseConnection(network) {
    const dbName = this.databaseMap[network];
    const client = new Client({ ...this.dbConfig, database: dbName });
    
    let retryCount = 0;
    const maxRetries = 5;
    
    while (retryCount < maxRetries) {
      try {
        await client.connect();
        console.log(`[${network}] ✅ Database connection established`);
        return client;
      } catch (error) {
        retryCount++;
        console.log(`[${network}] ⚠️ Database connection failed (attempt ${retryCount}/${maxRetries}): ${error.message}`);
        
        if (retryCount >= maxRetries) {
          throw new Error(`Failed to connect to ${network} database after ${maxRetries} attempts`);
        }
        
        console.log(`[${network}] ⏳ Retrying database connection in 5 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  // Helper function to execute database queries with retry logic
  async executeQuery(client, query, params = []) {
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        const result = await client.query(query, params);
        return result;
      } catch (error) {
        retryCount++;
        console.log(`⚠️ Database query failed (attempt ${retryCount}/${maxRetries}): ${error.message}`);
        
        if (retryCount >= maxRetries) {
          throw error;
        }
        
        // If connection is lost, try to reconnect
        if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
          try {
            await client.end();
            await client.connect();
            console.log(`✅ Database connection re-established`);
          } catch (reconnectError) {
            console.log(`⚠️ Failed to reconnect: ${reconnectError.message}`);
          }
        }
        
        console.log(`⏳ Retrying query in 3 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
  }
}

// Test all validations
async function testAllValidations() {
  const qaService = new ComprehensiveQAService();
  
  console.log('🧪 Testing all 4 validation functions for all networks...');
  
  const networks = ['Base', 'Gnosis', 'Neuroweb'];
  const allResults = {};
  
  // First, build all caches in parallel
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🚀 BUILDING CACHES FOR ALL NETWORKS IN PARALLEL`);
  console.log(`${'='.repeat(80)}`);
  
  const cacheResults = await qaService.buildAllCaches();
  
  // Check which networks have successful caches
  const successfulNetworks = cacheResults.filter(r => r.success).map(r => r.network);
  console.log(`\n📊 Networks with successful caches: ${successfulNetworks.join(', ')}`);
  
  // Run validations for networks with successful caches
  for (const network of successfulNetworks) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 STARTING VALIDATIONS FOR ${network.toUpperCase()}`);
    console.log(`${'='.repeat(60)}`);
    
    try {
      // Get the built cache for this network
      const cacheResult = cacheResults.find(r => r.network === network && r.success);
      const cache = cacheResult.cache;
      
      const results = await qaService.runAllValidations(network, cache);
      allResults[network] = results;
    } catch (error) {
      console.log(`❌ Error running validations for ${network}: ${error.message}`);
      allResults[network] = {
        nodeStakes: { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 },
        delegatorStakes: { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 },
        delegatorSum: { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 },
        knowledgeCollections: { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 },
        missingEvents: { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 }
      };
    }
  }
  
  // Add failed networks to results
  for (const result of cacheResults) {
    if (!result.success && !allResults[result.network]) {
      allResults[result.network] = {
        nodeStakes: { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 },
        delegatorStakes: { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 },
        delegatorSum: { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 },
        knowledgeCollections: { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 },
        missingEvents: { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 }
      };
    }
  }
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🎯 FINAL SUMMARY FOR ALL NETWORKS`);
  console.log(`${'='.repeat(80)}`);
  
  for (const network of networks) {
    const results = allResults[network];
    console.log(`\n📊 ${network.toUpperCase()}:`);
    console.log(`   1. Node Stakes: ✅ ${results.nodeStakes.passed} ❌ ${results.nodeStakes.failed} ⚠️ ${results.nodeStakes.warnings} 🔌 ${results.nodeStakes.rpcErrors}`);
    console.log(`   2. Delegator Stakes (All Blocks): ✅ ${results.delegatorStakes.passed} ❌ ${results.delegatorStakes.failed} ⚠️ ${results.delegatorStakes.warnings} 🔌 ${results.delegatorStakes.rpcErrors}`);
    console.log(`   3. Delegator Sum: ✅ ${results.delegatorSum.passed} ❌ ${results.delegatorSum.failed} ⚠️ ${results.delegatorSum.warnings} 🔌 ${results.delegatorSum.rpcErrors}`);
    console.log(`   4. Knowledge Collections: ✅ ${results.knowledgeCollections.passed} ❌ ${results.knowledgeCollections.failed} ⚠️ ${results.knowledgeCollections.warnings} 🔌 ${results.knowledgeCollections.rpcErrors}`);
    console.log(`   5. Missing Events Detection: ✅ ${results.missingEvents.passed} ❌ ${results.missingEvents.failed} ⚠️ ${results.missingEvents.warnings} 🔌 ${results.missingEvents.rpcErrors}`);
  }
  
  // Calculate totals
  const totals = {
    nodeStakes: { passed: 0, failed: 0, warnings: 0, rpcErrors: 0 },
    delegatorStakes: { passed: 0, failed: 0, warnings: 0, rpcErrors: 0 },
    delegatorSum: { passed: 0, failed: 0, warnings: 0, rpcErrors: 0 },
    knowledgeCollections: { passed: 0, failed: 0, warnings: 0, rpcErrors: 0 },
    missingEvents: { passed: 0, failed: 0, warnings: 0, rpcErrors: 0 }
  };
  
  for (const network of networks) {
    const results = allResults[network];
    totals.nodeStakes.passed += results.nodeStakes.passed;
    totals.nodeStakes.failed += results.nodeStakes.failed;
    totals.nodeStakes.warnings += results.nodeStakes.warnings;
    totals.nodeStakes.rpcErrors += results.nodeStakes.rpcErrors;
    
    totals.delegatorStakes.passed += results.delegatorStakes.passed;
    totals.delegatorStakes.failed += results.delegatorStakes.failed;
    totals.delegatorStakes.warnings += results.delegatorStakes.warnings;
    totals.delegatorStakes.rpcErrors += results.delegatorStakes.rpcErrors;
    
    totals.delegatorSum.passed += results.delegatorSum.passed;
    totals.delegatorSum.failed += results.delegatorSum.failed;
    totals.delegatorSum.warnings += results.delegatorSum.warnings;
    totals.delegatorSum.rpcErrors += results.delegatorSum.rpcErrors;
    
    totals.knowledgeCollections.passed += results.knowledgeCollections.passed;
    totals.knowledgeCollections.failed += results.knowledgeCollections.failed;
    totals.knowledgeCollections.warnings += results.knowledgeCollections.warnings;
    totals.knowledgeCollections.rpcErrors += results.knowledgeCollections.rpcErrors;
    
    totals.missingEvents.passed += results.missingEvents.passed;
    totals.missingEvents.failed += results.missingEvents.failed;
    totals.missingEvents.warnings += results.missingEvents.warnings;
    totals.missingEvents.rpcErrors += results.missingEvents.rpcErrors;
  }
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 GRAND TOTALS ACROSS ALL NETWORKS:`);
  console.log(`${'='.repeat(80)}`);
  console.log(`   1. Node Stakes: ✅ ${totals.nodeStakes.passed} ❌ ${totals.nodeStakes.failed} ⚠️ ${totals.nodeStakes.warnings} 🔌 ${totals.nodeStakes.rpcErrors}`);
  console.log(`   2. Delegator Stakes (All Blocks): ✅ ${totals.delegatorStakes.passed} ❌ ${totals.delegatorStakes.failed} ⚠️ ${totals.delegatorStakes.warnings} 🔌 ${totals.delegatorStakes.rpcErrors}`);
  console.log(`   3. Delegator Sum: ✅ ${totals.delegatorSum.passed} ❌ ${totals.delegatorSum.failed} ⚠️ ${totals.delegatorSum.warnings} 🔌 ${totals.delegatorSum.rpcErrors}`);
  console.log(`   4. Knowledge Collections: ✅ ${totals.knowledgeCollections.passed} ❌ ${totals.knowledgeCollections.failed} ⚠️ ${totals.knowledgeCollections.warnings} 🔌 ${totals.knowledgeCollections.rpcErrors}`);
  console.log(`   5. Missing Events Detection: ✅ ${totals.missingEvents.passed} ❌ ${totals.missingEvents.failed} ⚠️ ${totals.missingEvents.warnings} 🔌 ${totals.missingEvents.rpcErrors}`);
  
  console.log(`\n🎯 All validations completed for all networks!`);
}

testAllValidations().catch(console.error);

// Add process-level error handlers for graceful error management
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  console.error('Stack trace:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});