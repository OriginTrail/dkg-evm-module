const { ethers } = require('ethers');
const { Client } = require('pg');
const config = require('./config');

class CompleteQAService {
  constructor() {
    this.results = [];
    
    this.dbConfig = {
      host: '18.194.101.22',
      port: 5432,
      user: 'developer',
      password: 'P6b8MnLLb4tCDoU1W78XcyuhsX3A325J',
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
    }).replace(/,/g, ' ');
  }

  /**
   * Fetch all indexer data from databases
   */
  async fetchIndexerData() {
    const { Client } = require('pg');
    
    console.log('🔌 Connecting to PostgreSQL databases...');
    
    const data = {
      knowledgeCollections: {},
      nodes: {},
      delegators: {}
    };

    // Query each network's database
    for (const network of ['Gnosis', 'Base', 'Neuroweb']) {
      const dbName = this.databaseMap[network];
      console.log(`📊 Querying ${network} (${dbName})...`);
      
      try {
        const client = new Client({
          ...this.dbConfig,
          database: dbName
        });
        
        await client.connect();
        
        // Task 3: Knowledge Collections
        const kcResult = await client.query(`
          SELECT COUNT(*) as event_count 
          FROM knowledge_collection_created
        `);
        
        data.knowledgeCollections[network] = {
          knowledgeCollectionEvents: parseInt(kcResult.rows[0].event_count)
        };
        
        // Task 1: Node Stake Data
        const nodeStakeResult = await client.query(`
          SELECT identity_id, stake
          FROM node_stake_updated
          ORDER BY block_number DESC
          LIMIT 10
        `);
        
        data.nodes[network] = {};
        nodeStakeResult.rows.forEach(row => {
          const nodeId = row.identity_id;
          if (!data.nodes[network][nodeId]) {
            data.nodes[network][nodeId] = {
              initialStake: '0',
              stakeAdded: '0',
              stakeRemoved: '0'
            };
          }
          // Use the latest stake as current
          data.nodes[network][nodeId].currentStake = row.stake;
        });
        
        // Task 2: Delegator Stake Data
        const delegatorStakeResult = await client.query(`
          SELECT identity_id, delegator_key, stake_base
          FROM delegator_base_stake_updated
          ORDER BY block_number DESC
          LIMIT 10
        `);
        
        data.delegators[network] = {};
        delegatorStakeResult.rows.forEach(row => {
          const nodeId = row.identity_id;
          const delegatorKey = row.delegator_key;
          
          if (!data.delegators[network][nodeId]) {
            data.delegators[network][nodeId] = {};
          }
          
          if (!data.delegators[network][nodeId][delegatorKey]) {
            data.delegators[network][nodeId][delegatorKey] = {
              initialStakeBase: '0',
              stakeBaseUpdates: []
            };
          }
          
          // Use the latest stake as current
          data.delegators[network][nodeId][delegatorKey].currentStakeBase = row.stake_base;
        });
        
        await client.end();
        
        console.log(`✅ ${network}: ${kcResult.rows[0].event_count} KC, ${nodeStakeResult.rows.length} nodes, ${delegatorStakeResult.rows.length} delegators`);
        
      } catch (error) {
        console.log(`❌ Error querying ${network}: ${error.message}`);
        data.knowledgeCollections[network] = { knowledgeCollectionEvents: 0 };
        data.nodes[network] = {};
        data.delegators[network] = {};
      }
    }

    console.log('✅ Database queries completed');
    return data;
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
        return { passed: 0, failed: 0, total: 0 };
      }
      
      let passed = 0;
      let failed = 0;
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
          const tolerance = 1n; // 1 wei tolerance
          
          if (expectedStake === contractStake || (difference >= -tolerance && difference <= tolerance)) {
            console.log(`   ✅ Node ${nodeId}: Indexer ${this.weiToTRAC(expectedStake)} TRAC, Contract ${this.weiToTRAC(contractStake)} TRAC`);
            passed++;
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
      
      return { passed, failed, total };
      
    } catch (error) {
      console.error(`Error validating node stakes for ${network}:`, error.message);
      return { passed: 0, failed: 0, total: 0 };
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
        return { passed: 0, failed: 0, total: 0 };
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
        return { passed: 0, failed: 0, total: 0 };
      }
      
      let passed = 0;
      let failed = 0;
      const total = delegatorsResult.rows.length;
      
      console.log(`   📊 Validating ${total} delegators for ${activeNodeIds.length} active nodes...`);
      
      for (const row of delegatorsResult.rows) {
        const nodeId = parseInt(row.identity_id);
        const delegatorKey = row.delegator_key;
        
        try {
          const expectedStake = await this.calculateExpectedDelegatorStake(network, nodeId, delegatorKey);
          const contractStake = await this.getContractDelegatorStake(network, nodeId, delegatorKey);
          
          if (expectedStake === contractStake) {
            console.log(`   ✅ Node ${nodeId}, Delegator ${delegatorKey}:`);
            console.log(`      Indexer ${this.weiToTRAC(expectedStake)} TRAC, Contract ${this.weiToTRAC(contractStake)} TRAC`);
            passed++;
          } else {
            const difference = expectedStake - contractStake;
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
      
      return { passed, failed, total };
      
    } catch (error) {
      console.error(`Error validating delegator stakes for ${network}:`, error.message);
      return { passed: 0, failed: 0, total: 0 };
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
      
      console.log(`   📊 Indexer events: ${indexerCount}, Contract count: ${contractCountNumber}`);
      
      if (indexerCount === contractCountNumber) {
        console.log(`   ✅ Knowledge collections match: ${indexerCount}`);
        return { passed: 1, failed: 0, total: 1 };
      } else {
        const difference = indexerCount - contractCountNumber;
        console.log(`   ❌ Knowledge collections mismatch: Indexer ${indexerCount}, Contract ${contractCountNumber}`);
        console.log(`      📊 Difference: ${difference > 0 ? '+' : ''}${difference}`);
        console.log(`      💡 Note: This might be expected if IDs don't start from 0 or if some IDs were skipped`);
        return { passed: 0, failed: 1, total: 1 };
      }
      
    } catch (error) {
      console.error(`Error validating knowledge collections for ${network}:`, error.message);
      return { passed: 0, failed: 0, total: 0 };
    } finally {
      await client.end();
    }
  }

  async runAllValidations() {
    let validationRetries = 6;
    
    while (validationRetries > 0) {
      try {
        console.log('🚀 Starting complete QA validation...\n');
        
        const networks = Object.keys(this.databaseMap);
        let totalPassed = 0;
        let totalFailed = 0;
        let totalChecks = 0;
        
        for (const network of networks) {
          console.log(`\n${'='.repeat(50)}`);
          console.log(`Validating ${network}`);
          console.log(`${'='.repeat(50)}`);
          
          // Validate node stakes
          const nodeResults = await this.validateNodeStakes(network);
          totalPassed += nodeResults.passed;
          totalFailed += nodeResults.failed;
          totalChecks += nodeResults.total;
          
          // Validate delegator stakes
          const delegatorResults = await this.validateDelegatorStakes(network);
          totalPassed += delegatorResults.passed;
          totalFailed += delegatorResults.failed;
          totalChecks += delegatorResults.total;
          
          // Validate knowledge collections
          const knowledgeResults = await this.validateKnowledgeCollections(network);
          totalPassed += knowledgeResults.passed;
          totalFailed += knowledgeResults.failed;
          totalChecks += knowledgeResults.total;
        }
        
        console.log(`\n${'='.repeat(50)}`);
        console.log('📊 FINAL RESULTS');
        console.log(`${'='.repeat(50)}`);
        console.log(`✅ Passed: ${totalPassed}`);
        console.log(`❌ Failed: ${totalFailed}`);
        console.log(`📈 Total: ${totalChecks}`);
        console.log(`📊 Success Rate: ${totalChecks > 0 ? ((totalPassed / totalChecks) * 100).toFixed(1) : 0}%`);
        
        return {
          passed: totalPassed,
          failed: totalFailed,
          total: totalChecks,
          successRate: totalChecks > 0 ? (totalPassed / totalChecks) * 100 : 0
        };
        
      } catch (error) {
        validationRetries--;
        if (validationRetries === 0) {
          console.error('❌ All validation attempts failed:', error.message);
          throw error;
        }
        
        console.log(`\n⏳ Validation failed, waiting 5 minutes before restarting... (${validationRetries} attempts left)`);
        await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000)); // 5 minutes
      }
    }
  }

  printResult(result) {
    const statusIcon = {
      'PASS': '✅',
      'FAIL': '❌',
      'ERROR': '⚠️'
    };

    let label = result.type;
    if (result.nodeId) label += ` (Node ${result.nodeId})`;
    if (result.delegatorKey) label += ` (Delegator ${result.delegatorKey.slice(0, 10)}...)`;

    console.log(`${statusIcon[result.status]} ${label} - ${result.status}`);
    
    if (result.status === 'FAIL') {
      console.log(`   Contract: ${result.contractValue}`);
      console.log(`   Expected: ${result.expectedValue}`);
      console.log(`   Difference: ${result.difference}`);
    } else if (result.status === 'ERROR') {
      console.log(`   Error: ${result.error}`);
    }
  }

  printSummary() {
    console.log('\n📊 Validation Summary:');
    
    const summary = {
      total: this.results.length,
      pass: this.results.filter(r => r.status === 'PASS').length,
      fail: this.results.filter(r => r.status === 'FAIL').length,
      error: this.results.filter(r => r.status === 'ERROR').length
    };

    console.log(`Total checks: ${summary.total}`);
    console.log(`✅ Passed: ${summary.pass}`);
    console.log(`❌ Failed: ${summary.fail}`);
    console.log(`⚠️ Errors: ${summary.error}`);

    if (summary.fail > 0 || summary.error > 0) {
      console.log('\n🚨 Inconsistencies detected!');
    } else {
      console.log('\n🎉 All validations passed!');
    }
  }
}

module.exports = CompleteQAService;

// Execute if this file is run directly
if (require.main === module) {
  const qaService = new CompleteQAService();
  qaService.runAllValidations().catch(console.error);
} 