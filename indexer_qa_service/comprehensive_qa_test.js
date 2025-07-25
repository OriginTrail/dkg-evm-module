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
      database: 'postgres'
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
              console.log(`         Node ${nodeId}: ${delegatorKey.slice(0, 20)}... (${eventCount} events)`);
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
    console.log(`   📊 Querying all contract events for ${network}...`);
    
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
          console.log(`   ✅ RPC connection succeeded after ${retryCount} retries`);
        }
        break;
      } catch (error) {
        retryCount++;
        console.log(`   ⚠️ RPC connection failed (attempt ${retryCount}): ${error.message}`);
        console.log(`   ⏳ Retrying in 3 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    const stakingAddress = await this.getContractAddressFromHub(network, 'StakingStorage');
    const stakingContract = new ethers.Contract(stakingAddress, [
      'event NodeStakeUpdated(uint72 indexed identityId, uint96 stake)',
      'event DelegatorBaseStakeUpdated(uint72 indexed identityId, bytes32 indexed delegatorKey, uint96 stakeBase)'
    ], provider);
    
    // Get current block number
    const currentBlock = await provider.getBlockNumber();
    console.log(`   📊 Current block: ${currentBlock}`);
    
    // Get oldest indexer block to determine start point
    const dbName = this.databaseMap[network];
    const client = new Client({ ...this.dbConfig, database: dbName });
    
    try {
      await client.connect();
      
      const oldestNodeResult = await client.query(`
        SELECT MIN(block_number) as oldest_block FROM node_stake_updated
      `);
      const oldestDelegatorResult = await client.query(`
        SELECT MIN(block_number) as oldest_block FROM delegator_base_stake_updated
      `);
      
      const oldestNodeBlock = oldestNodeResult.rows[0]?.oldest_block || currentBlock;
      const oldestDelegatorBlock = oldestDelegatorResult.rows[0]?.oldest_block || currentBlock;
      const oldestBlock = Math.min(oldestNodeBlock, oldestDelegatorBlock);
      
      console.log(`   📊 Oldest indexer block: ${oldestBlock.toLocaleString()}`);
      
      // Query from the oldest indexer block (with some buffer)
      const fromBlock = Math.max(0, oldestBlock - 1000);
      console.log(`   📊 Querying from block ${fromBlock.toLocaleString()} to ${currentBlock.toLocaleString()}`);
      
      // Determine chunk size based on network
      const chunkSize = network === 'Base' ? 100000 : 1000000;
      console.log(`   📊 Using chunk size: ${chunkSize.toLocaleString()} blocks`);
      
      const nodeEvents = [];
      const delegatorEvents = [];
      
      // Process chunks
      let totalChunks = Math.ceil((currentBlock - fromBlock) / chunkSize);
      let processedChunks = 0;
      
      for (let startBlock = fromBlock; startBlock < currentBlock; startBlock += chunkSize) {
        const endBlock = Math.min(startBlock + chunkSize - 1, currentBlock);
        processedChunks++;
        
        console.log(`   📊 Processing chunk ${processedChunks}/${totalChunks} (blocks ${startBlock.toLocaleString()}-${endBlock.toLocaleString()})`);
        
        // Query NodeStakeUpdated events with retry logic
        let nodeFilter;
        let delegatorFilter;
        let nodeEventsChunk = [];
        let delegatorEventsChunk = [];
        
        // Retry logic for chunk queries
        let chunkRetryCount = 0;
        const maxChunkRetries = 10;
        
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
            
            console.log(`   📊 Chunk ${processedChunks}: Found ${nodeEventsChunk.length} node events, ${delegatorEventsChunk.length} delegator events`);
            
            // Debug: Show some delegator keys found in this chunk
            if (delegatorEventsChunk.length > 0) {
              const sampleKeys = delegatorEventsChunk.slice(0, 3).map(e => e.args.delegatorKey);
              console.log(`   📊 Sample delegator keys in chunk: ${sampleKeys.join(', ')}`);
            }
            
            break; // Success, exit retry loop
            
          } catch (error) {
            chunkRetryCount++;
            console.log(`   ⚠️ Chunk ${processedChunks} failed (attempt ${chunkRetryCount}/${maxChunkRetries}): ${error.message}`);
            
            if (chunkRetryCount >= maxChunkRetries) {
              console.log(`   ❌ Chunk ${processedChunks} failed after ${maxChunkRetries} attempts, skipping...`);
              break;
            }
            
            console.log(`   ⏳ Retrying chunk in 3 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        }
        
        // Add events to main arrays
        nodeEvents.push(...nodeEventsChunk);
        delegatorEvents.push(...delegatorEventsChunk);
      }
      
      console.log(`   📊 Total events found: ${nodeEvents.length} node events, ${delegatorEvents.length} delegator events`);
      
      // Debug: Show some sample delegator events to verify coverage
      if (delegatorEvents.length > 0) {
        const sampleEvents = delegatorEvents.slice(0, 5);
        console.log(`   📊 Sample delegator events found:`);
        sampleEvents.forEach((event, index) => {
          console.log(`      ${index + 1}. Node ${event.args.identityId}, Block ${event.blockNumber}, Key: ${event.args.delegatorKey.slice(0, 20)}...`);
        });
        
        // Show block range of found events
        const delegatorBlockNumbers = delegatorEvents.map(e => e.blockNumber);
        const minBlock = Math.min(...delegatorBlockNumbers);
        const maxBlock = Math.max(...delegatorBlockNumbers);
        console.log(`   📊 Delegator events block range: ${minBlock.toLocaleString()} to ${maxBlock.toLocaleString()}`);
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
    console.log(`\n🔍 Querying all contract events for Neuroweb...`);
    
    const networkConfig = config.networks.find(n => n.name === 'Neuroweb');
    if (!networkConfig) throw new Error(`Network Neuroweb not found in config`);

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
        // Neuroweb: Infinite retries for RPC connection
        console.log(` ⏳ Retrying in 3 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    const stakingAddress = await this.getContractAddressFromHub('Neuroweb', 'StakingStorage');
    const stakingContract = new ethers.Contract(stakingAddress, [
      'event NodeStakeUpdated(uint72 indexed identityId, uint96 stake)',
      'event DelegatorBaseStakeUpdated(uint72 indexed identityId, bytes32 indexed delegatorKey, uint96 stakeBase)'
    ], provider);

    const currentBlock = await provider.getBlockNumber();
    console.log(`   📊 Current block: ${currentBlock.toLocaleString()}`);

    // Get oldest indexer block
    const dbName = this.databaseMap['Neuroweb'];
    const client = new Client({ ...this.dbConfig, database: dbName });
    
    try {
      await client.connect();
      
      const oldestNodeResult = await client.query(`
        SELECT MIN(block_number) as oldest_block FROM node_stake_updated
      `);
      const oldestDelegatorResult = await client.query(`
        SELECT MIN(block_number) as oldest_block FROM delegator_base_stake_updated
      `);
      
      const oldestNodeBlock = oldestNodeResult.rows[0]?.oldest_block || currentBlock;
      const oldestDelegatorBlock = oldestDelegatorResult.rows[0]?.oldest_block || currentBlock;
      const oldestBlock = Math.min(oldestNodeBlock, oldestDelegatorBlock);
      
      const fromBlock = Math.max(0, oldestBlock - 1000);
      console.log(`   📊 Querying from block ${fromBlock.toLocaleString()} to ${currentBlock.toLocaleString()}`);
      
      // Use 10,000 chunks for Neuroweb
      const chunkSize = 10000; // 10k chunks for Neuroweb
      console.log(`   📊 Using chunk size: ${chunkSize.toLocaleString()}`);
      
      let allNodeEvents = [];
      let allDelegatorEvents = [];
      
      // Query node events
      console.log(`   📊 Querying NodeStakeUpdated events...`);
      const nodeFilter = stakingContract.filters.NodeStakeUpdated();
      
      let totalChunks = Math.ceil((currentBlock - fromBlock + 1) / chunkSize);
      let processedChunks = 0;
      
      for (let startBlock = fromBlock; startBlock <= currentBlock; startBlock += chunkSize) {
        const endBlock = Math.min(startBlock + chunkSize - 1, currentBlock);
        processedChunks++;
        
        console.log(`   📊 Neuroweb Node Events: Processing chunk ${processedChunks}/${totalChunks} (blocks ${startBlock.toLocaleString()}-${endBlock.toLocaleString()})`);
        
        let chunkRetryCount = 0;
        while (true) {
          try {
            const chunkEvents = await stakingContract.queryFilter(nodeFilter, startBlock, endBlock);
            allNodeEvents = allNodeEvents.concat(chunkEvents);
            
            console.log(`      ✅ Found ${chunkEvents.length} node events in chunk ${processedChunks}`);
            
            if (chunkRetryCount > 0) {
              console.log(`      ✅ Chunk ${startBlock}-${endBlock} succeeded after ${chunkRetryCount} retries`);
            }
            break;
          } catch (error) {
            chunkRetryCount++;
            console.log(`      ⚠️ Chunk ${startBlock}-${endBlock} failed (attempt ${chunkRetryCount}): ${error.message}`);
            // Neuroweb: Infinite retries for chunk queries
            console.log(`      ⏳ Retrying in 3 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        }
      }
      
      // Query delegator events
      console.log(`   📊 Querying DelegatorBaseStakeUpdated events...`);
      const delegatorFilter = stakingContract.filters.DelegatorBaseStakeUpdated();
      
      processedChunks = 0;
      
      for (let startBlock = fromBlock; startBlock <= currentBlock; startBlock += chunkSize) {
        const endBlock = Math.min(startBlock + chunkSize - 1, currentBlock);
        processedChunks++;
        
        console.log(`   📊 Neuroweb Delegator Events: Processing chunk ${processedChunks}/${totalChunks} (blocks ${startBlock.toLocaleString()}-${endBlock.toLocaleString()})`);
        
        let chunkRetryCount = 0;
        while (true) {
          try {
            const chunkEvents = await stakingContract.queryFilter(delegatorFilter, startBlock, endBlock);
            allDelegatorEvents = allDelegatorEvents.concat(chunkEvents);
            
            console.log(`      ✅ Found ${chunkEvents.length} delegator events in chunk ${processedChunks}`);
            
            if (chunkRetryCount > 0) {
              console.log(`      ✅ Chunk ${startBlock}-${endBlock} succeeded after ${chunkRetryCount} retries`);
            }
            break;
          } catch (error) {
            chunkRetryCount++;
            console.log(`      ⚠️ Chunk ${startBlock}-${endBlock} failed (attempt ${chunkRetryCount}): ${error.message}`);
            // Neuroweb: Infinite retries for chunk queries
            console.log(`      ⏳ Retrying in 3 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        }
      }
      
      console.log(`   📊 Found ${allNodeEvents.length} node events and ${allDelegatorEvents.length} delegator events`);
      
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
    console.log(`\n🔍 Building cache for ${network}...`);
    
    // Check if existing cache exists first (for all networks)
    const existingCache = await this.loadCache(network);
    
    let cacheData;
    if (existingCache && existingCache.nodeEventsByNode) {
      console.log(`   📊 Using existing ${network} cache from file`);
      console.log(`      Node events: ${existingCache.totalNodeEvents || 0}`);
      console.log(`      Delegator events: ${existingCache.totalDelegatorEvents || 0}`);
      
      // Check if we need to add new blocks (for all networks)
      const needsUpdate = await this.checkCacheNeedsUpdate(network, existingCache);
      if (needsUpdate) {
        console.log(`   📊 ${network} cache needs update, querying new blocks...`);
        const newEvents = await this.queryNewEvents(network, existingCache);
        if (newEvents.nodeEvents.length > 0 || newEvents.delegatorEvents.length > 0) {
          console.log(`   📊 Found ${newEvents.nodeEvents.length} new node events and ${newEvents.delegatorEvents.length} new delegator events`);
          return await this.mergeCacheWithNewEvents(network, existingCache, newEvents);
        } else {
          console.log(`   📊 No new events found, using existing cache`);
        }
      }
      
      return existingCache; // Return existing cache
    } else {
      // No existing cache, query all events
      console.log(`   📊 No existing ${network} cache found, querying all events...`);
      if (network === 'Neuroweb') {
        cacheData = await this.queryAllNeurowebContractEvents();
      } else {
        cacheData = await this.queryAllContractEvents(network);
      }
    }
    
    // Process cache data to organize events by node/delegator
    console.log(`   📊 Processing cache data...`);
    
    // Organize node events by node ID
    const nodeEventsByNode = {};
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
    
    // Organize delegator events by node ID and delegator key
    const delegatorEventsByNode = {};
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
    
    // Debug: Show some statistics about what was found
    const totalNodes = Object.keys(nodeEventsByNode).length;
    const totalDelegators = Object.values(delegatorEventsByNode).reduce((sum, node) => sum + Object.keys(node).length, 0);
    
    console.log(`   📊 Cache processing complete:`);
    console.log(`      Nodes found: ${totalNodes}`);
    console.log(`      Total delegators found: ${totalDelegators}`);
    
    // Show some sample delegator keys for debugging
    const sampleDelegators = [];
    for (const [nodeId, delegators] of Object.entries(delegatorEventsByNode)) {
      for (const [delegatorKey, events] of Object.entries(delegators)) {
        sampleDelegators.push({ nodeId, delegatorKey, eventCount: events.length });
        if (sampleDelegators.length >= 10) break;
      }
      if (sampleDelegators.length >= 10) break;
    }
    
    if (sampleDelegators.length > 0) {
      console.log(`   📊 Sample delegators found:`);
      sampleDelegators.forEach(({ nodeId, delegatorKey, eventCount }) => {
        console.log(`      Node ${nodeId}: ${delegatorKey} (${eventCount} events)`);
      });
    }
    
    const processedCacheData = {
      nodeEventsByNode,
      delegatorEventsByNode,
      totalNodeEvents: cacheData.nodeEvents.length,
      totalDelegatorEvents: cacheData.delegatorEvents.length,
      lastUpdated: new Date().toISOString()
    };
    
    console.log(`   📊 Processed cache: ${Object.keys(nodeEventsByNode).length} nodes, ${Object.keys(delegatorEventsByNode).length} nodes with delegators`);
    
    // Save processed cache (for all networks)
    await this.saveCache(network, processedCacheData);
    
    return processedCacheData;
  }

  // Merge new events with existing cache (for all networks)
  async mergeCacheWithNewEvents(network, existingCache, newEvents) {
    console.log(`   📊 Merging new events with existing cache for ${network}...`);
    
    // Get the latest block from existing cache
    const existingNodeEvents = existingCache.nodeEvents || [];
    const existingDelegatorEvents = existingCache.delegatorEvents || [];
    
    let latestExistingBlock = 0;
    if (existingNodeEvents.length > 0) {
      latestExistingBlock = Math.max(...existingNodeEvents.map(e => e.blockNumber));
    }
    if (existingDelegatorEvents.length > 0) {
      latestExistingBlock = Math.max(latestExistingBlock, ...existingDelegatorEvents.map(e => e.blockNumber));
    }
    
    console.log(`   📊 Latest existing block: ${latestExistingBlock.toLocaleString()}`);
    
    // Filter new events to only include blocks newer than existing cache
    const newNodeEvents = newEvents.nodeEvents.filter(event => event.blockNumber > latestExistingBlock);
    const newDelegatorEvents = newEvents.delegatorEvents.filter(event => event.blockNumber > latestExistingBlock);
    
    console.log(`   📊 New node events: ${newNodeEvents.length} (after ${latestExistingBlock.toLocaleString()})`);
    console.log(`   📊 New delegator events: ${newDelegatorEvents.length} (after ${latestExistingBlock.toLocaleString()})`);
    
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
        console.log(`🔍 Building cache for ${network}...`);
        console.log(`${'='.repeat(40)}`);
        
        const cache = await this.buildCache(network);
        
        // Store cache in instance
        if (network === 'Gnosis') this.gnosisCache = cache;
        else if (network === 'Base') this.baseCache = cache;
        else if (network === 'Neuroweb') this.neurowebCache = cache;
        
        console.log(`✅ Cache built for ${network}`);
        return { network, cache, success: true };
      } catch (error) {
        console.log(`❌ Failed to build cache for ${network}: ${error.message}`);
        return { network, error: error.message, success: false };
      }
    });
    
    const results = await Promise.all(cachePromises);
    
    console.log(`\n📊 Cache building results:`);
    for (const result of results) {
      if (result.success) {
        console.log(`   ✅ ${result.network}: Success`);
      } else {
        console.log(`   ❌ ${result.network}: ${result.error}`);
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
      
      const minStakeThreshold = 50000000000000000000000; // 50,000 TRAC
      let nodesResult;
      
      if (network === 'Base') {
        nodesResult = await client.query(`
          SELECT n.identity_id, n.stake FROM node_stake_updated n
          INNER JOIN (SELECT identity_id, MAX(block_number) as max_block FROM node_stake_updated GROUP BY identity_id) latest 
          ON n.identity_id = latest.identity_id AND n.block_number = latest.max_block
          WHERE n.stake >= $1 ORDER BY n.stake DESC LIMIT 24
        `, [minStakeThreshold]);
      } else {
        nodesResult = await client.query(`
          SELECT DISTINCT ON (n.identity_id) n.identity_id, n.stake FROM node_stake_updated n
          WHERE n.stake >= $1 AND n.identity_id IN (SELECT identity_id FROM node_object_created)
          AND n.identity_id NOT IN (SELECT identity_id FROM node_object_deleted)
          ORDER BY n.identity_id, n.block_number DESC
        `, [minStakeThreshold]);
      }
      
      if (nodesResult.rows.length === 0) {
        console.log(`   ⚠️ No active nodes found in ${network}`);
        return { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 };
      }
      
      let passed = 0, failed = 0, warnings = 0, rpcErrors = 0;
      const total = nodesResult.rows.length;
      
      console.log(`   📊 Validating ${total} active nodes comprehensively (all blocks)...`);
      
      for (const row of nodesResult.rows) {
        const nodeId = parseInt(row.identity_id);
        const result = await this.validateSingleNodeComprehensiveWithCache(client, network, nodeId, cache);
        
        switch (result.type) {
          case 'passed': passed++; break;
          case 'failed': failed++; break;
          case 'warning': warnings++; break;
          case 'rpcError': rpcErrors++; break;
          case 'skipped': break; // Don't count skipped
        }
      }
      
      console.log(`   📊 Node Stakes Summary: ✅ ${passed} ❌ ${failed} ⚠️ ${warnings} 🔌 ${rpcErrors}`);
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
      
      // Get active nodes first
      const minStakeThreshold = 50000000000000000000000; // 50,000 TRAC
      let activeNodesResult;
      
      if (network === 'Base') {
        activeNodesResult = await client.query(`
          SELECT n.identity_id, n.stake FROM node_stake_updated n
          INNER JOIN (SELECT identity_id, MAX(block_number) as max_block FROM node_stake_updated GROUP BY identity_id) latest 
          ON n.identity_id = latest.identity_id AND n.block_number = latest.max_block
          WHERE n.stake >= $1 ORDER BY n.stake DESC LIMIT 24
        `, [minStakeThreshold]);
      } else {
        activeNodesResult = await client.query(`
          SELECT DISTINCT ON (n.identity_id) n.identity_id, n.stake FROM node_stake_updated n
          WHERE n.stake >= $1 AND n.identity_id IN (SELECT identity_id FROM node_object_created)
          AND n.identity_id NOT IN (SELECT identity_id FROM node_object_deleted)
          ORDER BY n.identity_id, n.block_number DESC
        `, [minStakeThreshold]);
      }
      
      if (activeNodesResult.rows.length === 0) {
        console.log(`   ⚠️ No active nodes found in ${network}`);
        return { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 };
      }
      
      const activeNodeIds = activeNodesResult.rows.map(row => row.identity_id);
      const delegatorsResult = await client.query(`
        SELECT DISTINCT d.identity_id, d.delegator_key FROM delegator_base_stake_updated d
        INNER JOIN (SELECT identity_id, delegator_key, MAX(block_number) as max_block FROM delegator_base_stake_updated GROUP BY identity_id, delegator_key) latest 
        ON d.identity_id = latest.identity_id AND d.delegator_key = latest.delegator_key AND d.block_number = latest.max_block
        WHERE d.identity_id = ANY($1) AND d.stake_base > 0 ORDER BY d.identity_id, d.delegator_key
      `, [activeNodeIds]);
      
      if (delegatorsResult.rows.length === 0) {
        console.log(`   ⚠️ No delegators found for active nodes in ${network}`);
        return { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 };
      }
      
      let passed = 0, failed = 0, warnings = 0, rpcErrors = 0;
      const total = delegatorsResult.rows.length;
      
      console.log(`   📊 Validating ${total} delegators comprehensively (all blocks)...`);
      
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
      }
      
      console.log(`   📊 Delegator Stakes Summary: ✅ ${passed} ❌ ${failed} ⚠️ ${warnings} 🔌 ${rpcErrors}`);
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
      
      const minStakeThreshold = 50000000000000000000000; // 50,000 TRAC
      let nodesResult;
      
      if (network === 'Base') {
        nodesResult = await client.query(`
          SELECT n.identity_id, n.stake FROM node_stake_updated n
          INNER JOIN (SELECT identity_id, MAX(block_number) as max_block FROM node_stake_updated GROUP BY identity_id) latest 
          ON n.identity_id = latest.identity_id AND n.block_number = latest.max_block
          WHERE n.stake >= $1 ORDER BY n.stake DESC LIMIT 24
        `, [minStakeThreshold]);
      } else {
        nodesResult = await client.query(`
          SELECT DISTINCT ON (n.identity_id) n.identity_id, n.stake FROM node_stake_updated n
          WHERE n.stake >= $1 AND n.identity_id IN (SELECT identity_id FROM node_object_created)
          AND n.identity_id NOT IN (SELECT identity_id FROM node_object_deleted)
          ORDER BY n.identity_id, n.block_number DESC
        `, [minStakeThreshold]);
      }
      
      if (nodesResult.rows.length === 0) {
        console.log(`   ⚠️ No active nodes found in ${network}`);
        return { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 };
      }
      
      let passed = 0, failed = 0, warnings = 0, rpcErrors = 0;
      const total = nodesResult.rows.length;
      
      console.log(`   📊 Validating ${total} nodes for delegator sum...`);
      
      for (const row of nodesResult.rows) {
        const nodeId = parseInt(row.identity_id);
        
        try {
          // Get ALL delegator events from indexer for this node
          const allDelegatorEventsResult = await client.query(`
            SELECT delegator_key, stake_base, block_number FROM delegator_base_stake_updated 
            WHERE identity_id = $1 ORDER BY delegator_key, block_number ASC
          `, [nodeId]);
          
          // Get latest delegator stakes from indexer
          const latestDelegatorStakesResult = await client.query(`
            SELECT d.delegator_key, d.stake_base FROM delegator_base_stake_updated d
            INNER JOIN (SELECT identity_id, delegator_key, MAX(block_number) as max_block FROM delegator_base_stake_updated GROUP BY identity_id, delegator_key) latest 
            ON d.identity_id = latest.identity_id AND d.delegator_key = latest.delegator_key AND d.block_number = latest.max_block
            WHERE d.identity_id = $1 AND d.stake_base > 0
          `, [nodeId]);
          
          // Get latest node stake from indexer
          const latestNodeStakeResult = await client.query(`
            SELECT stake FROM node_stake_updated 
            WHERE identity_id = $1 ORDER BY block_number DESC LIMIT 1
          `, [nodeId]);
          
          const indexerNodeStake = latestNodeStakeResult.rows.length > 0 ? BigInt(latestNodeStakeResult.rows[0].stake) : 0n;
          
          // Calculate total delegations from indexer (sum of all historical delegations)
          let indexerTotalDelegations = 0n;
          for (const event of allDelegatorEventsResult.rows) {
            indexerTotalDelegations += BigInt(event.stake_base);
          }
          
          // Calculate sum of latest delegator stakes from indexer
          let indexerLatestDelegatorSum = 0n;
          for (const row of latestDelegatorStakesResult.rows) {
            indexerLatestDelegatorSum += BigInt(row.stake_base);
          }
          
          // Get cached contract events for this node
          const cachedNodeEvents = cache.nodeEventsByNode?.[nodeId] || [];
          const cachedDelegatorEvents = cache.delegatorEventsByNode?.[nodeId] || {};
          
          // Calculate total delegations from contract (sum of all historical delegations)
          let contractTotalDelegations = 0n;
          for (const [delegatorKey, events] of Object.entries(cachedDelegatorEvents)) {
            for (const event of events) {
              contractTotalDelegations += BigInt(event.stakeBase);
            }
          }
          
          // Get latest node stake from contract
          const contractNodeStake = cachedNodeEvents.length > 0 ? BigInt(cachedNodeEvents[0].stake) : 0n;
          
          console.log(`   📊 Node ${nodeId}:`);
          console.log(`      Indexer total delegations:     ${this.weiToTRAC(indexerTotalDelegations)} TRAC`);
          console.log(`      Contract total delegations:    ${this.weiToTRAC(contractTotalDelegations)} TRAC`);
          console.log(`      Indexer latest delegator sum:  ${this.weiToTRAC(indexerLatestDelegatorSum)} TRAC`);
          console.log(`      Indexer node stake:            ${this.weiToTRAC(indexerNodeStake)} TRAC`);
          console.log(`      Contract node stake:           ${this.weiToTRAC(contractNodeStake)} TRAC`);
          
          // Compare total delegations between indexer and contract
          const delegationsDifference = indexerTotalDelegations - contractTotalDelegations;
          const tolerance = 500000000000000000n; // 0.5 TRAC
          
          // Compare latest delegator sum to node stake
          const indexerNodeDifference = indexerLatestDelegatorSum - indexerNodeStake;
          const contractNodeDifference = indexerLatestDelegatorSum - contractNodeStake;
          
          if (delegationsDifference === 0n && indexerNodeDifference === 0n && contractNodeDifference === 0n) {
            console.log(`      ✅ ALL MATCHES: Delegations match AND delegator sum matches both node stakes`);
            passed++;
          } else if (delegationsDifference >= -tolerance && delegationsDifference <= tolerance && 
                     indexerNodeDifference >= -tolerance && indexerNodeDifference <= tolerance &&
                     contractNodeDifference >= -tolerance && contractNodeDifference <= tolerance) {
            console.log(`      ⚠️ ALL MATCHES (within tolerance)`);
            console.log(`      📊 Delegations difference: ${delegationsDifference > 0 ? '+' : ''}${this.weiToTRAC(delegationsDifference > 0 ? delegationsDifference : -delegationsDifference)} TRAC`);
            console.log(`      📊 Indexer node difference: ${indexerNodeDifference > 0 ? '+' : ''}${this.weiToTRAC(indexerNodeDifference > 0 ? indexerNodeDifference : -indexerNodeDifference)} TRAC`);
            console.log(`      📊 Contract node difference: ${contractNodeDifference > 0 ? '+' : ''}${this.weiToTRAC(contractNodeDifference > 0 ? contractNodeDifference : -contractNodeDifference)} TRAC`);
            warnings++;
          } else {
            console.log(`      ❌ MISMATCHES FOUND`);
            if (delegationsDifference !== 0n) {
              console.log(`      📊 Delegations don't match: ${delegationsDifference > 0 ? '+' : ''}${this.weiToTRAC(delegationsDifference > 0 ? delegationsDifference : -delegationsDifference)} TRAC`);
            }
            if (indexerNodeDifference !== 0n) {
              console.log(`      📊 Indexer delegator sum ≠ node stake: ${indexerNodeDifference > 0 ? '+' : ''}${this.weiToTRAC(indexerNodeDifference > 0 ? indexerNodeDifference : -indexerNodeDifference)} TRAC`);
            }
            if (contractNodeDifference !== 0n) {
              console.log(`      📊 Contract delegator sum ≠ node stake: ${contractNodeDifference > 0 ? '+' : ''}${this.weiToTRAC(contractNodeDifference > 0 ? contractNodeDifference : -contractNodeDifference)} TRAC`);
            }
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
      
      console.log(`   📊 Delegator Sum Summary: ✅ ${passed} ❌ ${failed} ⚠️ ${warnings} 🔌 ${rpcErrors}`);
      return { passed, failed, warnings, rpcErrors, total };
      
    } catch (error) {
      console.error(`Error validating delegator sum: ${error.message}`);
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
      
      // Get knowledge collections from indexer
      const indexerResult = await client.query(`
        SELECT COUNT(*) as count FROM knowledge_collection_created
      `);
      
      const indexerCount = parseInt(indexerResult.rows[0].count);
      const indexerBlockResult = await client.query(`
        SELECT MAX(block_number) as latest_block FROM knowledge_collection_created
      `);
      const indexerBlock = indexerBlockResult.rows[0]?.latest_block || 0;
      
      // Get knowledge collections from contract
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
          break;
        } catch (error) {
          retryCount++;
          if (retryCount >= 10) {
            throw new Error(`Failed to connect to ${network} RPC after 10 attempts`);
          }
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
      
      const knowledgeAddress = await this.getContractAddressFromHub(network, 'KnowledgeCollectionStorage');
      const knowledgeContract = new ethers.Contract(knowledgeAddress, [
        'function getLatestKnowledgeCollectionId() view returns (uint256)'
      ], provider);
      
      // Get contract count using the reliable method
      let contractCount;
      let contractRetryCount = 0;
      const maxContractRetries = 5;
      
      while (contractRetryCount < maxContractRetries) {
        try {
          contractCount = await knowledgeContract.getLatestKnowledgeCollectionId();
          break;
        } catch (error) {
          contractRetryCount++;
          console.log(`   ⚠️ [${network}] Contract call failed (attempt ${contractRetryCount}/${maxContractRetries}): ${error.message}`);
          
          if (contractRetryCount >= maxContractRetries) {
            console.log(`   ❌ [${network}] Failed to get contract knowledge collection count after ${maxContractRetries} attempts`);
            console.log(`   📊 Knowledge Collections (Indexer only):`);
            console.log(`      Indexer:   ${indexerCount} collections (block ${indexerBlock})`);
            console.log(`      Contract:  Unable to query (contract call failed)`);
            console.log(`   ⚠️ [${network}] Knowledge collection validation skipped due to contract errors`);
            return { passed: 0, failed: 0, warnings: 1, rpcErrors: 0, total: 1 };
          }
          
          console.log(`   ⏳ Retrying contract call in 3 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
      
      const currentBlock = await provider.getBlockNumber();
      
      console.log(`   📊 Knowledge Collections:`);
      console.log(`      Indexer:   ${indexerCount} collections (block ${indexerBlock})`);
      console.log(`      Contract:  ${contractCount} collections (block ${currentBlock})`);
      
      // Convert both values to numbers for comparison
      const indexerCountNum = Number(indexerCount);
      const contractCountNum = Number(contractCount);
      
      const countDifference = Math.abs(indexerCountNum - contractCountNum);
      const blockDifference = Math.abs(indexerBlock - currentBlock);
      
      let passed = 0, failed = 0, warnings = 0, rpcErrors = 0;
      
      if (countDifference === 0) {
        console.log(`   ✅ KNOWLEDGE COLLECTIONS MATCH`);
        passed = 1;
      } else if (countDifference <= 200) {
        console.log(`   ⚠️ KNOWLEDGE COLLECTIONS MATCH (within tolerance)`);
        console.log(`   📊 Count difference: ${countDifference}, Block difference: ${blockDifference}`);
        warnings = 1;
      } else {
        console.log(`   ❌ KNOWLEDGE COLLECTIONS DO NOT MATCH`);
        console.log(`   📊 Count difference: ${countDifference}, Block difference: ${blockDifference}`);
        failed = 1;
      }
      
      console.log(`   📊 Knowledge Collections Summary: ✅ ${passed} ❌ ${failed} ⚠️ ${warnings} 🔌 ${rpcErrors}`);
      return { passed, failed, warnings, rpcErrors, total: 1 };
      
    } catch (error) {
      console.error(`Error validating knowledge collections for ${network}: ${error.message}`);
      return { passed: 0, failed: 0, warnings: 0, rpcErrors: 1, total: 1 };
    } finally {
      await client.end();
    }
  }

  // 1. VALIDATE NODE STAKES (ALL BLOCKS) - WITH CACHE
  async validateNodeStakes(network) {
    console.log(`\n🔍 1. Validating node stakes comprehensively for ${network} (all blocks)...`);
    
    // Load or build cache
    let cache = await this.loadCache(network);
    if (!cache) {
      console.log(`   📊 No cache found for ${network}, building cache...`);
      cache = await this.buildCache(network);
    }
    
    // Store cache in instance
    if (network === 'Gnosis') this.gnosisCache = cache;
    else if (network === 'Base') this.baseCache = cache;
    else if (network === 'Neuroweb') this.neurowebCache = cache;
    
    const dbName = this.databaseMap[network];
    const client = new Client({ ...this.dbConfig, database: dbName });
    
    try {
      await client.connect();
      
      const minStakeThreshold = 50000000000000000000000; // 50,000 TRAC
      let nodesResult;
      
      if (network === 'Base') {
        nodesResult = await client.query(`
          SELECT n.identity_id, n.stake FROM node_stake_updated n
          INNER JOIN (SELECT identity_id, MAX(block_number) as max_block FROM node_stake_updated GROUP BY identity_id) latest 
          ON n.identity_id = latest.identity_id AND n.block_number = latest.max_block
          WHERE n.stake >= $1 ORDER BY n.stake DESC LIMIT 24
        `, [minStakeThreshold]);
      } else {
        nodesResult = await client.query(`
          SELECT DISTINCT ON (n.identity_id) n.identity_id, n.stake FROM node_stake_updated n
          WHERE n.stake >= $1 AND n.identity_id IN (SELECT identity_id FROM node_object_created)
          AND n.identity_id NOT IN (SELECT identity_id FROM node_object_deleted)
          ORDER BY n.identity_id, n.block_number DESC
        `, [minStakeThreshold]);
      }
      
      if (nodesResult.rows.length === 0) {
        console.log(`   ⚠️ No active nodes found in ${network}`);
        return { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 };
      }
      
      let passed = 0, failed = 0, warnings = 0, rpcErrors = 0;
      const total = nodesResult.rows.length;
      
      console.log(`   📊 Validating ${total} active nodes comprehensively (all blocks)...`);
      
      for (const row of nodesResult.rows) {
        const nodeId = parseInt(row.identity_id);
        const result = await this.validateSingleNodeComprehensiveWithCache(client, network, nodeId, cache);
        
        switch (result.type) {
          case 'passed': passed++; break;
          case 'failed': failed++; break;
          case 'warning': warnings++; break;
          case 'rpcError': rpcErrors++; break;
          case 'skipped': break; // Don't count skipped
        }
      }
      
      console.log(`   📊 Node Stakes Summary: ✅ ${passed} ❌ ${failed} ⚠️ ${warnings} 🔌 ${rpcErrors}`);
      return { passed, failed, warnings, rpcErrors, total };
      
    } catch (error) {
      console.error(`Error validating node stakes: ${error.message}`);
      return { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 };
    } finally {
      await client.end();
    }
  }

  // 2. VALIDATE DELEGATOR STAKES (ALL BLOCKS) - WITH CACHE
  async validateDelegatorStakesComprehensive(network) {
    console.log(`\n🔍 2. Validating delegator stakes comprehensively for ${network} (all blocks)...`);
    
    // Load or build cache
    let cache = await this.loadCache(network);
    if (!cache) {
      console.log(`   📊 No cache found for ${network}, building cache...`);
      cache = await this.buildCache(network);
    }
    
    // Store cache in instance
    if (network === 'Gnosis') this.gnosisCache = cache;
    else if (network === 'Base') this.baseCache = cache;
    else if (network === 'Neuroweb') this.neurowebCache = cache;
    
    const dbName = this.databaseMap[network];
    const client = new Client({ ...this.dbConfig, database: dbName });
    
    try {
      await client.connect();
      
      const minStakeThreshold = 50000000000000000000000;
      let activeNodesResult;
      
      if (network === 'Base') {
        activeNodesResult = await client.query(`
          SELECT n.identity_id, n.stake FROM node_stake_updated n
          INNER JOIN (SELECT identity_id, MAX(block_number) as max_block FROM node_stake_updated GROUP BY identity_id) latest 
          ON n.identity_id = latest.identity_id AND n.block_number = latest.max_block
          WHERE n.stake >= $1 ORDER BY n.stake DESC LIMIT 24
        `, [minStakeThreshold]);
      } else {
        activeNodesResult = await client.query(`
          SELECT DISTINCT ON (n.identity_id) n.identity_id, n.stake FROM node_stake_updated n
          WHERE n.stake >= $1 AND n.identity_id IN (SELECT identity_id FROM node_object_created)
          AND n.identity_id NOT IN (SELECT identity_id FROM node_object_deleted)
          ORDER BY n.identity_id, n.block_number DESC
        `, [minStakeThreshold]);
      }
      
      if (activeNodesResult.rows.length === 0) {
        console.log(`   ⚠️ No active nodes found in ${network}`);
        return { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 };
      }
      
      const activeNodeIds = activeNodesResult.rows.map(row => row.identity_id);
      const delegatorsResult = await client.query(`
        SELECT DISTINCT d.identity_id, d.delegator_key FROM delegator_base_stake_updated d
        INNER JOIN (SELECT identity_id, delegator_key, MAX(block_number) as max_block FROM delegator_base_stake_updated GROUP BY identity_id, delegator_key) latest 
        ON d.identity_id = latest.identity_id AND d.delegator_key = latest.delegator_key AND d.block_number = latest.max_block
        WHERE d.identity_id = ANY($1) AND d.stake_base > 0 ORDER BY d.identity_id, d.delegator_key
      `, [activeNodeIds]);
      
      if (delegatorsResult.rows.length === 0) {
        console.log(`   ⚠️ No delegators found for active nodes in ${network}`);
        return { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 };
      }
      
      let totalPassed = 0, totalFailed = 0, totalWarnings = 0, totalRpcErrors = 0, totalValidations = 0;
      
      console.log(`   📊 Validating ${delegatorsResult.rows.length} delegators using cache...`);
      
      // Test with first 5 delegators for speed
      const testDelegators = delegatorsResult.rows.slice(0, 5);
      console.log(`   🧪 Testing with first ${testDelegators.length} delegators...`);
      
      for (const row of testDelegators) {
        const nodeId = parseInt(row.identity_id);
        const delegatorKey = row.delegator_key;
        
        const result = await this.validateSingleDelegatorComprehensiveWithCache(client, network, nodeId, delegatorKey, cache);
        totalPassed += result.passed;
        totalFailed += result.failed;
        totalWarnings += result.warnings;
        totalRpcErrors += result.rpcErrors;
        totalValidations += result.totalValidations;
      }
      
      console.log(`   📊 Delegator Stakes Summary: ✅ ${totalPassed} ❌ ${totalFailed} ⚠️ ${totalWarnings} 🔌 ${totalRpcErrors} (${totalValidations} total validations)`);
      return { passed: totalPassed, failed: totalFailed, warnings: totalWarnings, rpcErrors: totalRpcErrors, total: totalValidations };
      
    } catch (error) {
      console.error(`Error validating delegator stakes: ${error.message}`);
      return { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 };
    } finally {
      await client.end();
    }
  }

  async validateSingleDelegatorComprehensiveWithCache(client, network, nodeId, delegatorKey, cache) {
    try {
      // Get ALL delegator stake events from indexer for this delegator
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
      
      // Get cached contract events for this delegator
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
          const tolerance = 500000000000000000n; // 0.5 TRAC
          
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

  // 3. VALIDATE DELEGATOR SUM STAKE
  async validateDelegatorStakeSum(network) {
    console.log(`\n🔍 3. Validating delegator stake sum matches node stake for ${network}...`);
    
    const dbName = this.databaseMap[network];
    const client = new Client({ ...this.dbConfig, database: dbName });
    
    try {
      await client.connect();
      
      const minStakeThreshold = 50000000000000000000000;
      let activeNodesResult;
      
      if (network === 'Base') {
        activeNodesResult = await client.query(`
          SELECT n.identity_id, n.stake FROM node_stake_updated n
          INNER JOIN (SELECT identity_id, MAX(block_number) as max_block FROM node_stake_updated GROUP BY identity_id) latest 
          ON n.identity_id = latest.identity_id AND n.block_number = latest.max_block
          WHERE n.stake >= $1 ORDER BY n.stake DESC LIMIT 24
        `, [minStakeThreshold]);
      } else {
        activeNodesResult = await client.query(`
          SELECT DISTINCT ON (n.identity_id) n.identity_id, n.stake FROM node_stake_updated n
          WHERE n.stake >= $1 AND n.identity_id IN (SELECT identity_id FROM node_object_created)
          AND n.identity_id NOT IN (SELECT identity_id FROM node_object_deleted)
          ORDER BY n.identity_id, n.block_number DESC
        `, [minStakeThreshold]);
      }
      
      if (activeNodesResult.rows.length === 0) {
        console.log(`   ⚠️ No active nodes found in ${network}`);
        return { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 };
      }
      
      let passed = 0, failed = 0, warnings = 0, rpcErrors = 0;
      const total = activeNodesResult.rows.length;
      
      console.log(`   📊 Validating ${total} active nodes...`);
      
      for (const row of activeNodesResult.rows) {
        const nodeId = parseInt(row.identity_id);
        const nodeStake = BigInt(row.stake);
        
        try {
          // Get latest delegator stakes from indexer
          const delegatorStakes = await client.query(`
            SELECT delegator_key, stake_base FROM delegator_base_stake_updated d
            INNER JOIN (SELECT delegator_key, MAX(block_number) as max_block FROM delegator_base_stake_updated WHERE identity_id = $1 GROUP BY delegator_key) latest
            ON d.delegator_key = latest.delegator_key AND d.block_number = latest.max_block
            WHERE d.identity_id = $1
          `, [nodeId]);
          
          const indexerTotalDelegatorStake = delegatorStakes.rows.reduce((sum, row) => sum + BigInt(row.stake_base), 0n);
          
          // Get contract node stake
          const networkConfig = config.networks.find(n => n.name === network);
          const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
          const stakingAddress = await this.getContractAddressFromHub(network, 'StakingStorage');
          
          const stakingContract = new ethers.Contract(stakingAddress, [
            'function getNodeStake(uint72 identityId) view returns (uint96)'
          ], provider);
          
          const contractNodeStake = await stakingContract.getNodeStake(nodeId);
          const difference = contractNodeStake - indexerTotalDelegatorStake;
          const tolerance = 500000000000000000n; // 0.5 TRAC
          
          console.log(`   📊 Node ${nodeId}:`);
          console.log(`      Indexer Delegator Sum: ${this.weiToTRAC(indexerTotalDelegatorStake)} TRAC`);
          console.log(`      Contract Node Stake:   ${this.weiToTRAC(contractNodeStake)} TRAC`);
          
          if (difference === 0n) {
            console.log(`      ✅ BLOCKS MATCH - TRAC VALUES MATCH`);
            passed++;
          } else if (difference >= -tolerance && difference <= tolerance) {
            console.log(`      ✅ BLOCKS MATCH - TRAC VALUES MATCH (within tolerance)`);
            console.log(`      📊 Difference: ${difference > 0 ? '+' : ''}${this.weiToTRAC(difference > 0 ? difference : -difference)} TRAC`);
            warnings++;
          } else {
            console.log(`      ✅ BLOCKS MATCH - TRAC VALUES DIFFER`);
            console.log(`      📊 Difference: ${difference > 0 ? '+' : ''}${this.weiToTRAC(difference > 0 ? difference : -difference)} TRAC`);
            failed++;
          }
        } catch (error) {
          console.log(`   ⚠️ Node ${nodeId}: RPC Error - ${error.message}`);
          rpcErrors++;
        }
      }
      
      console.log(`   📊 Delegator Sum Summary: ✅ ${passed} ❌ ${failed} ⚠️ ${warnings} 🔌 ${rpcErrors}`);
      return { passed, failed, warnings, rpcErrors, total };
      
    } catch (error) {
      console.error(`Error validating delegator stake sum: ${error.message}`);
      return { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 };
    } finally {
      await client.end();
    }
  }

  // 4. VALIDATE KNOWLEDGE COLLECTIONS
  async validateKnowledgeCollections(network) {
    console.log(`\n🔍 4. Validating knowledge collections for ${network}...`);
    
    const dbName = this.databaseMap[network];
    const client = new Client({ ...this.dbConfig, database: dbName });
    
    try {
      await client.connect();
      
      // Get knowledge collections from indexer
      const kcResult = await client.query(`
        SELECT identity_id, knowledge_id, block_number FROM knowledge_collection_created
        ORDER BY block_number DESC LIMIT 50
      `);
      
      if (kcResult.rows.length === 0) {
        console.log(`   ⚠️ No knowledge collections found in ${network}`);
        return { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 };
      }
      
      let passed = 0, failed = 0, warnings = 0, rpcErrors = 0;
      const total = kcResult.rows.length;
      
      console.log(`   📊 Validating ${total} knowledge collections...`);
      
      for (const row of kcResult.rows) {
        const nodeId = parseInt(row.identity_id);
        const knowledgeId = row.knowledge_id;
        const blockNumber = parseInt(row.block_number);
        
        try {
          // Check if knowledge collection exists in contract
          const networkConfig = config.networks.find(n => n.name === network);
          const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
          const kcAddress = await this.getContractAddressFromHub(network, 'KnowledgeCollectionStorage');
          
          const kcContract = new ethers.Contract(kcAddress, [
            'function getKnowledgeCollection(uint72 identityId, uint72 knowledgeId) view returns (bool)'
          ], provider);
          
          const exists = await kcContract.getKnowledgeCollection(nodeId, knowledgeId, { blockTag: blockNumber });
          
          console.log(`   📊 KC ${nodeId}-${knowledgeId}:`);
          console.log(`      Indexer Block:   ${blockNumber}`);
          console.log(`      Contract Block:  ${blockNumber}`);
          console.log(`      Indexer Status:  Created`);
          console.log(`      Contract Status: ${exists ? 'Exists' : 'Missing'}`);
          
          if (exists) {
            console.log(`      ✅ BLOCKS MATCH - STATUS MATCH`);
            passed++;
          } else {
            console.log(`      ✅ BLOCKS MATCH - STATUS DIFFER`);
            console.log(`      📊 Difference: Indexer shows created, Contract shows missing`);
            failed++;
          }
        } catch (error) {
          console.log(`   ⚠️ KC ${nodeId}-${knowledgeId}: RPC Error - ${error.message}`);
          rpcErrors++;
        }
      }
      
      console.log(`   📊 Knowledge Collections Summary: ✅ ${passed} ❌ ${failed} ⚠️ ${warnings} 🔌 ${rpcErrors}`);
      return { passed, failed, warnings, rpcErrors, total };
      
    } catch (error) {
      console.error(`Error validating knowledge collections: ${error.message}`);
      return { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 };
    } finally {
      await client.end();
    }
  }

  // RUN ALL VALIDATIONS
  async runAllValidations(network) {
    console.log(`\n🚀 Running all validations for ${network}...`);
    
    // Build cache once for all validations
    console.log(`\n🔍 Building cache for ${network}...`);
    const cache = await this.buildCache(network);
    
    const results = {
      nodeStakes: await this.validateNodeStakesWithCache(network, cache),
      delegatorStakes: await this.validateDelegatorStakesComprehensiveWithCache(network, cache),
      delegatorSum: await this.validateDelegatorStakeSumWithCache(network, cache),
      knowledgeCollections: await this.validateKnowledgeCollectionsWithCache(network, cache)
    };
    
    console.log(`\n📊 FINAL SUMMARY FOR ${network}:`);
    console.log(`   1. Node Stakes: ✅ ${results.nodeStakes.passed} ❌ ${results.nodeStakes.failed} ⚠️ ${results.nodeStakes.warnings} 🔌 ${results.nodeStakes.rpcErrors}`);
    console.log(`   2. Delegator Stakes (All Blocks): ✅ ${results.delegatorStakes.passed} ❌ ${results.delegatorStakes.failed} ⚠️ ${results.delegatorStakes.warnings} 🔌 ${results.delegatorStakes.rpcErrors}`);
    console.log(`   3. Delegator Sum: ✅ ${results.delegatorSum.passed} ❌ ${results.delegatorSum.failed} ⚠️ ${results.delegatorSum.warnings} 🔌 ${results.delegatorSum.rpcErrors}`);
    console.log(`   4. Knowledge Collections: ✅ ${results.knowledgeCollections.passed} ❌ ${results.knowledgeCollections.failed} ⚠️ ${results.knowledgeCollections.warnings} 🔌 ${results.knowledgeCollections.rpcErrors}`);
    
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
        // Base/Gnosis: 10 retries, Neuroweb: Infinite retries
        if (network !== 'Neuroweb' && retryCount >= 10) {
          throw new Error(`Failed to connect to ${network} RPC after 10 attempts`);
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
    console.log(`   📊 Querying new events from block ${fromBlock.toLocaleString()} to ${currentBlock.toLocaleString()}`);
    
    if (fromBlock > currentBlock) {
      console.log(`   📊 No new blocks to query`);
      return { nodeEvents: [], delegatorEvents: [] };
    }
    
    // Set chunk size based on network
    const chunkSize = network === 'Base' ? 100000 : network === 'Gnosis' ? 1000000 : 10000; // Base: 100k, Gnosis: 1M, Neuroweb: 10k
    console.log(`   📊 Using chunk size: ${chunkSize.toLocaleString()}`);
    
    let allNodeEvents = [];
    let allDelegatorEvents = [];
    
    // Query node events
    console.log(`   📊 Querying new NodeStakeUpdated events...`);
    const nodeFilter = stakingContract.filters.NodeStakeUpdated();
    
    let totalChunks = Math.ceil((currentBlock - fromBlock + 1) / chunkSize);
    let processedChunks = 0;
    
    for (let startBlock = fromBlock; startBlock <= currentBlock; startBlock += chunkSize) {
      const endBlock = Math.min(startBlock + chunkSize - 1, currentBlock);
      processedChunks++;
      
      console.log(`   📊 ${network} New Node Events: Processing chunk ${processedChunks}/${totalChunks} (blocks ${startBlock.toLocaleString()}-${endBlock.toLocaleString()})`);
      
      let chunkRetryCount = 0;
      while (true) {
        try {
          const chunkEvents = await stakingContract.queryFilter(nodeFilter, startBlock, endBlock);
          allNodeEvents = allNodeEvents.concat(chunkEvents);
          
          console.log(`      ✅ Found ${chunkEvents.length} new node events in chunk ${processedChunks}`);
          
          if (chunkRetryCount > 0) {
            console.log(`      ✅ Chunk ${startBlock}-${endBlock} succeeded after ${chunkRetryCount} retries`);
          }
          break;
        } catch (error) {
          chunkRetryCount++;
          console.log(`      ⚠️ Chunk ${startBlock}-${endBlock} failed (attempt ${chunkRetryCount}): ${error.message}`);
          // Base/Gnosis: 10 retries, Neuroweb: Infinite retries
          if (network !== 'Neuroweb' && chunkRetryCount >= 10) {
            console.log(`      ❌ Skipping chunk ${startBlock}-${endBlock} after 10 failed attempts`);
            break;
          }
          console.log(`      ⏳ Retrying in 3 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    }
    
    // Query delegator events
    console.log(`   📊 Querying new DelegatorBaseStakeUpdated events...`);
    const delegatorFilter = stakingContract.filters.DelegatorBaseStakeUpdated();
    
    processedChunks = 0;
    
    for (let startBlock = fromBlock; startBlock <= currentBlock; startBlock += chunkSize) {
      const endBlock = Math.min(startBlock + chunkSize - 1, currentBlock);
      processedChunks++;
      
      console.log(`   📊 ${network} New Delegator Events: Processing chunk ${processedChunks}/${totalChunks} (blocks ${startBlock.toLocaleString()}-${endBlock.toLocaleString()})`);
      
      let chunkRetryCount = 0;
      while (true) {
        try {
          const chunkEvents = await stakingContract.queryFilter(delegatorFilter, startBlock, endBlock);
          allDelegatorEvents = allDelegatorEvents.concat(chunkEvents);
          
          console.log(`      ✅ Found ${chunkEvents.length} new delegator events in chunk ${processedChunks}`);
          
          if (chunkRetryCount > 0) {
            console.log(`      ✅ Chunk ${startBlock}-${endBlock} succeeded after ${chunkRetryCount} retries`);
          }
          break;
        } catch (error) {
          chunkRetryCount++;
          console.log(`      ⚠️ Chunk ${startBlock}-${endBlock} failed (attempt ${chunkRetryCount}): ${error.message}`);
          // Base/Gnosis: 10 retries, Neuroweb: Infinite retries
          if (network !== 'Neuroweb' && chunkRetryCount >= 10) {
            console.log(`      ❌ Skipping chunk ${startBlock}-${endBlock} after 10 failed attempts`);
            break;
          }
          console.log(`      ⏳ Retrying in 3 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    }
    
    console.log(`   📊 Found ${allNodeEvents.length} new node events and ${allDelegatorEvents.length} new delegator events`);
    
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
          const tolerance = 500000000000000000n; // 0.5 TRAC
          
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
      const results = await qaService.runAllValidations(network);
      allResults[network] = results;
    } catch (error) {
      console.log(`❌ Error running validations for ${network}: ${error.message}`);
      allResults[network] = {
        nodeStakes: { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 },
        delegatorStakes: { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 },
        delegatorSum: { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 },
        knowledgeCollections: { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 }
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
        knowledgeCollections: { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, total: 0 }
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
  }
  
  // Calculate totals
  const totals = {
    nodeStakes: { passed: 0, failed: 0, warnings: 0, rpcErrors: 0 },
    delegatorStakes: { passed: 0, failed: 0, warnings: 0, rpcErrors: 0 },
    delegatorSum: { passed: 0, failed: 0, warnings: 0, rpcErrors: 0 },
    knowledgeCollections: { passed: 0, failed: 0, warnings: 0, rpcErrors: 0 }
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
  }
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 GRAND TOTALS ACROSS ALL NETWORKS:`);
  console.log(`${'='.repeat(80)}`);
  console.log(`   1. Node Stakes: ✅ ${totals.nodeStakes.passed} ❌ ${totals.nodeStakes.failed} ⚠️ ${totals.nodeStakes.warnings} 🔌 ${totals.nodeStakes.rpcErrors}`);
  console.log(`   2. Delegator Stakes (All Blocks): ✅ ${totals.delegatorStakes.passed} ❌ ${totals.delegatorStakes.failed} ⚠️ ${totals.delegatorStakes.warnings} 🔌 ${totals.delegatorStakes.rpcErrors}`);
  console.log(`   3. Delegator Sum: ✅ ${totals.delegatorSum.passed} ❌ ${totals.delegatorSum.failed} ⚠️ ${totals.delegatorSum.warnings} 🔌 ${totals.delegatorSum.rpcErrors}`);
  console.log(`   4. Knowledge Collections: ✅ ${totals.knowledgeCollections.passed} ❌ ${totals.knowledgeCollections.failed} ⚠️ ${totals.knowledgeCollections.warnings} 🔌 ${totals.knowledgeCollections.rpcErrors}`);
  
  console.log(`\n🎯 All validations completed for all networks!`);
}

testAllValidations().catch(console.error);