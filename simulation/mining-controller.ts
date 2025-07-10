import { HardhatRuntimeEnvironment } from 'hardhat/types';

/**
 * Mining Control Helper Class
 * Manages Hardhat EVM mining and time operations
 */
export class MiningController {
  private hre: HardhatRuntimeEnvironment;

  constructor(hre: HardhatRuntimeEnvironment) {
    this.hre = hre;
  }

  /**
   * Disable auto-mining for manual control
   */
  async disableAutoMining(): Promise<void> {
    await this.hre.network.provider.send('evm_setAutomine', [false]);
    console.log('✅ Auto-mining disabled for precise block control');
  }

  /**
   * Enable auto-mining
   */
  async enableAutoMining(): Promise<void> {
    await this.hre.network.provider.send('evm_setAutomine', [true]);
    console.log('✅ Auto-mining enabled');
  }

  /**
   * Mine a single block
   */
  async mineBlock(): Promise<void> {
    await this.hre.network.provider.send('evm_mine', []);
  }

  /**
   * Get current block number
   */
  async getCurrentBlock(): Promise<number> {
    return await this.hre.ethers.provider.getBlockNumber();
  }

  /**
   * Get current EVM timestamp
   */
  async getCurrentTimestamp(): Promise<number> {
    const block = await this.hre.ethers.provider.getBlock('latest');
    return block?.timestamp || 0;
  }

  /**
   * Increase EVM time
   */
  async increaseTime(seconds: number): Promise<void> {
    await this.hre.network.provider.send('evm_increaseTime', [seconds]);
  }

  /**
   * Set EVM time to specific timestamp
   */
  async setTime(timestamp: number): Promise<void> {
    await this.hre.network.provider.send('evm_setNextBlockTimestamp', [
      timestamp,
    ]);
  }

  /**
   * Get block by number with timestamp
   */
  async getBlock(
    blockNumber: number,
  ): Promise<{ number: number; timestamp: number } | null> {
    const block = await this.hre.ethers.provider.getBlock(blockNumber);
    if (!block) return null;

    return {
      number: block.number,
      timestamp: block.timestamp,
    };
  }

  /**
   * Validate mining control functionality
   */
  async validateMiningControl(): Promise<boolean> {
    console.log('🧪 Testing Mining Control...');

    const initialBlock = await this.getCurrentBlock();
    const initialTimestamp = await this.getCurrentTimestamp();

    console.log(`   Initial block: ${initialBlock}`);
    console.log(`   Initial timestamp: ${initialTimestamp}`);

    // Test time increase
    console.log('   Increasing time by 1 hour...');
    await this.increaseTime(3600);

    // Test mining
    console.log('   Mining a block...');
    await this.mineBlock();

    const newBlock = await this.getCurrentBlock();
    const newTimestamp = await this.getCurrentTimestamp();

    console.log(`   New block: ${newBlock}`);
    console.log(`   New timestamp: ${newTimestamp}`);
    console.log(
      `   Time difference: ${newTimestamp - initialTimestamp} seconds`,
    );

    const success =
      newBlock > initialBlock && newTimestamp >= initialTimestamp + 3600;

    if (success) {
      console.log('✅ Mining control test passed');
    } else {
      console.log('❌ Mining control test failed');
    }

    return success;
  }
}
