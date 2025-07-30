import fs from 'fs';

import { expect } from 'chai';
import { ethers } from 'ethers';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import {
  ensureSufficientGasFunds,
  getDeployedContract,
  getHubContract,
  impersonateAccount,
  stopImpersonatingAccount,
} from './blockchain-helpers';
import { TransactionData } from './db-helpers';
import {
  DELEGATORS_INFO_MAINNET_ADDRESSES,
  HUB_OWNERS,
  RPC_URLS,
  SIMULATION_CHAINS,
} from './simulation-constants';

/**
 * Simulation Helpers
 *
 * Contains helper functions for the DKG V8.0 to V8.1 historical rewards simulation.
 * This includes scoring calculations, node processing, and other simulation-specific logic.
 */

export async function initializeContracts(hre: HardhatRuntimeEnvironment) {
  return {
    staking: await getDeployedContract(hre, 'Staking'),
    stakingStorage: await getDeployedContract(hre, 'StakingStorage'),
    stakingKPI: await getDeployedContract(hre, 'StakingKPI'),
    token: await getDeployedContract(hre, 'Token'),
    migrator: await getDeployedContract(hre, 'Migrator'),
    delegatorsInfo: await getDeployedContract(hre, 'DelegatorsInfo'),
    hub: await getHubContract(hre),
    chronos: await getDeployedContract(hre, 'Chronos'),
    identityStorage: await getDeployedContract(hre, 'IdentityStorage'),
    profileStorage: await getDeployedContract(hre, 'ProfileStorage'),
    shardingTableStorage: await getDeployedContract(
      hre,
      'ShardingTableStorage',
    ),
    randomSampling: await getDeployedContract(hre, 'RandomSampling'),
    randomSamplingStorage: await getDeployedContract(
      hre,
      'RandomSamplingStorage',
    ),
    parametersStorage: await getDeployedContract(hre, 'ParametersStorage'),
    epochStorage: await getDeployedContract(hre, 'EpochStorageV8'),
    migratorM1V8: await getDeployedContract(hre, 'MigratorM1V8'),
  };
}

/**
 * Calculate scores for all active nodes in the sharding table
 * This implements the core scoring logic from the V8.1 Random Sampling system
 */
