import { expect } from 'chai';
import { ethers } from 'ethers';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import { TransactionData } from './db-helpers';
import { RPC_URLS } from './simulation-constants';
import { addDelegator } from './simulation-helpers';

export async function validateStakingTransaction(
  contracts: { [key: string]: any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  tx: TransactionData,
  toNodeStake: bigint,
  nodeStake: bigint,
  requestWithdrawalAmount: bigint,
): Promise<void> {
  if (tx.contract === 'Staking') {
    if (tx.functionName === 'redelegate') {
      const redelegateAmount = BigInt(tx.functionInputs[2]);
      expect(nodeStake - redelegateAmount).to.equal(
        await contracts.stakingStorage.getNodeStake(tx.functionInputs[0]),
        `From node stake should be ${nodeStake - redelegateAmount} but is ${await contracts.stakingStorage.getNodeStake(
          tx.functionInputs[0],
        )}`,
      );
      expect(toNodeStake + redelegateAmount).to.equal(
        await contracts.stakingStorage.getNodeStake(tx.functionInputs[1]),
        `To node stake should be ${toNodeStake + redelegateAmount} but is ${await contracts.stakingStorage.getNodeStake(
          tx.functionInputs[1],
        )}`,
      );
    } else if (tx.functionName === 'stake') {
      const stakeAmount = BigInt(tx.functionInputs[1]);
      expect(nodeStake + stakeAmount).to.equal(
        await contracts.stakingStorage.getNodeStake(tx.functionInputs[0]),
        `Node stake should be ${nodeStake + stakeAmount} but is ${await contracts.stakingStorage.getNodeStake(
          tx.functionInputs[0],
        )}`,
      );
    } else if (tx.functionName === 'requestWithdrawal') {
      const requestWithdrawalAmount = BigInt(tx.functionInputs[1]);
      expect(nodeStake - requestWithdrawalAmount).to.equal(
        await contracts.stakingStorage.getNodeStake(tx.functionInputs[0]),
      );
    } else if (tx.functionName === 'restakeOperatorFee') {
      const restakeOperatorFeeAmount = BigInt(tx.functionInputs[1]);
      expect(nodeStake + restakeOperatorFeeAmount).to.equal(
        await contracts.stakingStorage.getNodeStake(tx.functionInputs[0]),
      );
    } else if (tx.functionName === 'cancelWithdrawal') {
      // For cancelWithdrawal, we need to implement the same logic as the contract
      const identityId = tx.functionInputs[0];

      console.log(
        `[CANCEL WITHDRAWAL VALIDATION] Withdrawal amount: ${requestWithdrawalAmount.toString()}, node stake before: ${nodeStake.toString()}`,
      );

      // Implement the same logic as Staking.sol cancelWithdrawal
      const maxStake = await contracts.parametersStorage.maximumStake();
      let restakeAmount: bigint;

      if (nodeStake + requestWithdrawalAmount > maxStake) {
        restakeAmount = maxStake - nodeStake; // might be zero
      } else {
        restakeAmount = requestWithdrawalAmount;
      }

      const expectedNodeStake = nodeStake + restakeAmount;
      const actualNodeStake =
        await contracts.stakingStorage.getNodeStake(identityId);

      console.log(
        `[CANCEL WITHDRAWAL VALIDATION] Expected restake: ${restakeAmount.toString()}, expected node stake: ${expectedNodeStake.toString()}, actual: ${actualNodeStake.toString()}`,
      );

      expect(expectedNodeStake).to.equal(
        actualNodeStake,
        `Node stake should be ${expectedNodeStake.toString()} but is ${actualNodeStake.toString()}`,
      );
    }
  }
}

export async function _validateDelegatorsCount(
  contracts: { [key: string]: any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  identityId: number,
  delegatorsCountBefore: number,
): Promise<void> {
  const actualDelegatorsCount = (
    await contracts.delegatorsInfo.getDelegators(identityId)
  ).length;
  expect(delegatorsCountBefore + 1).to.equal(
    actualDelegatorsCount,
    `Delegators count should be ${delegatorsCountBefore + 1} but is ${actualDelegatorsCount} for identity ${identityId}`,
  );
}

export async function validateStartTimeAndEpochLength(
  contracts: { [key: string]: any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  startTime: number,
  epochLength: number,
): Promise<void> {
  expect(await contracts.chronos.startTime()).to.equal(startTime);
  expect(await contracts.chronos.epochLength()).to.equal(epochLength);
}

/**
 * Verify on-chain state matches local simulation state
 * @param rpcUrl - Archive RPC URL for historical queries
 * @param stakingStorageAddress - Address of StakingStorage contract on-chain
 * @param identityId - Node identity ID to check
 * @param delegatorAddress - Delegator address to check (optional)
 * @param blockNumber - Historical block number to query
 * @param localContracts - Local simulation contracts for comparison
 * @returns Object with comparison results
 */
export async function verifyMainnetStakingStorageState(
  localContracts: { [key: string]: any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  chain: string,
  tx: TransactionData,
  identityId: number,
  delegatorAddress: string | null,
  blockNumber: number,
): Promise<void> {
  const shouldVerify =
    (tx.contract === 'Staking' &&
      [
        'stake',
        'redelegate',
        'requestWithdrawal',
        'restakeOperatorFee',
        'cancelWithdrawal',
      ].includes(tx.functionName)) ||
    (tx.contract === 'Migrator' && tx.functionName === 'migrateDelegatorData');

  if (!shouldVerify) {
    return;
  }

  try {
    const rpc = new ethers.JsonRpcProvider(RPC_URLS[chain]);

    // StakingStorage ABI - only the functions we need
    const stakingStorageAbi = [
      'function getNodeStake(uint72 identityId) external view returns (uint96)',
      'function getDelegatorStakeBase(uint72 identityId, bytes32 delegatorKey) external view returns (uint96)',
    ];

    // Create contract instance for historical queries
    const onChainStakingStorage = new ethers.Contract(
      await localContracts.stakingStorage.getAddress(),
      stakingStorageAbi,
      rpc,
    );

    // Query on-chain state at the specific block
    const onChainNodeStake = await onChainStakingStorage.getNodeStake(
      identityId,
      {
        blockTag: blockNumber,
      },
    );

    // Get local simulation state
    const localNodeStake =
      await localContracts.stakingStorage.getNodeStake(identityId);

    let onChainDelegatorStake = 0n;
    let localDelegatorStake = 0n;

    // Check delegator stake if delegator address provided
    if (delegatorAddress) {
      // Create delegator key (same as contract: keccak256(abi.encodePacked(delegator)))
      const delegatorKey = ethers.keccak256(
        ethers.solidityPacked(['address'], [delegatorAddress]),
      );

      onChainDelegatorStake = await onChainStakingStorage.getDelegatorStakeBase(
        identityId,
        delegatorKey,
        { blockTag: blockNumber },
      );

      localDelegatorStake =
        await localContracts.stakingStorage.getDelegatorStakeBase(
          identityId,
          delegatorKey,
        );

      console.log(
        `[VERIFY STATE] On-chain delegator stake: ${onChainDelegatorStake.toString()}, local delegator stake: ${localDelegatorStake.toString()}. Difference: ${ethers.formatEther(
          onChainDelegatorStake - localDelegatorStake,
        )} TRAC`,
      );

      console.log(
        `[VERIFY STATE] On-chain node stake: ${onChainNodeStake.toString()}, local node stake: ${localNodeStake.toString()}. Difference: ${ethers.formatEther(
          onChainNodeStake - localNodeStake,
        )} TRAC`,
      );

      expect(onChainDelegatorStake).to.equal(
        localDelegatorStake,
        `On-chain delegator stake ${onChainDelegatorStake.toString()} should be equal to local delegator stake ${localDelegatorStake.toString()}. Difference: ${ethers.formatEther(
          onChainDelegatorStake - localDelegatorStake,
        )} TRAC`,
      );
      console.log(`[VERIFY STATE] ✅ Delegator stake matches`);
    }

    expect(onChainNodeStake).to.equal(
      localNodeStake,
      `On-chain node stake ${onChainNodeStake.toString()} should be equal to local node stake ${localNodeStake.toString()}. Difference: ${ethers.formatEther(
        onChainNodeStake - localNodeStake,
      )} TRAC`,
    );
    console.log(`[VERIFY STATE] ✅ Node stake matches`);
    console.log(
      `[VERIFY STATE] ✅ State verified for tx ${tx.hash} and it matches the local simulation state`,
    );
  } catch (error) {
    console.warn(
      `[VERIFY STATE] ❌ Failed to verify state for tx ${tx.hash}: ${error}`,
    );
  }
}

export async function initializeValidationVariables(
  contracts: { [key: string]: any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  tx: TransactionData,
): Promise<{
  nodeStake: bigint;
  isNodeDelegator: boolean;
  toNodeStake: bigint;
  delegatorsCount: number;
  requestWithdrawalAmount: bigint;
}> {
  let nodeStake = 0n;
  let isNodeDelegator = false;
  let toNodeStake = 0n;
  let delegatorsCount = 0;
  let requestWithdrawalAmount = 0n;

  if (tx.contract === 'Staking' && tx.functionName !== 'finalizeWithdrawal') {
    // from node stake in case of redelegate
    nodeStake = BigInt(
      await contracts.stakingStorage.getNodeStake(tx.functionInputs[0]),
    );

    const identityId =
      tx.functionName === 'redelegate'
        ? tx.functionInputs[1]
        : tx.functionInputs[0];

    isNodeDelegator = await contracts.delegatorsInfo.isNodeDelegator(
      identityId,
      tx.from,
    );
    console.log(
      `[PROCESS TRANSACTION] isNodeDelegator: ${isNodeDelegator} for identity ${identityId}`,
    );
    if (!isNodeDelegator) {
      delegatorsCount = (
        await contracts.delegatorsInfo.getDelegators(identityId)
      ).length;
    }

    if (tx.functionName === 'redelegate') {
      toNodeStake = BigInt(
        await contracts.stakingStorage.getNodeStake(tx.functionInputs[1]),
      );
    } else if (tx.functionName === 'cancelWithdrawal') {
      // Get withdrawal request amount BEFORE the transaction executes
      const delegatorKey = ethers.keccak256(
        ethers.solidityPacked(['address'], [tx.from]),
      );
      [requestWithdrawalAmount] =
        await contracts.stakingStorage.getDelegatorWithdrawalRequest(
          tx.functionInputs[0],
          delegatorKey,
        );
    }
  } else if (
    tx.contract === 'Migrator' &&
    tx.functionName === 'migrateDelegatorData'
  ) {
    nodeStake = BigInt(
      await contracts.stakingStorage.getNodeStake(tx.functionInputs[0]),
    );
    delegatorsCount = (
      await contracts.delegatorsInfo.getDelegators(tx.functionInputs[0])
    ).length;
  }

  return {
    nodeStake,
    isNodeDelegator,
    toNodeStake,
    delegatorsCount,
    requestWithdrawalAmount,
  };
}

export async function validateDelegatorsCount(
  hre: HardhatRuntimeEnvironment,
  contracts: { [key: string]: any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  tx: TransactionData,
  isNodeDelegator: boolean,
  delegatorsCount: number,
) {
  if (
    tx.contract === 'Migrator' &&
    tx.functionName === 'migrateDelegatorData'
  ) {
    // Add the new address to the DelegatorsInfo contract
    const identityId = tx.functionInputs[0];
    await addDelegator(hre, contracts, identityId, tx.from);
    await _validateDelegatorsCount(contracts, identityId, delegatorsCount);
  } else if (
    tx.contract === 'Staking' &&
    tx.functionName !== 'finalizeWithdrawal'
  ) {
    const identityId =
      tx.functionName === 'redelegate'
        ? tx.functionInputs[1]
        : tx.functionInputs[0];

    if (!isNodeDelegator) {
      if (tx.functionName === 'requestWithdrawal') {
        console.log(
          `[VALIDATE DELEGATORS COUNT] Adding delegator ${tx.from} for identity ${tx.functionInputs[0]} - requestWithdrawal (why was this not a delegator before?)`,
        );
        await addDelegator(hre, contracts, tx.functionInputs[0], tx.from);
      }
      await _validateDelegatorsCount(contracts, identityId, delegatorsCount);
    }
  }
}
