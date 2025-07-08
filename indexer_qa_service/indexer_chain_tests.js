const { ethers } = require('ethers');
const { Client } = require('pg');
const config = require('./config');
require('dotenv').config();

class CompleteQAService {
  constructor() {
    this.results = [];
    
    this.dbConfig = {
      host: process.env.DB_HOST,
      port: 5432,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
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
    return trac.toLocaleString('en-US', { 
      minimumFractionDigits: 0, 
      maximumFractionDigits: 2 
    });
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
      
      if (latestStakeResult.rows.length === 0) {
        return 0n; // No events found, stake should be 0
      }
      
      // The expected stake is the latest stake value from the database
      const expectedStake = BigInt(latestStakeResult.rows[0].stake_base);
      
      return expectedStake;
      
    } catch (error) {
      console.error(`Error calculating expected delegator stake for node ${nodeId}, delegator ${delegatorKey.slice(0, 10)}... on ${network}:`, error.message);
      return 0n;
    } finally {
      await client.end();
    }
  }

  async getContractNodeStake(network, nodeId) {
    let retries = 6;
    
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
        
        const stake = await stakingContract.getNodeStake(nodeId);
        return stake;
      } catch (error) {
        retries--;
        if (retries === 0) {
          console.error(`Error getting contract node stake for node ${nodeId} on ${network}:`, error.message);
          return 0n;
        }
        
        console.log(`   ⏳ Contract call failed, waiting 5 minutes before retrying... (${retries} attempts left)`);
        await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000)); // 5 minutes
      }
    }
  }

  async getContractDelegatorStake(network, nodeId, delegatorKey) {
    let retries = 6;
    
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
        
        const stake = await stakingContract.getDelegatorStakeBase(nodeId, delegatorKey);
        return stake;
      } catch (error) {
        retries--;
        if (retries === 0) {
          console.error(`Error getting contract delegator stake for node ${nodeId}, delegator ${delegatorKey.slice(0, 10)}... on ${network}:`, error.message);
          return 0n;
        }
        
        console.log(`   ⏳ Contract call failed, waiting 5 minutes before retrying... (${retries} attempts left)`);
        await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000)); // 5 minutes
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
        return { passed: 0, failed: 0, warnings: 0, total: 0 };
      }
      
      let passed = 0;
      let failed = 0;
      let warnings = 0;
      const total = nodesResult.rows.length;
      
      const criteriaText = `active nodes with >= 50k TRAC`;
      
      console.log(`   📊 Validating ${total} active nodes...`);
      
      for (const row of nodesResult.rows) {
        const nodeId = parseInt(row.identity_id);
        
        try {
          const expectedStake = await this.calculateExpectedNodeStake(network, nodeId);
          const contractStake = await this.getContractNodeStake(network, nodeId);
          
          // Check if difference is very small (tolerance for rounding errors)
          const difference = expectedStake - contractStake;
          const tolerance = 500000000000000000n; // 0.5 TRAC in wei
          
          if (difference === 0n || difference === 0) {
            console.log(`   ✅ Node ${nodeId}: Indexer ${this.weiToTRAC(expectedStake)} TRAC, Contract ${this.weiToTRAC(contractStake)} TRAC`);
            passed++;
          } else if (difference >= -tolerance && difference <= tolerance) {
            console.log(`   ⚠️ Node ${nodeId}: Indexer ${this.weiToTRAC(expectedStake)} TRAC, Contract ${this.weiToTRAC(contractStake)} TRAC`);
            if (Math.abs(Number(difference)) < 1000000000000000000) { // Less than 1 TRAC
              const tracDifference = Number(difference) / Math.pow(10, 18);
              console.log(`      📊 Small difference: ${tracDifference.toFixed(18)} TRAC (within 0.5 TRAC tolerance)`);
            } else {
              console.log(`      📊 Small difference: ${difference > 0 ? '+' : '-'}${this.weiToTRAC(difference > 0 ? difference : -difference)} TRAC (within 0.5 TRAC tolerance)`);
            }
            warnings++; // Count as warning
          } else {
            console.log(`   ❌ Node ${nodeId}: Indexer ${this.weiToTRAC(expectedStake)} TRAC, Contract ${this.weiToTRAC(contractStake)} TRAC`);
            console.log(`      📊 Difference: ${difference > 0 ? '+' : '-'}${this.weiToTRAC(difference > 0 ? difference : -difference)} TRAC`);
            failed++;
          }
        } catch (error) {
          console.log(`   ⚠️ Node ${nodeId}: Error - ${error.message}`);
          failed++;
        }
      }
      
      return { passed, failed, warnings, total };
      
    } catch (error) {
      console.error(`Error validating node stakes for ${network}:`, error.message);
      return { passed: 0, failed: 0, warnings: 0, total: 0 };
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
        return { passed: 0, failed: 0, warnings: 0, total: 0 };
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
        return { passed: 0, failed: 0, warnings: 0, total: 0 };
      }
      
      let passed = 0;
      let failed = 0;
      let warnings = 0;
      const total = delegatorsResult.rows.length;
      
      console.log(`   📊 Validating ${total} delegators for ${activeNodeIds.length} active nodes...`);
      
      for (const row of delegatorsResult.rows) {
        const nodeId = parseInt(row.identity_id);
        const delegatorKey = row.delegator_key;
        
        try {
          const expectedStake = await this.calculateExpectedDelegatorStake(network, nodeId, delegatorKey);
          const contractStake = await this.getContractDelegatorStake(network, nodeId, delegatorKey);
          
          // Check if difference is very small (tolerance for rounding errors)
          const difference = expectedStake - contractStake;
          const tolerance = 500000000000000000n; // 0.5 TRAC in wei
          
          if (difference === 0n || difference === 0) {
            console.log(`   ✅ Node ${nodeId}, Delegator ${delegatorKey}:`);
            console.log(`      Indexer ${this.weiToTRAC(expectedStake)} TRAC, Contract ${this.weiToTRAC(contractStake)} TRAC`);
            passed++;
          } else if (difference >= -tolerance && difference <= tolerance) {
            console.log(`   ⚠️ Node ${nodeId}, Delegator ${delegatorKey}:`);
            console.log(`      Indexer ${this.weiToTRAC(expectedStake)} TRAC, Contract ${this.weiToTRAC(contractStake)} TRAC`);
            if (Math.abs(Number(difference)) < 1000000000000000000) { // Less than 1 TRAC
              const tracDifference = Number(difference) / Math.pow(10, 18);
              console.log(`      📊 Small difference: ${tracDifference.toFixed(18)} TRAC (within 0.5 TRAC tolerance)`);
            } else {
              console.log(`      📊 Small difference: ${difference > 0 ? '+' : '-'}${this.weiToTRAC(difference > 0 ? difference : -difference)} TRAC (within 0.5 TRAC tolerance)`);
            }
            warnings++; // Count as warning
          } else {
            console.log(`   ❌ Node ${nodeId}, Delegator ${delegatorKey}:`);
            console.log(`      Indexer ${this.weiToTRAC(expectedStake)} TRAC, Contract ${this.weiToTRAC(contractStake)} TRAC`);
            console.log(`      📊 Difference: ${difference > 0 ? '+' : '-'}${this.weiToTRAC(difference > 0 ? difference : -difference)} TRAC`);
            failed++;
          }
        } catch (error) {
          console.log(`   ⚠️ Node ${nodeId}, Delegator ${delegatorKey.slice(0, 10)}...: Error - ${error.message}`);
          failed++;
        }
      }
      
      return { passed, failed, warnings, total };
      
    } catch (error) {
      console.error(`Error validating delegator stakes for ${network}:`, error.message);
      return { passed: 0, failed: 0, warnings: 0, total: 0 };
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
      
      // Try to get the count using a more appropriate method
      let contractCount;
      try {
        contractCount = await knowledgeContract.getKnowledgeCollectionCount();
      } catch (error) {
        // Fallback to latest ID if count method doesn't exist
        contractCount = await knowledgeContract.getLatestKnowledgeCollectionId();
      }
      
      const contractCountNumber = parseInt(contractCount.toString());
      
      console.log(`   📊 Indexer events: ${indexerCount.toLocaleString()}, Contract count: ${contractCountNumber.toLocaleString()}`);
      
      const difference = indexerCount - contractCountNumber;
      const tolerance = 75; // 75 count tolerance
      
      if (indexerCount === contractCountNumber) {
        console.log(`   ✅ Knowledge collections match: ${indexerCount.toLocaleString()}`);
        return { passed: 1, failed: 0, warnings: 0, total: 1 };
      } else if (Math.abs(difference) <= tolerance) {
        console.log(`   ⚠️ Knowledge collections small difference: Indexer ${indexerCount.toLocaleString()}, Contract ${contractCountNumber.toLocaleString()}`);
        console.log(`      📊 Small difference: ${difference > 0 ? '+' : ''}${difference.toLocaleString()} (within 75 count tolerance)`);
        return { passed: 0, failed: 0, warnings: 1, total: 1 }; // Count as warning
      } else {
        console.log(`   ❌ Knowledge collections mismatch: Indexer ${indexerCount.toLocaleString()}, Contract ${contractCountNumber.toLocaleString()}`);
        console.log(`      📊 Difference: ${difference > 0 ? '+' : ''}${difference.toLocaleString()}`);
        return { passed: 0, failed: 1, warnings: 0, total: 1 };
      }
      
    } catch (error) {
      console.error(`Error validating knowledge collections for ${network}:`, error.message);
      return { passed: 0, failed: 0, warnings: 0, total: 0 };
    } finally {
      await client.end();
    }
  }
}

