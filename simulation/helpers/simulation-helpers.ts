import { expect } from 'chai';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import { getDeployedContracts } from './blockchain-helpers';

/**
 * Simulation Helpers
 *
 * Contains helper functions for the DKG V8.0 to V8.1 historical rewards simulation.
 * This includes scoring calculations, node processing, and other simulation-specific logic.
 */

/**
 * Calculate scores for all active nodes in the sharding table
 * This implements the core scoring logic from the V8.1 Random Sampling system
 */
export async function calculateScoresForActiveNodes(
  hre: HardhatRuntimeEnvironment,
  proofingTimestamp: number,
): Promise<void> {
  console.log(
    `📊 Calculating scores for active nodes at timestamp ${proofingTimestamp}`,
  );

  try {
    // Get contract instances from the deployed contracts
    const deployments = await getDeployedContracts(hre);

    const identityStorage = deployments.IdentityStorage;
    const profileStorage = deployments.ProfileStorage;
    const shardingTableStorage = deployments.ShardingTableStorage;
    const randomSampling = deployments.RandomSampling;
    const randomSamplingStorage = deployments.RandomSamplingStorage;
    const stakingStorage = deployments.StakingStorage;
    const chronos = deployments.Chronos;

    // Get current epoch and proof period start block
    const currentEpoch = await chronos.getCurrentEpoch();

    // Get the total number of nodes to iterate through
    const maxIdentityId = await identityStorage.lastIdentityId();

    let activeNodesCount = 0;

    // Iterate through all possible identity IDs
    for (let identityId = 1; identityId <= maxIdentityId; identityId++) {
      try {
        // Check if profile exists
        const profileExists = await profileStorage.profileExists(identityId);
        if (!profileExists) {
          throw new Error(`Profile does not exist for identity ${identityId}`);
        }

        // Check if node is in sharding table
        const nodeExists = await shardingTableStorage.nodeExists(identityId);
        if (!nodeExists) {
          continue;
        }

        // Node is in the sharding table - calculate score
        const score18 = await randomSampling.calculateNodeScore(identityId);

        if (score18 > 0) {
          // Add to node epoch score
          await randomSamplingStorage.addToNodeEpochScore(
            currentEpoch,
            identityId,
            score18,
          );

          // Add to all nodes epoch score
          await randomSamplingStorage.addToAllNodesEpochScore(
            currentEpoch,
            score18,
          );

          // Calculate and add score per stake
          const totalNodeStake = await stakingStorage.getNodeStake(identityId);
          if (totalNodeStake > 0) {
            // score18 * SCALE18 / totalNodeStake = nodeScorePerStake36
            const SCALE18 = BigInt(10 ** 18);
            const nodeScorePerStake36 = (score18 * SCALE18) / totalNodeStake;

            await randomSamplingStorage.addToNodeEpochScorePerStake(
              currentEpoch,
              identityId,
              nodeScorePerStake36,
            );
          }

          activeNodesCount++;

          console.log(
            `   ✅ Node ${identityId}: score=${hre.ethers.formatEther(score18)}`,
          );
        }
      } catch (error) {
        console.error(`   ⚠️  Error processing node ${identityId}: ${error}`);
        // Continue with next node
      }
    }

    console.log(`   📈 Processed ${activeNodesCount} active nodes`);
    expect(activeNodesCount).to.equal(
      await shardingTableStorage.nodesCount(),
      `Active nodes count ${activeNodesCount} should match the number of nodes in the sharding table ${await shardingTableStorage.nodesCount()}`,
    );
  } catch (error) {
    console.error(`❌ Error calculating scores for active nodes: ${error}`);
    throw error;
  }
}
