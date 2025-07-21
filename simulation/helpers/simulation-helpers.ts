import { expect } from 'chai';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import {
  getDeployedContract,
  getHubAddress,
  impersonateAccount,
  stopImpersonatingAccount,
} from './blockchain-helpers';
import { HUB_OWNERS } from './simulation-constants';

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
    `[CALCULATE SCORES] Calculating scores for active nodes at timestamp ${proofingTimestamp}`,
  );

  try {
    // Load all contracts in parallel for better performance
    const [
      identityStorage,
      profileStorage,
      shardingTableStorage,
      randomSampling,
      randomSamplingStorage,
      stakingStorage,
      chronos,
    ] = await Promise.all([
      getDeployedContract(hre, 'IdentityStorage'),
      getDeployedContract(hre, 'ProfileStorage'),
      getDeployedContract(hre, 'ShardingTableStorage'),
      getDeployedContract(hre, 'RandomSampling'),
      getDeployedContract(hre, 'RandomSamplingStorage'),
      getDeployedContract(hre, 'StakingStorage'),
      getDeployedContract(hre, 'Chronos'),
    ]);

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
          const hubAddress = await getHubAddress(hre);
          const hubOwner = HUB_OWNERS[hubAddress as keyof typeof HUB_OWNERS];
          const hubOwnerSigner = await hre.ethers.getSigner(hubOwner);
          await impersonateAccount(hre, hubOwner);
          const randomSamplingStorageWithSigner =
            randomSamplingStorage.connect(hubOwnerSigner);
          // Add to node epoch score
          await randomSamplingStorageWithSigner.addToNodeEpochScore(
            currentEpoch,
            identityId,
            score18,
          );

          // Add to all nodes epoch score
          await randomSamplingStorageWithSigner.addToAllNodesEpochScore(
            currentEpoch,
            score18,
          );

          // Calculate and add score per stake
          const totalNodeStake = await stakingStorage.getNodeStake(identityId);
          if (totalNodeStake > 0) {
            // score18 * SCALE18 / totalNodeStake = nodeScorePerStake36
            const SCALE18 = BigInt(10 ** 18);
            const nodeScorePerStake36 = (score18 * SCALE18) / totalNodeStake;

            await randomSamplingStorageWithSigner.addToNodeEpochScorePerStake(
              currentEpoch,
              identityId,
              nodeScorePerStake36,
            );
          }

          await stopImpersonatingAccount(hre, hubOwner);

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

    console.log(
      `[CALCULATE SCORES] Processed ${activeNodesCount} active nodes`,
    );
    expect(activeNodesCount).to.equal(
      await shardingTableStorage.nodesCount(),
      `[CALCULATE SCORES] Active nodes count ${activeNodesCount} should match the number of nodes in the sharding table ${await shardingTableStorage.nodesCount()}`,
    );
  } catch (error) {
    console.error(
      `[CALCULATE SCORES] Error calculating scores for active nodes: ${error}`,
    );
    throw error;
  }
}
