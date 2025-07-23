import { expect } from 'chai';
import { ethers } from 'ethers';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import {
  ensureSufficientGasFunds,
  impersonateAccount,
  stopImpersonatingAccount,
} from './blockchain-helpers';
import {
  DELEGATORS_INFO_MAINNET_ADDRESSES,
  HUB_OWNERS,
  RPC_URLS,
} from './simulation-constants';

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
  contracts: { [key: string]: any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  proofingTimestamp: number,
): Promise<void> {
  console.log(
    `[CALCULATE SCORES] Calculating scores for active nodes at timestamp ${proofingTimestamp}`,
  );

  try {
    // Get current epoch and proof period start block
    const currentEpoch = await contracts.chronos.getCurrentEpoch();

    // Get the total number of nodes to iterate through
    const maxIdentityId = await contracts.identityStorage.lastIdentityId();

    let activeNodesCount = 0;

    const hubAddress = await contracts.hub.getAddress();
    const hubOwner = HUB_OWNERS[hubAddress as keyof typeof HUB_OWNERS];
    const hubOwnerSigner = await hre.ethers.getSigner(hubOwner);
    await ensureSufficientGasFunds(hre, hubOwner);

    // Iterate through all possible identity IDs
    for (let identityId = 1; identityId <= maxIdentityId; identityId++) {
      try {
        // Check if profile exists
        const profileExists =
          await contracts.profileStorage.profileExists(identityId);
        if (!profileExists) {
          throw new Error(`Profile does not exist for identity ${identityId}`);
        }

        // Check if node is in sharding table
        const nodeExists =
          await contracts.shardingTableStorage.nodeExists(identityId);
        if (!nodeExists) {
          continue;
        }

        // Node is in the sharding table - calculate score
        const score18 =
          await contracts.randomSampling.calculateNodeScore(identityId);

        if (score18 > 0) {
          await impersonateAccount(hre, hubOwner);
          const randomSamplingStorageWithSigner =
            contracts.randomSamplingStorage.connect(hubOwnerSigner);
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
          const totalNodeStake =
            await contracts.stakingStorage.getNodeStake(identityId);
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
      await contracts.shardingTableStorage.nodesCount(),
      `[CALCULATE SCORES] Active nodes count ${activeNodesCount} should match the number of nodes in the sharding table ${await contracts.shardingTableStorage.nodesCount()}`,
    );
  } catch (error) {
    console.error(
      `[CALCULATE SCORES] Error calculating scores for active nodes: ${error}`,
    );
    throw error;
  }
}

/**
 * Fund a user with TRAC tokens by transferring from StakingStorage contract
 */
async function fundUserWithTRAC(
  hre: HardhatRuntimeEnvironment,
  contracts: { [key: string]: any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  userAddress: string,
  amount: bigint,
): Promise<void> {
  console.log(
    `[FUND USER TRAC] Transferring ${amount.toString()} TRAC tokens to ${userAddress} from StakingStorage`,
  );

  const stakingStorageAddress = await contracts.stakingStorage.getAddress();
  const tokenContract = contracts.token;

  try {
    // Check if StakingStorage has sufficient balance
    const balance = await tokenContract.balanceOf(stakingStorageAddress);

    console.log(
      `[FUND USER TRAC] StakingStorage balance: ${balance.toString()}`,
    );

    if (balance < amount) {
      throw new Error(
        `[FUND USER TRAC] StakingStorage has insufficient balance: ${balance.toString()} < ${amount.toString()}`,
      );
    }

    // Impersonate the StakingStorage contract
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [stakingStorageAddress],
    });

    // Add some ETH to StakingStorage for gas
    await hre.network.provider.send('hardhat_setBalance', [
      stakingStorageAddress,
      '0x' + hre.ethers.parseEther('1.0').toString(16),
    ]);

    // Get signer for StakingStorage
    const stakingSigner = await hre.ethers.getSigner(stakingStorageAddress);
    const tokenWithStakingSigner = tokenContract.connect(stakingSigner);

    console.log(
      `[FUND USER TRAC] Transferring ${amount.toString()} TRAC from StakingStorage to ${userAddress}`,
    );

    // Transfer TRAC tokens from StakingStorage to user
    const transferTx = await tokenWithStakingSigner.transfer(
      userAddress,
      amount,
    );
    await transferTx.wait();

    console.log(
      `[FUND USER TRAC] Transfer completed. Transaction: ${transferTx.hash}`,
    );

    // Stop impersonating StakingStorage
    await hre.network.provider.request({
      method: 'hardhat_stopImpersonatingAccount',
      params: [stakingStorageAddress],
    });
  } catch (error) {
    console.error(`[FUND USER TRAC] ❌ Failed to transfer tokens: ${error}`);
    throw error;
  }
}

/**
 * Setup TRAC token allowances for Staking transactions
 */
export async function setupStakingAllowances(
  hre: HardhatRuntimeEnvironment,
  contracts: { [key: string]: any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  userAddress: string,
  amount: string,
): Promise<void> {
  try {
    console.log(
      `[STAKING ALLOWANCE] Setting up TRAC allowances for user ${userAddress}, amount ${amount}`,
    );

    const stakingAddress = await contracts.staking.getAddress();
    const tokenAddress = await contracts.token.getAddress();

    console.log(`[STAKING ALLOWANCE] TRAC token address: ${tokenAddress}`);

    // ERC20 ABI for approve function
    const erc20Abi = [
      'function approve(address spender, uint256 amount) external returns (bool)',
      'function balanceOf(address owner) external view returns (uint256)',
      'function allowance(address owner, address spender) external view returns (uint256)',
    ];
    const tokenContract = new hre.ethers.Contract(
      tokenAddress,
      erc20Abi,
      hre.ethers.provider,
    );

    // Get user's signer
    const userSigner = await hre.ethers.getSigner(userAddress);
    const tokenWithSigner = tokenContract.connect(userSigner);

    // Check current balance and allowance
    const balance = await tokenContract.balanceOf(userAddress);
    const currentAllowance = await tokenContract.allowance(
      userAddress,
      stakingAddress,
    );
    const requiredAmount = BigInt(amount);

    console.log(
      `[STAKING ALLOWANCE] User balance: ${balance.toString()}, current allowance: ${currentAllowance.toString()}, required: ${requiredAmount.toString()}`,
    );

    // If user doesn't have enough TRAC tokens, fund them first
    if (balance < requiredAmount) {
      const amountToFund = requiredAmount - balance;
      console.log(
        `[STAKING ALLOWANCE] Insufficient balance. Funding user with ${amountToFund.toString()} TRAC tokens`,
      );

      await fundUserWithTRAC(hre, contracts, userAddress, amountToFund);

      // Verify the funding worked
      const newBalance = await tokenContract.balanceOf(userAddress);
      expect(newBalance).to.be.equal(
        requiredAmount,
        `[STAKING ALLOWANCE] User balance ${newBalance.toString()} should be equal to required amount ${requiredAmount.toString()}`,
      );
      console.log(
        `[STAKING ALLOWANCE] User funded. New balance: ${newBalance.toString()}`,
      );
    }

    // If allowance is insufficient, approve the required amount
    if (currentAllowance < requiredAmount) {
      // Use generous gas amount for approval
      const gasAmount = hre.ethers.parseEther('0.1');

      console.log(
        `[STAKING ALLOWANCE] Adding ${hre.ethers.formatEther(gasAmount)} ETH for approval transaction`,
      );

      await hre.network.provider.send('hardhat_setBalance', [
        userAddress,
        '0x' + gasAmount.toString(16),
      ]);

      console.log(`[STAKING ALLOWANCE] Executing TRAC approval transaction...`);

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const approveTx = await (tokenWithSigner as any).approve(
          stakingAddress,
          requiredAmount,
          {
            gasLimit: 100000,
          },
        );

        console.log(`[STAKING ALLOWANCE] Approval tx sent: ${approveTx.hash}`);

        const receipt = await approveTx.wait();
        console.log(
          `[STAKING ALLOWANCE] Approval confirmed in block ${receipt.blockNumber}`,
        );

        // Verify the allowance was set correctly
        const newAllowance = await tokenContract.allowance(
          userAddress,
          stakingAddress,
        );
        console.log(
          `[STAKING ALLOWANCE] Verified new allowance: ${newAllowance.toString()}`,
        );
      } catch (approvalError) {
        console.error(
          `[STAKING ALLOWANCE] ❌ Approval transaction failed:`,
          approvalError,
        );
        throw approvalError;
      }
    } else {
      console.log(`[STAKING ALLOWANCE] Sufficient allowance already exists`);
    }
  } catch (error) {
    console.error(`[STAKING ALLOWANCE] ❌ Failed to setup allowances:`, error);
    throw error;
  }
}

/**
 * Setup token allowances for Migrator delegator transactions
 */
export async function setupMigratorAllowances(
  hre: HardhatRuntimeEnvironment,
  contracts: { [key: string]: any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  delegatorAddress: string,
  identityId: number,
): Promise<void> {
  try {
    console.log(
      `[MIGRATOR ALLOWANCE] Setting up allowances for delegator ${delegatorAddress}, identity ${identityId}`,
    );

    // Get contracts
    const migrator = contracts.migrator;
    const migratorAddress = await migrator.getAddress();

    // Get the old hub and old profile storage
    const oldHubAddress = await migrator.oldHub();
    const oldHubAbi = [
      'function getContractAddress(string memory) external view returns (address)',
    ];
    const oldHub = new hre.ethers.Contract(
      oldHubAddress,
      oldHubAbi,
      hre.ethers.provider,
    );

    const oldProfileStorageAddress =
      await oldHub.getContractAddress('ProfileStorage');
    const oldProfileStorageAbi = [
      'function getSharesContractAddress(uint72) external view returns (address)',
    ];
    const oldProfileStorage = new hre.ethers.Contract(
      oldProfileStorageAddress,
      oldProfileStorageAbi,
      hre.ethers.provider,
    );

    // Get the shares contract for this identity
    const sharesContractAddress =
      await oldProfileStorage.getSharesContractAddress(identityId);

    console.log(
      `[MIGRATOR ALLOWANCE] 📝 Shares contract address: ${sharesContractAddress}`,
    );

    // Verify the shares contract exists
    const sharesContractCode = await hre.ethers.provider.getCode(
      sharesContractAddress,
    );
    if (!sharesContractCode || sharesContractCode === '0x') {
      throw new Error(
        `[MIGRATOR ALLOWANCE] Shares contract at ${sharesContractAddress} does not exist or has no code`,
      );
    }

    console.log(
      `[MIGRATOR ALLOWANCE] ✅ Shares contract verified at ${sharesContractAddress}`,
    );

    // ERC20 ABI for approve function
    const erc20Abi = [
      'function approve(address spender, uint256 amount) external returns (bool)',
      'function balanceOf(address owner) external view returns (uint256)',
      'function allowance(address owner, address spender) external view returns (uint256)',
    ];
    const sharesContract = new hre.ethers.Contract(
      sharesContractAddress,
      erc20Abi,
      hre.ethers.provider,
    );

    // Get delegator's signer
    const delegatorSigner = await hre.ethers.getSigner(delegatorAddress);
    const sharesWithSigner = sharesContract.connect(delegatorSigner);

    // Check current balance and allowance
    const balance = await sharesContract.balanceOf(delegatorAddress);
    const currentAllowance = await sharesContract.allowance(
      delegatorAddress,
      migratorAddress,
    );

    console.log(
      `[MIGRATOR ALLOWANCE] Delegator balance: ${balance.toString()}, current allowance: ${currentAllowance.toString()}`,
    );

    // If allowance is insufficient, approve the full balance
    if (currentAllowance < balance) {
      console.log(
        `[MIGRATOR ALLOWANCE] Approving Migrator to spend ${balance.toString()} shares tokens`,
      );

      // Ensure sufficient gas for the approval transaction
      // Use a generous fixed amount since gas estimation is problematic
      const gasAmount = hre.ethers.parseEther('0.1'); // 0.1 ETH should be enough

      console.log(
        `[MIGRATOR ALLOWANCE] Adding ${hre.ethers.formatEther(gasAmount)} ETH for approval transaction`,
      );

      await hre.network.provider.send('hardhat_setBalance', [
        delegatorAddress,
        '0x' + gasAmount.toString(16),
      ]);

      console.log(`[MIGRATOR ALLOWANCE] 🚀 Executing approval transaction...`);

      try {
        console.log(`[MIGRATOR ALLOWANCE] 🎯 About to call approve() with:`);
        console.log(`[MIGRATOR ALLOWANCE]   - Spender: ${migratorAddress}`);
        console.log(`[MIGRATOR ALLOWANCE]   - Amount: ${balance.toString()}`);
        console.log(`[MIGRATOR ALLOWANCE]   - From: ${delegatorAddress}`);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const approveTx = await (sharesWithSigner as any).approve(
          migratorAddress,
          balance,
          {
            gasLimit: 1000000, // Explicit gas limit for approve
          },
        );

        console.log(`[MIGRATOR ALLOWANCE] ✅ Approve call succeeded`);

        console.log(
          `[MIGRATOR ALLOWANCE] 📋 Approval tx sent: ${approveTx.hash}`,
        );
        console.log(
          `[MIGRATOR ALLOWANCE] ⏳ Waiting for approval confirmation...`,
        );

        // Mine a block to confirm the approval transaction (auto-mining is disabled)
        console.log(
          `[MIGRATOR ALLOWANCE] 📦 Mining block to confirm approval...`,
        );
        await hre.network.provider.request({
          method: 'evm_mine',
          params: [],
        });

        console.log(
          `[MIGRATOR ALLOWANCE] 🔍 Block mined, checking transaction status...`,
        );

        // Check if transaction was included in the block
        const txStatus = await hre.ethers.provider.getTransaction(
          approveTx.hash,
        );
        console.log(
          `[MIGRATOR ALLOWANCE] 📋 Transaction status:`,
          txStatus ? 'Found' : 'Not found',
        );

        if (txStatus && txStatus.blockNumber) {
          console.log(
            `[MIGRATOR ALLOWANCE] ✅ Transaction included in block ${txStatus.blockNumber}`,
          );
        } else {
          console.log(
            `[MIGRATOR ALLOWANCE] ⚠️ Transaction not yet included in a block`,
          );
        }

        console.log(`[MIGRATOR ALLOWANCE] ⏳ Calling txResponse.wait()...`);

        // Add timeout to prevent infinite hanging
        const receiptPromise = approveTx.wait();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(
            () =>
              reject(new Error('Transaction wait timeout after 30 seconds')),
            30000,
          ),
        );

        const receipt = (await Promise.race([
          receiptPromise,
          timeoutPromise,
        ])) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        console.log(`[MIGRATOR ALLOWANCE] 🎉 Wait completed!`);

        console.log(
          `[MIGRATOR ALLOWANCE] ✅ Approval confirmed in block ${receipt.blockNumber}`,
        );

        // Verify the allowance was set correctly
        const newAllowance = await sharesContract.allowance(
          delegatorAddress,
          migratorAddress,
        );
        console.log(
          `[MIGRATOR ALLOWANCE] 🔍 Verified new allowance: ${newAllowance.toString()}`,
        );

        // Mine a block to confirm the approval transaction
        await hre.network.provider.request({
          method: 'evm_mine',
          params: [],
        });
      } catch (approvalError) {
        console.error(
          `[MIGRATOR ALLOWANCE] ❌ Approval transaction failed:`,
          approvalError,
        );
        throw approvalError;
      }
    } else {
      console.log(
        `[MIGRATOR ALLOWANCE] ✅ Sufficient allowance already exists`,
      );
    }
  } catch (error) {
    console.error(`[MIGRATOR ALLOWANCE] ❌ Failed to setup allowances:`, error);
    throw error;
  }
}

export async function getV6ActiveNodesAndDelegators(
  contracts: { [key: string]: any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  chain: string,
): Promise<{
  v6ActiveNodes: number[];
  v6NodeDelegators: { [key: number]: string[] };
}> {
  const v6ActiveNodes: number[] = [];
  const v6NodeDelegators: { [key: number]: string[] } = {};

  // Initialize mainnet delegatorsInfo contract
  const provider = new ethers.JsonRpcProvider(RPC_URLS[chain]);
  const delegatorsInfo = new ethers.Contract(
    DELEGATORS_INFO_MAINNET_ADDRESSES[chain],
    [
      'function getDelegators(uint72 identityId) external view returns (address[] memory)',
    ],
    provider,
  );

  // Migrate mainnet delegators to the forked delegatorsInfo contract
  const maxIdentityId = await contracts.identityStorage.lastIdentityId();
  for (let identityId = 1; identityId <= maxIdentityId; identityId++) {
    const delegators = await delegatorsInfo.getDelegators(identityId);
    const delegatorsArray = Array.from(delegators);
    console.log(
      `[MIGRATE V6 NODE DELEGATORS] Migrating ${delegatorsArray.length} delegators for identity ${identityId}`,
    );
    await contracts.delegatorsInfo.migrate(delegatorsArray);
    const migratedDelegators =
      await contracts.delegatorsInfo.getDelegators(identityId);
    console.log(
      `[INIT] Migrated ${migratedDelegators.length} delegators for identity ${identityId}`,
    );
    v6NodeDelegators[identityId] = Array.from(migratedDelegators);
    if (await contracts.shardingTableStorage.nodeExists(identityId)) {
      v6ActiveNodes.push(identityId);
    }
  }

  return { v6ActiveNodes, v6NodeDelegators };
}
