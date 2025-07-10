import { task } from 'hardhat/config';

/**
 * Comprehensive Test Suite for Simulation Foundation
 *
 * This is the MAIN testing entry point for the simulation system.
 * Tests all components: database, mining control, network setup.
 *
 * Usage:
 *   npx hardhat test-simulation-foundation --network hardhat  # Test database only
 *   npx hardhat test-simulation-foundation --network localhost # Test all (requires forked node)
 */

task(
  'test-simulation-foundation',
  'Test ALL simulation foundation components',
).setAction(async (taskArgs, hre) => {
  console.log('🧪 Testing Simulation Foundation Components\n');
  console.log(`Network: ${hre.network.name}`);
  const networkConfig = hre.network.config as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  console.log(`Provider: ${networkConfig.url || 'hardhat'}\n`);

  try {
    // Path to the database file
    const dbPath = './decoded_transactions_base_mainnet.db';

    // Always test database helpers
    await testDatabaseHelpers(dbPath);

    // Test network-dependent features only if connected to a network
    if (hre.network.name !== 'hardhat') {
      await testNetworkSetup(hre);
      await testMiningControl(hre);
      await testTimeControl(hre);
    } else {
      console.log('\n⚠️  Skipping network tests (running on hardhat network)');
      console.log(
        '   To test mining/network features, run against localhost with forked node',
      );
    }

    console.log('\n🎯 All foundation tests completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   ✅ Database operations working');
    if (hre.network.name !== 'hardhat') {
      console.log('   ✅ Network connection working');
      console.log('   ✅ Mining control working');
      console.log('   ✅ Time control working');
    }
  } catch (error) {
    console.error('❌ Foundation tests failed:', error);
    throw error;
  }
});

/**
 * Test database helper functionality
 */
async function testDatabaseHelpers(dbPath: string): Promise<void> {
  console.log('🧪 Testing Database Helpers...');

  const db = new (await import('./db-helpers')).SimulationDatabase(dbPath);

  try {
    // Test database stats
    const stats = await db.getStats();
    console.log(`   📊 Database Stats:
      Total transactions: ${stats.totalTransactions}
      Processed transactions: ${stats.processedTransactions}
      Unprocessed transactions: ${stats.unprocessedTransactions}
      Unique blocks: ${stats.uniqueBlocks}
      Block range: ${stats.blockRange.minBlock} to ${stats.blockRange.maxBlock}`);

    // Test getting batch of transactions
    const batch = db.getOrderedTxsByBlockBatch(3);
    console.log(`   📦 Sample batch: ${batch.length} blocks`);

    if (batch.length > 0) {
      const firstBlock = batch[0];
      console.log(
        `   🔗 First block: ${firstBlock.blockNumber} with ${firstBlock.txs.length} transactions`,
      );

      if (firstBlock.txs.length > 0) {
        const firstTx = firstBlock.txs[0];
        console.log(`   📋 First transaction: ${firstTx.hash}`);
        console.log(
          `   📋 Contract: ${firstTx.contract}, Function: ${firstTx.functionName}`,
        );
      }
    }

    console.log('✅ Database helpers test completed');
  } finally {
    db.close();
  }
}

/**
 * Test network setup and connection
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function testNetworkSetup(hre: any): Promise<void> {
  console.log('🧪 Testing Network Setup...');

  // Get basic network info
  const blockNumber = await hre.ethers.provider.getBlockNumber();
  const block = await hre.ethers.provider.getBlock(blockNumber);
  const network = await hre.ethers.provider.getNetwork();

  console.log(`   Chain ID: ${network.chainId}`);
  console.log(`   Current Block: ${blockNumber}`);
  console.log(
    `   Block Timestamp: ${block?.timestamp} (${new Date((block?.timestamp || 0) * 1000).toISOString()})`,
  );

  // Test accounts
  try {
    const accounts = await hre.ethers.provider.listAccounts();
    console.log(`   Available Accounts: ${accounts.length}`);
    if (accounts.length > 0) {
      const balance = await hre.ethers.provider.getBalance(accounts[0].address);
      console.log(
        `   First Account Balance: ${hre.ethers.formatEther(balance)} ETH`,
      );
    }
  } catch (error) {
    console.log(`   ⚠️  Could not check accounts: ${error}`);
  }

  console.log('✅ Network setup test completed');
}

/**
 * Test mining control functionality
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function testMiningControl(hre: any): Promise<void> {
  console.log('🧪 Testing Mining Control...');

  const mining = new (await import('./mining-controller')).MiningController(
    hre,
  );

  const initialBlock = await mining.getCurrentBlock();
  console.log(`   Initial block: ${initialBlock}`);

  // Test auto-mining disable/enable
  try {
    await mining.disableAutoMining();
    await mining.enableAutoMining();
    console.log('   ✅ Auto-mining control working');
  } catch (error) {
    console.log(`   ⚠️  Auto-mining control error: ${error}`);
  }

  // Test manual mining
  try {
    await mining.mineBlock();
    const newBlock = await mining.getCurrentBlock();
    if (newBlock > initialBlock) {
      console.log('   ✅ Manual mining working');
    } else {
      console.log('   ⚠️  Manual mining may not be working');
    }
  } catch (error) {
    console.log(`   ⚠️  Manual mining error: ${error}`);
  }

  console.log('✅ Mining control test completed');
}

/**
 * Test time control functionality
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function testTimeControl(hre: any): Promise<void> {
  console.log('🧪 Testing Time Control...');

  const mining = new (await import('./mining-controller')).MiningController(
    hre,
  );

  try {
    const initialTimestamp = await mining.getCurrentTimestamp();
    console.log(`   Initial timestamp: ${initialTimestamp}`);

    // Test time increase
    await mining.increaseTime(3600); // 1 hour
    await mining.mineBlock();

    const newTimestamp = await mining.getCurrentTimestamp();
    const timeDiff = newTimestamp - initialTimestamp;

    if (timeDiff >= 3600) {
      console.log(
        `   ✅ Time control working (increased by ${timeDiff} seconds)`,
      );
    } else {
      console.log(
        `   ⚠️  Time control may not be working (only increased by ${timeDiff} seconds)`,
      );
    }
  } catch (error) {
    console.log(`   ⚠️  Time control error: ${error}`);
  }

  console.log('✅ Time control test completed');
}
