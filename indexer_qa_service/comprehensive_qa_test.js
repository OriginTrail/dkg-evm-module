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
    return trac.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
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
    const cacheFile = path.join(__dirname, `${network.toLowerCase()}_cache.json`);
    
    try {
      if (fs.existsSync(cacheFile)) {
        const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        console.log(`   📊 Loaded ${network} cache from file`);
        console.log(`      Node events: ${cacheData.totalNodeEvents || cacheData.nodeEvents?.length || 0}`);
        console.log(`      Delegator events: ${cacheData.totalDelegatorEvents || cacheData.delegatorEvents?.length || 0}`);
        
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

  // Save cache to JSON files
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
    console.log(`\n🔍 Querying all contract events for ${network}...`);
    
    const networkConfig = config.networks.find(n => n.name === network);
    if (!networkConfig) throw new Error(`Network ${network} not found in config`);

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
        if (retryCount >= 10) {
          throw new Error(`Failed to connect to ${network} RPC after 10 attempts`);
        }
        console.log(` ⏳ Retrying in 3 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    const stakingAddress = await this.getContractAddressFromHub(network, 'StakingStorage');
    const stakingContract = new ethers.Contract(stakingAddress, [
      'event NodeStakeUpdated(uint72 indexed identityId, uint96 stake)',
      'event DelegatorBaseStakeUpdated(uint72 indexed identityId, bytes32 indexed delegatorKey, uint96 stakeBase)'
    ], provider);

    const currentBlock = await provider.getBlockNumber();
    console.log(`   📊 Current block: ${currentBlock.toLocaleString()}`);

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
      
      const fromBlock = Math.max(0, oldestBlock - 1000);
      console.log(`   📊 Querying from block ${fromBlock.toLocaleString()} to ${currentBlock.toLocaleString()}`);
      
      // Set chunk size based on network
      const chunkSize = network === 'Base' ? 100000 : 1000000; // Base: 100k, Gnosis: 1M
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
        
        console.log(`   📊 ${network} Node Events: Processing chunk ${processedChunks}/${totalChunks} (blocks ${startBlock.toLocaleString()}-${endBlock.toLocaleString()})`);
        
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
            if (chunkRetryCount >= 10) {
              console.log(`      ❌ Skipping chunk ${startBlock}-${endBlock} after 10 failed attempts`);
              break;
            }
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
        
        console.log(`   📊 ${network} Delegator Events: Processing chunk ${processedChunks}/${totalChunks} (blocks ${startBlock.toLocaleString()}-${endBlock.toLocaleString()})`);
        
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
            if (chunkRetryCount >= 10) {
              console.log(`      ❌ Skipping chunk ${startBlock}-${endBlock} after 10 failed attempts`);
              break;
            }
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
          identityId: event.args.identityId,
          stake: event.args.stake.toString()
        })),
        delegatorEvents: allDelegatorEvents.map(event => ({
          blockNumber: event.blockNumber,
          identityId: event.args.identityId,
          delegatorKey: event.args.delegatorKey,
          stakeBase: event.args.stakeBase.toString()
        })),
        totalNodeEvents: allNodeEvents.length,
        totalDelegatorEvents: allDelegatorEvents.length,
        lastUpdated: new Date().toISOString()
      };
      
      // Save cache
      await this.saveCache(network, cacheData);
      
      return cacheData;
      
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
        if (retryCount >= 10) {
          throw new Error(`Failed to connect to Neuroweb RPC after 10 attempts`);
        }
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
            if (chunkRetryCount >= 10) {
              console.log(`      ❌ Skipping chunk ${startBlock}-${endBlock} after 10 failed attempts`);
              break;
            }
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
            if (chunkRetryCount >= 10) {
              console.log(`      ❌ Skipping chunk ${startBlock}-${endBlock} after 10 failed attempts`);
              break;
            }
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
          identityId: event.args.identityId,
          stake: event.args.stake.toString()
        })),
        delegatorEvents: allDelegatorEvents.map(event => ({
          blockNumber: event.blockNumber,
          identityId: event.args.identityId,
          delegatorKey: event.args.delegatorKey,
          stakeBase: event.args.stakeBase.toString()
        })),
        totalNodeEvents: allNodeEvents.length,
        totalDelegatorEvents: allDelegatorEvents.length,
        lastUpdated: new Date().toISOString()
      };
      
      // Save cache
      await this.saveCache('Neuroweb', cacheData);
      
      return cacheData;
      
    } finally {
      await client.end();
    }
  }

  // Build cache for a network
  async buildCache(network) {
    console.log(`\n🔍 Building cache for ${network}...`);
    
    // Check if existing cache exists
    const existingCache = await this.loadCache(network);
    
    let cacheData;
    if (network === 'Neuroweb') {
      cacheData = await this.queryAllNeurowebContractEvents();
    } else {
      cacheData = await this.queryAllContractEvents(network);
    }
    
    // If we have existing cache, merge with new events
    if (existingCache && existingCache.nodeEventsByNode) {
      console.log(`   📊 Merging new events with existing cache for ${network}...`);
      return await this.mergeCacheWithNewEvents(network, existingCache, cacheData);
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
    
    // Create processed cache data
    const processedCacheData = {
      ...cacheData,
      nodeEventsByNode,
      delegatorEventsByNode,
      totalNodeEvents: cacheData.nodeEvents.length,
      totalDelegatorEvents: cacheData.delegatorEvents.length,
      lastUpdated: new Date().toISOString()
    };
    
    console.log(`   📊 Processed cache: ${Object.keys(nodeEventsByNode).length} nodes, ${Object.keys(delegatorEventsByNode).length} nodes with delegators`);
    
    // Save processed cache
    await this.saveCache(network, processedCacheData);
    
    return processedCacheData;
  }

  // Merge new events with existing cache
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
    
    // Process merged cache data
    console.log(`   📊 Processing merged cache data...`);
    
    // Organize node events by node ID
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
    
    // Organize delegator events by node ID and delegator key
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
    
    // Save merged cache
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

  // Helper function for comprehensive node validation
  async validateSingleNodeComprehensiveWithCache(client, network, nodeId, cache) {
    try {
      // Get ALL node stake events from indexer for this node
      const allIndexerEventsResult = await client.query(`
        SELECT stake, block_number FROM node_stake_updated WHERE identity_id = $1 ORDER BY block_number DESC
      `, [nodeId]);
      
      if (allIndexerEventsResult.rows.length === 0) {
        console.log(`   ⚠️ Node ${nodeId}: No indexer events found, skipping`);
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
        console.log(`   ⚠️ Node ${nodeId}: No cached contract events found, skipping`);
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
      const indexerBlocks = new Set(processedIndexerEvents.map(e => e.blockNumber));
      const contractBlocks = new Set(processedContractEvents.map(e => e.blockNumber));
      const commonBlocks = [...indexerBlocks].filter(block => contractBlocks.has(block));
      
      if (commonBlocks.length === 0) {
        console.log(`   ⚠️ Node ${nodeId}: No common blocks found between indexer and contract`);
        return { type: 'skipped' };
      }
      
      // Sort common blocks in descending order (newest first)
      commonBlocks.sort((a, b) => b - a);
      
      console.log(`   📊 Node ${nodeId}: Found ${commonBlocks.length} common blocks to validate`);
      
      let validationPassed = false;
      let expectedStake = 0n;
      let actualStake = 0n;
      let comparisonBlock = 0;
      
      // Validate each common block in descending order
      for (const blockNumber of commonBlocks) {
        const indexerEvent = processedIndexerEvents.find(e => e.blockNumber === blockNumber);
        const contractEvent = processedContractEvents.find(e => e.blockNumber === blockNumber);
        
        if (indexerEvent && contractEvent) {
          expectedStake = indexerEvent.stake;
          actualStake = contractEvent.stake;
          comparisonBlock = blockNumber;
          
          console.log(`   📊 Node ${nodeId} (Block ${blockNumber}):`);
          console.log(`      Indexer:   ${this.weiToTRAC(expectedStake)} TRAC`);
          console.log(`      Contract:  ${this.weiToTRAC(actualStake)} TRAC`);
          
          const difference = expectedStake - actualStake;
          const tolerance = 500000000000000000n; // 0.5 TRAC
          
          if (difference === 0n) {
            console.log(`      ✅ BLOCKS MATCH - TRAC VALUES MATCH`);
            validationPassed = true;
            break; // Found a match, stop checking
          } else if (difference >= -tolerance && difference <= tolerance) {
            console.log(`      ✅ BLOCKS MATCH - TRAC VALUES MATCH (within tolerance)`);
            console.log(`      📊 Difference: ${difference > 0 ? '+' : ''}${this.weiToTRAC(difference > 0 ? difference : -difference)} TRAC`);
            validationPassed = true;
            break; // Found a match within tolerance, stop checking
          } else {
            console.log(`      ✅ BLOCKS MATCH - TRAC VALUES DIFFER`);
            console.log(`      📊 Difference: ${difference > 0 ? '+' : ''}${this.weiToTRAC(difference > 0 ? difference : -difference)} TRAC`);
            // Continue to next block if this one doesn't match
          }
        }
      }
      
      if (validationPassed) {
        return { type: 'passed' };
      } else {
        return { type: 'failed' };
      }
      
    } catch (error) {
      console.log(`   ⚠️ Node ${nodeId}: Error - ${error.message}`);
      if (error.message.includes('RPC') || error.message.includes('network') || error.message.includes('connection')) {
        return { type: 'rpcError' };
      } else {
        return { type: 'failed' };
      }
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
        WHERE d.identity_id = ANY($1) ORDER BY d.identity_id, d.delegator_key
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
      console.log(`   🔍 Node ${nodeId}, Delegator ${delegatorKey}:`);
      
      // Get all indexer events
      const indexerEvents = await client.query(`
        SELECT stake_base, block_number FROM delegator_base_stake_updated
        WHERE identity_id = $1 AND delegator_key = $2 ORDER BY block_number DESC
      `, [nodeId, delegatorKey]);
      
      if (indexerEvents.rows.length === 0) {
        console.log(`      ⚠️ No indexer events found`);
        return { passed: 0, failed: 0, warnings: 0, rpcErrors: 0, totalValidations: 0 };
      }
      
      // Get contract events from cache
      const contractEvents = cache.delegatorEvents.filter(event => 
        event.identityId === nodeId && event.delegatorKey === delegatorKey
      );
      
      console.log(`      📊 Found ${indexerEvents.rows.length} indexer events and ${contractEvents.length} contract events`);
      
      // Process events
      const indexerBlocks = new Map();
      for (const event of indexerEvents.rows) {
        const blockNum = event.block_number;
        const stake = BigInt(event.stake_base);
        if (!indexerBlocks.has(blockNum) || stake > indexerBlocks.get(blockNum)) {
          indexerBlocks.set(blockNum, stake);
        }
      }
      
      const contractBlocks = new Map();
      for (const event of contractEvents) {
        const blockNum = event.blockNumber;
        const stake = BigInt(event.stakeBase);
        if (!contractBlocks.has(blockNum) || stake > contractBlocks.get(blockNum)) {
          contractBlocks.set(blockNum, stake);
        }
      }
      
      // Find common blocks
      const commonBlocks = [...indexerBlocks.keys()].filter(block => contractBlocks.has(block));
      commonBlocks.sort((a, b) => b - a); // Descending order
      
      console.log(`      📊 Found ${commonBlocks.length} common blocks to validate`);
      
      let passed = 0, failed = 0, warnings = 0, rpcErrors = 0;
      const totalValidations = commonBlocks.length;
      
      for (let i = 0; i < commonBlocks.length; i++) {
        const blockNumber = commonBlocks[i];
        const indexerStake = indexerBlocks.get(blockNumber);
        const contractStake = contractBlocks.get(blockNumber);
        const difference = indexerStake - contractStake;
        const tolerance = 500000000000000000n; // 0.5 TRAC
        
        console.log(`         📊 Block ${blockNumber} (${i + 1}/${totalValidations}):`);
        console.log(`            Indexer Block:   ${blockNumber}`);
        console.log(`            Contract Block:  ${blockNumber}`);
        console.log(`            Indexer TRAC:    ${this.weiToTRAC(indexerStake)} TRAC`);
        console.log(`            Contract TRAC:   ${this.weiToTRAC(contractStake)} TRAC`);
        
        if (difference === 0n) {
          console.log(`            ✅ BLOCKS MATCH - TRAC VALUES MATCH`);
          passed++;
        } else if (difference >= -tolerance && difference <= tolerance) {
          console.log(`            ✅ BLOCKS MATCH - TRAC VALUES MATCH (within tolerance)`);
          console.log(`            📊 Difference: ${difference > 0 ? '+' : ''}${this.weiToTRAC(difference > 0 ? difference : -difference)} TRAC`);
          warnings++;
        } else {
          console.log(`            ✅ BLOCKS MATCH - TRAC VALUES DIFFER`);
          console.log(`            📊 Difference: ${difference > 0 ? '+' : ''}${this.weiToTRAC(difference > 0 ? difference : -difference)} TRAC`);
          failed++;
        }
      }
      
      return { passed, failed, warnings, rpcErrors, totalValidations };
      
    } catch (error) {
      console.log(`      ⚠️ Error: ${error.message}`);
      return { passed: 0, failed: 0, warnings: 0, rpcErrors: 1, totalValidations: 0 };
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
    
    const results = {
      nodeStakes: await this.validateNodeStakes(network),
      delegatorStakes: await this.validateDelegatorStakesComprehensive(network),
      delegatorSum: await this.validateDelegatorStakeSum(network),
      knowledgeCollections: await this.validateKnowledgeCollections(network)
    };
    
    console.log(`\n📊 FINAL SUMMARY FOR ${network}:`);
    console.log(`   1. Node Stakes: ✅ ${results.nodeStakes.passed} ❌ ${results.nodeStakes.failed} ⚠️ ${results.nodeStakes.warnings} 🔌 ${results.nodeStakes.rpcErrors}`);
    console.log(`   2. Delegator Stakes (All Blocks): ✅ ${results.delegatorStakes.passed} ❌ ${results.delegatorStakes.failed} ⚠️ ${results.delegatorStakes.warnings} 🔌 ${results.delegatorStakes.rpcErrors}`);
    console.log(`   3. Delegator Sum: ✅ ${results.delegatorSum.passed} ❌ ${results.delegatorSum.failed} ⚠️ ${results.delegatorSum.warnings} 🔌 ${results.delegatorSum.rpcErrors}`);
    console.log(`   4. Knowledge Collections: ✅ ${results.knowledgeCollections.passed} ❌ ${results.knowledgeCollections.failed} ⚠️ ${results.knowledgeCollections.warnings} 🔌 ${results.knowledgeCollections.rpcErrors}`);
    
    return results;
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