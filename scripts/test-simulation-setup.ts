import { ethers } from 'hardhat';

import { getChainConfig } from '../constants/simulation-constants';

/**
 * Test script to validate simulation configuration
 * Run with: npx hardhat run scripts/test-simulation-config.ts --config hardhat.simulation.config.ts --network <network>
 */

async function main() {
  console.log('🔧 Testing Simulation Configuration...\n');

  // Get network information
  const networkName = process.env.HARDHAT_NETWORK || 'hardhat';
  console.log(`Network: ${networkName}`);

  // Get provider and basic chain info
  const provider = ethers.provider;
  const blockNumber = await provider.getBlockNumber();
  const block = await provider.getBlock(blockNumber);
  const chainId = (await provider.getNetwork()).chainId;

  console.log(`Chain ID: ${chainId}`);
  console.log(`Current Block: ${blockNumber}`);
  console.log(
    `Block Timestamp: ${block?.timestamp} (${new Date(block?.timestamp! * 1000).toISOString()})`, // eslint-disable-line @typescript-eslint/no-non-null-asserted-optional-chain
  );

  // Test if we can get accounts
  const accounts = await ethers.getSigners();
  console.log(`Available Accounts: ${accounts.length}`);
  if (accounts.length > 0) {
    console.log(`First Account: ${accounts[0].address}`);
    const balance = await provider.getBalance(accounts[0].address);
    console.log(`First Account Balance: ${ethers.formatEther(balance)} ETH`);
  }

  // Test if this is a forked network
  if (networkName.includes('simulation')) {
    const chainName = networkName.replace('_simulation', '');
    const config = getChainConfig(chainName);

    console.log(`\n📊 Fork Configuration:`);
    console.log(`Expected V8.0 Start Block: ${config.v8_0StartBlock}`);
    console.log(`Expected V8.1 Start Block: ${config.v8_1StartBlock}`);
    console.log(`Expected Chain ID: ${config.chainId}`);
    console.log(`Current Block Number: ${blockNumber}`);

    // Verify we're forked from the correct block
    if (blockNumber >= config.v8_0StartBlock) {
      console.log('✅ Successfully forked from V8.0 start block');
    } else {
      console.log('❌ Fork block number is incorrect');
    }

    // Test contract deployment existence - try to get code for Hub contract
    try {
      // These are the Hub contract addresses from deployments
      const hubAddresses = {
        base_mainnet: '0x99Aa571fD5e681c2D27ee08A7b7989DB02541d13',
        neuroweb_mainnet: '0x0957e25BD33034948abc28204ddA54b6E1142D6F',
        gnosis_mainnet: '0x882D0BF07F956b1b94BBfe9E77F47c6fc7D4EC8f',
      };

      const hubAddress = hubAddresses[chainName as keyof typeof hubAddresses];
      if (hubAddress) {
        const code = await provider.getCode(hubAddress);
        if (code !== '0x') {
          console.log(`✅ Hub contract found at ${hubAddress}`);
        } else {
          console.log(`❌ Hub contract not found at ${hubAddress}`);
        }
      }
    } catch (error) {
      console.log(`⚠️  Could not check Hub contract: ${error}`);
    }
  }

  // Test mining control
  console.log('\n⛏️  Testing Mining Control...');

  // Test that auto-mining is disabled
  const initialBlock = await provider.getBlockNumber();
  await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
  const afterWaitBlock = await provider.getBlockNumber();

  if (initialBlock === afterWaitBlock) {
    console.log(
      '✅ Auto-mining is disabled (block number unchanged after wait)',
    );
  } else {
    console.log('❌ Auto-mining appears to be enabled (block number changed)');
  }

  // Test manual mining
  try {
    await provider.send('evm_mine', []);
    const afterMiningBlock = await provider.getBlockNumber();
    if (afterMiningBlock > afterWaitBlock) {
      console.log('✅ Manual mining works');
    } else {
      console.log('❌ Manual mining failed');
    }
  } catch (error) {
    console.log(`⚠️  Could not test manual mining: ${error}`);
  }

  // Test time control
  console.log('\n⏰ Testing Time Control...');
  try {
    const initialTime = (await provider.getBlock('latest'))?.timestamp;
    await provider.send('evm_increaseTime', [3600]); // Increase by 1 hour
    await provider.send('evm_mine', []);
    const afterTime = (await provider.getBlock('latest'))?.timestamp;

    if (afterTime && initialTime && afterTime >= initialTime + 3600) {
      console.log('✅ Time control works');
    } else {
      console.log('❌ Time control failed');
    }
  } catch (error) {
    console.log(`⚠️  Could not test time control: ${error}`);
  }

  console.log('\n✅ Simulation configuration test completed!');
}

// Handle errors gracefully
main().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exitCode = 1;
});