export async function calculateScoresForActiveNodes(
  hre: HardhatRuntimeEnvironment,
  contracts: { [key: string]: any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  proofingTimestamp: number,
  nodeEpochPublishingFactors: { [key: number]: { [key: number]: bigint } },
): Promise<{ identityId: number; stake: bigint; ask: bigint }[]> {
  console.log(
    `[CALCULATE SCORES] Calculating scores for active nodes at timestamp ${proofingTimestamp}`,
  );

  try {
    // Get current epoch and proof period start block
    const currentEpoch = await contracts.chronos.getCurrentEpoch();
    const activeNodesData: {
      identityId: number;
      stake: bigint;
      ask: bigint;
    }[] = [];

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
          (await contracts.randomSampling.calculateNodeScore(identityId)) +
          nodeEpochPublishingFactors[currentEpoch][identityId];

        if (score18 > 0) {
          const totalNodeStake =
            await contracts.stakingStorage.getNodeStake(identityId);
          const nodeAsk = await contracts.profileStorage.getAsk(identityId);
          activeNodesData.push({
            identityId,
            stake: totalNodeStake,
            ask: nodeAsk,
          });

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
            `   🖥️  Node ${identityId}: score=${hre.ethers.formatEther(score18)}`,
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
    return activeNodesData;
  } catch (error) {
    console.error(
      `[CALCULATE SCORES] Error calculating scores for active nodes: ${error}`,
    );
    throw error;
  }
}

export async function getNodeEpochPublishingFactors(
  contracts: { [key: string]: any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  chain: string,
): Promise<{
  nodeEpochPublishingFactors: {
    [epoch: number]: { [identityId: number]: bigint };
  };
  nodeEpochProducedKnowledgeValuePercentages: {
    [epoch: number]: { [identityId: number]: bigint };
  };
}> {
  console.log(
    `[GET NODE EPOCH PUBLISHING FACTORS] Getting node epoch publishing factors for chain ${chain}`,
  );
  // TODO: Change for V6
  const epochsList = [1, 2, 3, 4, 5];
  const nodeEpochPublishingFactors: {
    [epoch: number]: { [identityId: number]: bigint };
  } = {};
  const nodeEpochProducedKnowledgeValuePercentages: {
    [epoch: number]: { [identityId: number]: bigint };
  } = {};
  epochsList.forEach((epoch) => {
    nodeEpochPublishingFactors[epoch] = {};
    nodeEpochProducedKnowledgeValuePercentages[epoch] = {};
  });

  const rpc = new ethers.JsonRpcProvider(RPC_URLS[chain]);
  // StakingStorage ABI - only the functions we need
  const epochStorageAbi = [
    'function getEpochNodeMaxProducedKnowledgeValue(uint256 epoch) external view returns (uint96)',
    'function getNodeEpochProducedKnowledgeValue(uint72 identityId, uint256 epoch) external view returns (uint96)',
    'function getNodeEpochProducedKnowledgeValuePercentage(uint72 identityId, uint256 epoch) external view returns (uint256)',
  ];
  const mainnetEpochStorage = new ethers.Contract(
    await contracts.epochStorage.getAddress(),
    epochStorageAbi,
    rpc,
  );

  const mainnetIdentityStorageAbi = [
    'function lastIdentityId() external view returns (uint72)',
  ];
  const mainnetIdentityStorage = new ethers.Contract(
    await contracts.identityStorage.getAddress(),
    mainnetIdentityStorageAbi,
    rpc,
  );

  const lastIdentityId = await mainnetIdentityStorage.lastIdentityId();
  for (let epoch = 1; epoch <= epochsList.length; epoch++) {
    const maxNodePub =
      await mainnetEpochStorage.getEpochNodeMaxProducedKnowledgeValue(epoch);
    for (let identityId = 1; identityId <= lastIdentityId; identityId++) {
      const nodePublishingFactor18 = await calculateNodePublishingFactor(
        contracts,
        mainnetEpochStorage,
        identityId,
        epoch,
        maxNodePub,
      );
      nodeEpochPublishingFactors[epoch][identityId] = nodePublishingFactor18;

      const nodeEpochProducedKnowledgeValuePercentage =
        await mainnetEpochStorage.getNodeEpochProducedKnowledgeValuePercentage(
          identityId,
          epoch,
        );
      nodeEpochProducedKnowledgeValuePercentages[epoch][identityId] =
        nodeEpochProducedKnowledgeValuePercentage;
    }
  }
  console.log(
    `[GET NODE EPOCH PUBLISHING FACTORS] Node epoch publishing factors found for ${epochsList.length} epochs and ${lastIdentityId} identities`,
  );
  return {
    nodeEpochPublishingFactors,
    nodeEpochProducedKnowledgeValuePercentages,
  };
}

export async function calculateNodePublishingFactor(
  contracts: { [key: string]: any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  mainnetEpochStorage: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  identityId: number,
  epoch: number,
  maxNodePub: bigint,
) {
  const maximumStake = await contracts.parametersStorage.maximumStake();
  let nodeStake = await contracts.stakingStorage.getNodeStake(identityId);
  nodeStake = nodeStake > maximumStake ? maximumStake : nodeStake;
  const stakeRatio18 = (nodeStake * BigInt(10 ** 18)) / maximumStake;
  const nodeStakeFactor18 =
    (2n * stakeRatio18 * stakeRatio18) / BigInt(10 ** 18);

  const nodePub = await mainnetEpochStorage.getNodeEpochProducedKnowledgeValue(
    identityId,
    epoch,
  );
  const pubRatio18 = (nodePub * BigInt(10 ** 18)) / maxNodePub;
  const nodePublishingFactor18 =
    (nodeStakeFactor18 * pubRatio18) / BigInt(10 ** 18);
  return nodePublishingFactor18;
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
      `[MIGRATOR ALLOWANCE] Shares contract verified at ${sharesContractAddress}`,
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

      console.log(`[MIGRATOR ALLOWANCE] Executing approval transaction...`);

      try {
        console.log(`[MIGRATOR ALLOWANCE] About to call approve() with:`);
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

        console.log(`[MIGRATOR ALLOWANCE] Approve call succeeded`);

        console.log(`[MIGRATOR ALLOWANCE] Approval tx sent: ${approveTx.hash}`);
        console.log(
          `[MIGRATOR ALLOWANCE] Waiting for approval confirmation...`,
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
            `[MIGRATOR ALLOWANCE] Transaction included in block ${txStatus.blockNumber}`,
          );
        } else {
          console.log(
            `[MIGRATOR ALLOWANCE] ⚠️ Transaction not yet included in a block`,
          );
        }

        console.log(`[MIGRATOR ALLOWANCE] Calling txResponse.wait()...`);

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
          `[MIGRATOR ALLOWANCE] Approval confirmed in block ${receipt.blockNumber}`,
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
      console.log(`[MIGRATOR ALLOWANCE] Sufficient allowance already exists`);
    }
  } catch (error) {
    console.error(`[MIGRATOR ALLOWANCE] ❌ Failed to setup allowances:`, error);
    throw error;
  }
}

export async function migrateV6Delegators(
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

  // load the network delegatos json file
  const delegatorsFilePath = `simulation/${chain}_delegators.json`;
  const delegatorsFile: { identity: number; delegators: string[] }[] =
    JSON.parse(fs.readFileSync(delegatorsFilePath, 'utf8'));

  // Migrate mainnet delegators to the forked delegatorsInfo contract
  const maxIdentityId = await contracts.identityStorage.lastIdentityId();
  for (let identityId = 1; identityId <= maxIdentityId; identityId++) {
    // get delegators from the network
    const delegators = await delegatorsInfo.getDelegators(identityId);
    const delegatorsSet = new Set(
      delegators.map((d: string) => d.toLowerCase()),
    );

    // get delegators from the file
    const delegatorsFromFile = delegatorsFile.find(
      (d: { identity: number }) => d.identity === identityId,
    )?.delegators;
    // add delegators from the file to the set for the current identityId
    if (delegatorsFromFile) {
      delegatorsFromFile.forEach((d: string) =>
        delegatorsSet.add(d.toLowerCase()),
      );
    }

    console.log(
      `[MIGRATE V6 NODE DELEGATORS] Migrating ${delegatorsSet.size} delegators for identity ${identityId}`,
    );
    await contracts.delegatorsInfo.migrate(Array.from(delegatorsSet));
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

export async function migrateDelegator(
  hre: HardhatRuntimeEnvironment,
  contracts: { [key: string]: any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  delegatorAddress: string,
): Promise<void> {
  const hub = await getHubContract(hre);
  const hubOwner = await hub.owner();
  await impersonateAccount(hre, hubOwner);
  const signer = await hre.ethers.getSigner(hubOwner);
  const delegatorsInfoWithSigner = contracts.delegatorsInfo.connect(signer);
  await delegatorsInfoWithSigner.migrate([delegatorAddress]);
  await stopImpersonatingAccount(hre, hubOwner);
}

export async function addDelegator(
  hre: HardhatRuntimeEnvironment,
  contracts: { [key: string]: any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  identityId: number,
  delegatorAddress: string,
): Promise<void> {
  const hub = await getHubContract(hre);
  const hubOwner = await hub.owner();
  await impersonateAccount(hre, hubOwner);
  const signer = await hre.ethers.getSigner(hubOwner);
  const delegatorsInfoWithSigner = contracts.delegatorsInfo.connect(signer);
  await delegatorsInfoWithSigner.addDelegator(identityId, delegatorAddress);
  await stopImpersonatingAccount(hre, hubOwner);
}

export async function initializeProofingTimestamp(
  chain: string,
): Promise<number> {
  // Initialize proofing timestamp
  const rpc = new ethers.JsonRpcProvider(RPC_URLS[chain]);
  const startBlock = SIMULATION_CHAINS[chain].v8_0StartBlock;
  const startBlockTimestamp = await rpc
    .getBlock(startBlock)
    .then((block) => block?.timestamp);

  if (!startBlockTimestamp) {
    console.error(
      `[INIT] ❌ Failed to get start block timestamp for chain ${chain}`,
    );
    process.exit(1);
  }

  return startBlockTimestamp;
}

export async function getDelegatorReward(
  contracts: { [key: string]: any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  identityId: number,
  epoch: number,
  delegator: string,
  epochRewardsPool: bigint,
): Promise<bigint> {
  if (
    !(await contracts.delegatorsInfo.isNodeDelegator(identityId, delegator))
  ) {
    throw new Error(
      `Delegator not found for identity ${identityId} and delegator ${delegator}`,
    );
  }

  const delegatorKey = ethers.keccak256(
    ethers.solidityPacked(['address'], [delegator]),
  );

  // Don't need to call prepareForStakeChange for finished epochs, we already called it at the epoch transition
  if (!(await contracts.chronos.hasEpochElapsed(epoch))) {
    await contracts.staking._prepareForStakeChange(
      epoch,
      identityId,
      delegatorKey,
    );
  }

  const delegatorScore18 =
    await contracts.randomSamplingStorage.getEpochNodeDelegatorScore(
      epoch,
      identityId,
      delegatorKey,
    );
  if (delegatorScore18 == 0n) return 0n;

  const nodeScore18 = await contracts.randomSamplingStorage.getNodeEpochScore(
    epoch,
    identityId,
  );
  if (nodeScore18 == 0n) return 0n;

  // Calculate the final delegators rewards pool
  const netNodeRewards = await getNetNodeRewards(
    contracts,
    identityId,
    epoch,
    epochRewardsPool,
  );

  if (netNodeRewards == 0n) return 0n;

  return (delegatorScore18 * netNodeRewards) / nodeScore18;
}

export async function getNetNodeRewards(
  contracts: { [key: string]: any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  identityId: number,
  epoch: number,
  epochRewardsPool: bigint,
): Promise<bigint> {
  // If the operator fee has been claimed, return the net delegators rewards
  if (
    await contracts.delegatorsInfo.isOperatorFeeClaimedForEpoch(
      identityId,
      epoch,
    )
  ) {
    console.log(
      `[GET NET NODE REWARDS] Operator fee claimed for identity ${identityId} in epoch ${epoch} - check if this is correct`,
    );
    return await contracts.delegatorsInfo.getNetNodeEpochRewards(
      identityId,
      epoch,
    );
  }

  const nodeScore18 = await contracts.randomSamplingStorage.getNodeEpochScore(
    epoch,
    identityId,
  );
  if (nodeScore18 == 0n) return 0n;

  const allNodesScore18 =
    await contracts.randomSamplingStorage.getAllNodesEpochScore(epoch);
  if (allNodesScore18 == 0n) return 0n;

  const totalNodeRewards = (epochRewardsPool * nodeScore18) / allNodesScore18;

  const feePercentageForEpoch =
    await contracts.profileStorage.getLatestOperatorFeePercentage(identityId);
  const operatorFeeAmount =
    (totalNodeRewards * feePercentageForEpoch) / 10_000n;

  return totalNodeRewards - operatorFeeAmount;
}

export async function getOperatorRewards(
  contracts: { [key: string]: any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  identityId: number,
  epoch: number,
  epochRewardsPool: bigint,
): Promise<bigint> {
  const nodeScore18 = await contracts.randomSamplingStorage.getNodeEpochScore(
    epoch,
    identityId,
  );
  if (nodeScore18 == 0n) return 0n;

  const allNodesScore18 =
    await contracts.randomSamplingStorage.getAllNodesEpochScore(epoch);
  if (allNodesScore18 == 0n) return 0n;

  const totalNodeRewards = (epochRewardsPool * nodeScore18) / allNodesScore18;

  const feePercentageForEpoch =
    await contracts.profileStorage.getLatestOperatorFeePercentage(identityId);
  const operatorFeeAmount =
    (totalNodeRewards * feePercentageForEpoch) / 10_000n;

  return operatorFeeAmount;
}

export async function initializeEpochMetadata(
  contracts: { [key: string]: any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  chain: string,
): Promise<
  {
    epoch: number;
    startTs: number;
    endTs: number;
    rewardPool: string;
  }[]
> {
  const epochMetadata: {
    epoch: number;
    startTs: number;
    endTs: number;
    rewardPool: string;
  }[] = [];

  const provider = new ethers.JsonRpcProvider(RPC_URLS[chain]);
  const epochStorage = new ethers.Contract(
    await contracts.epochStorage.getAddress(),
    [
      'function getEpochPool(uint256 shardId, uint256 epoch) external view returns (uint96)',
    ],
    provider,
  );

  const chronos = new ethers.Contract(
    await contracts.chronos.getAddress(),
    [
      'function timestampForEpoch(uint256 epochNumber) external view returns (uint256)',
    ],
    provider,
  );

  // TODO: 5 epochs for V8 simulation, 7 epochs for v6 simulation
  for (let epoch = 1; epoch <= 5; epoch++) {
    const startTs = await chronos.timestampForEpoch(epoch);
    const endTs = await chronos.timestampForEpoch(epoch + 1);
    const rewardPool = await epochStorage.getEpochPool(1, epoch);
    epochMetadata.push({
      epoch,
      startTs,
      endTs,
      rewardPool: rewardPool.toString(),
    });
  }

  return epochMetadata;
}

export async function setupAllowances(
  hre: HardhatRuntimeEnvironment,
  contracts: { [key: string]: any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  tx: TransactionData,
): Promise<void> {
  if (
    tx.contract === 'Migrator' &&
    tx.functionName === 'migrateDelegatorData'
  ) {
    await setupMigratorAllowances(
      hre,
      contracts,
      tx.from,
      tx.functionInputs[0],
    );
  }

  if (tx.contract === 'Staking' && tx.functionName === 'stake') {
    await setupStakingAllowances(hre, contracts, tx.from, tx.functionInputs[1]);
  }
}

export async function calculateScoresForMigratedDelegators(
  contracts: { [key: string]: any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  tx: TransactionData,
): Promise<void> {
  if (tx.contract === 'Migrator' || tx.contract === 'MigratorM1V8') {
    const currentEpoch = await contracts.chronos.getCurrentEpoch();
    const identityId = Number(tx.functionInputs[0]);
    const delegator =
      tx.contract === 'Migrator' ? tx.from : tx.functionInputs[1];
    const delegatorKey = ethers.keccak256(
      ethers.solidityPacked(['address'], [delegator]),
    );

    // We migrated the whole node stake in Migrator.sol contract so even delegators who migrated later are accounted for and will have their scores settled for all epochs
    for (let epoch = 1; epoch <= currentEpoch; epoch++) {
      await contracts.staking._prepareForStakeChange(
        epoch,
        identityId,
        delegatorKey,
      );
    }
  }
}