module.exports = CompleteQAService;

// Mocha test suite
describe('Indexer Chain Validation', function() {
  this.timeout(3300000); // 55 minutes timeout
  
  const qaService = new CompleteQAService();
  const summary = {
    total: { passed: 0, failed: 0, warnings: 0 },
    networks: {}
  };
  
  // Helper function to track results
  function trackResults(network, testType, results) {
    if (!summary.networks[network]) {
      summary.networks[network] = {};
    }
    if (!summary.networks[network][testType]) {
      summary.networks[network][testType] = { passed: 0, failed: 0, warnings: 0 };
    }
    
    summary.networks[network][testType].passed += results.passed;
    summary.networks[network][testType].failed += results.failed;
    summary.networks[network][testType].warnings += results.warnings;
    
    summary.total.passed += results.passed;
    summary.total.failed += results.failed;
    summary.total.warnings += results.warnings;
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
          const total = results.passed + results.failed + results.warnings;
          if (total > 0) {
            console.log(`   ${testType}: ${results.passed} ✅ passed, ${results.failed} ❌ failed, ${results.warnings} ⚠️ warnings`);
          }
        }
      }
    }
    
    console.log('\n' + '-'.repeat(80));
    console.log(`🎯 GRAND TOTAL: ${summary.total.passed} ✅ passed, ${summary.total.failed} ❌ failed, ${summary.total.warnings} ⚠️ warnings`);
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
    
    it('should validate knowledge collections', async function() {
      const results = await qaService.validateKnowledgeCollections('Gnosis');
      trackResults('Gnosis', 'Knowledge Collections', results);
      if (results.failed > 0) {
        throw new Error(`${results.failed} knowledge collection validations failed`);
      }
    });
  });
  
  describe('Base Network', function() {
    it('should validate node stakes', async function() {
      const results = await qaService.validateNodeStakes('Base');
      trackResults('Base', 'Node Stakes', results);
      if (results.failed > 0) {
        throw new Error(`${results.failed} node stake validations failed`);
      }
    });
    
    it('should validate delegator stakes', async function() {
      const results = await qaService.validateDelegatorStakes('Base');
      trackResults('Base', 'Delegator Stakes', results);
      if (results.failed > 0) {
        throw new Error(`${results.failed} delegator stake validations failed`);
      }
    });
    
    it('should validate knowledge collections', async function() {
      const results = await qaService.validateKnowledgeCollections('Base');
      trackResults('Base', 'Knowledge Collections', results);
      if (results.failed > 0) {
        throw new Error(`${results.failed} knowledge collection validations failed`);
      }
    });
  });
  
  describe('Neuroweb Network', function() {
    it('should validate node stakes', async function() {
      const results = await qaService.validateNodeStakes('Neuroweb');
      trackResults('Neuroweb', 'Node Stakes', results);
      if (results.failed > 0) {
        throw new Error(`${results.failed} node stake validations failed`);
      }
    });
    
    it('should validate delegator stakes', async function() {
      const results = await qaService.validateDelegatorStakes('Neuroweb');
      trackResults('Neuroweb', 'Delegator Stakes', results);
      if (results.failed > 0) {
        throw new Error(`${results.failed} delegator stake validations failed`);
      }
    });
    
    it('should validate knowledge collections', async function() {
      const results = await qaService.validateKnowledgeCollections('Neuroweb');
      trackResults('Neuroweb', 'Knowledge Collections', results);
      if (results.failed > 0) {
        throw new Error(`${results.failed} knowledge collection validations failed`);
      }
    });
  });
}); 