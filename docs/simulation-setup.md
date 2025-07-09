# DKG V8.0 to V8.1 Simulation Setup

This document explains how to configure and use the hardhat simulation environment for replaying historical rewards from the V8.0 to V8.1 period.

## Overview

The simulation setup allows you to:

- Fork mainnet chains (Base, Neuroweb, Gnosis) from their V8.0 start blocks
- Replay historical transactions with precise timing control
- Calculate rewards exactly as they would have been in V8.1
- Export results for the V8.1.2 reward distribution contracts

## Configuration Files

### Key Files Created

1. **`constants/simulation-blocks.ts`** - Block numbers, timestamps, and chain configurations
2. **`hardhat.simulation.config.ts`** - Specialized hardhat configuration for simulation
3. **`scripts/test-simulation-config.ts`** - Validation script for the setup
4. **`scripts/start-forked-nodes.sh`** - Helper script to easily start forked nodes
5. **`docs/simulation-setup.md`** - This documentation file

## Prerequisites

### Environment Variables

Make sure you have the following RPC endpoints configured in your `.env` file:

```bash
# Base Mainnet RPC
RPC_BASE_MAINNET=https://your-base-mainnet-rpc-url

# Neuroweb Mainnet RPC
RPC_NEUROWEB_MAINNET=https://your-neuroweb-mainnet-rpc-url

# Gnosis Mainnet RPC
RPC_GNOSIS_MAINNET=https://your-gnosis-mainnet-rpc-url
```

**Important**: The RPC endpoints must support historical state access and archival data for the entire V8.0 to V8.1 period.

### Block Numbers & Timestamps

| Chain            | V8.0 Start Block | V8.1 Start Block |
| ---------------- | ---------------- | ---------------- |
| Base Mainnet     | 24,189,831       | 32,076,123       |
| Neuroweb Mainnet | 7,237,897        | 9,819,203        |
| Gnosis Mainnet   | 37,713,034       | 40,781,172       |

## Usage

### Method 1: Running Forked Node in Terminal (Recommended)

This approach lets you run a forked node in the terminal and connect to it from scripts:

#### Start Forked Nodes

**Using the Helper Script (Recommended):**

```bash
# Start Base mainnet fork
./scripts/start-forked-nodes.sh base

# Start Neuroweb mainnet fork (different terminal)
./scripts/start-forked-nodes.sh neuroweb

# Start Gnosis mainnet fork (different terminal)
./scripts/start-forked-nodes.sh gnosis
```

**Manual Commands:**

```bash
# Start Base mainnet fork
HARDHAT_FORK_URL=$RPC_BASE_MAINNET HARDHAT_FORK_BLOCK=24189831 npx hardhat node --config hardhat.simulation.config.ts --port 8545

# Start Neuroweb mainnet fork (different terminal)
HARDHAT_FORK_URL=$RPC_NEUROWEB_MAINNET HARDHAT_FORK_BLOCK=7237897 npx hardhat node --config hardhat.simulation.config.ts --port 8546

# Start Gnosis mainnet fork (different terminal)
HARDHAT_FORK_URL=$RPC_GNOSIS_MAINNET HARDHAT_FORK_BLOCK=37713034 npx hardhat node --config hardhat.simulation.config.ts --port 8547
```

#### Connect to Forked Nodes

```bash
# Test connection to localhost (Base fork on port 8545)
npx hardhat run scripts/test-simulation-config.ts --config hardhat.simulation.config.ts --network localhost

# Run your simulation script against the forked node
npx hardhat run scripts/your-simulation-script.ts --config hardhat.simulation.config.ts --network localhost
```

### Method 2: Direct Network Connection

Test the simulation configuration for each chain directly:

```bash
# Test Base mainnet simulation
npx hardhat run scripts/test-simulation-config.ts --config hardhat.simulation.config.ts --network base_mainnet_simulation

# Test Neuroweb mainnet simulation
npx hardhat run scripts/test-simulation-config.ts --config hardhat.simulation.config.ts --network neuroweb_mainnet_simulation

# Test Gnosis mainnet simulation
npx hardhat run scripts/test-simulation-config.ts --config hardhat.simulation.config.ts --network gnosis_mainnet_simulation
```

### Expected Test Output

The test script will verify:

- ✅ Correct block number and timestamp
- ✅ Proper chain ID
- ✅ Auto-mining is disabled
- ✅ Manual mining works
- ✅ Time control functions work
- ✅ Hub contract exists at expected address
- ✅ Forked chain accounts are accessible

## Network Configurations

### Configuration Benefits

**Environment**: All networks use `environment: 'mainnet'` to match the actual mainnet conditions being simulated.

**Accounts**: No account configuration is specified, meaning:

- ✅ All accounts from the forked chain are available
- ✅ Historical account balances are preserved
- ✅ Can impersonate any address that had funds/tokens on the forked block
- ✅ No artificial limitations on account access

**Mining**: Auto-mining is disabled (`auto: false`) for precise control over:

- ✅ Event sequencing within blocks
- ✅ Time-based rewards calculations
- ✅ 30-minute proof period simulations

### Base Mainnet Simulation (`base_mainnet_simulation`)

- **Chain ID**: 8453
- **Fork Block**: 24,189,831 (V8.0 Hub deployment)
- **Gas Limit**: 30,000,000
- **Gas Price**: 1 gwei

### Neuroweb Mainnet Simulation (`neuroweb_mainnet_simulation`)

- **Chain ID**: 2043
- **Fork Block**: 7,237,897 (V8.0 Hub deployment)
- **Gas Limit**: 10,000,000
- **Gas Price**: 100 wei

### Gnosis Mainnet Simulation (`gnosis_mainnet_simulation`)

- **Chain ID**: 100
- **Fork Block**: 37,713,034 (V8.0 Hub deployment)
- **Gas Limit**: 17,000,000
- **Gas Price**: 2 gwei

## Key Features

### Manual Mining Control

Auto-mining is disabled on all simulation networks. Use these commands to control block production:

```typescript
// Mine a single block
await provider.send('evm_mine', []);

// Mine multiple blocks
await provider.send('hardhat_mine', [blockCount]);

// Enable/disable auto-mining
await provider.send('evm_setAutomine', [true / false]);
```

### Time Control

Precise time control for event sequencing:

```typescript
// Increase time by seconds
await provider.send('evm_increaseTime', [seconds]);

// Set specific timestamp
await provider.send('evm_setNextBlockTimestamp', [timestamp]);

// Mine block with the new timestamp
await provider.send('evm_mine', []);
```

### Account Impersonation

For replaying historical transactions:

```typescript
// Impersonate any address
await provider.send('hardhat_impersonateAccount', [address]);

// Stop impersonating
await provider.send('hardhat_stopImpersonatingAccount', [address]);
```

## Contract Addresses

### Hub Contract Addresses (V8.0 Start)

- **Base**: `0x99Aa571fD5e681c2D27ee08A7b7989DB02541d13`
- **Neuroweb**: `0x0957e25BD33034948abc28204ddA54b6E1142D6F`
- **Gnosis**: `0x882D0BF07F956b1b94BBfe9E77F47c6fc7D4EC8f`

All other contract addresses are available in the `deployments/` directory.

## Troubleshooting

### Common Issues

1. **RPC Rate Limiting**

   - Use multiple RPC endpoints
   - Implement retry logic
   - Consider using paid RPC providers

2. **Memory Issues**

   - Increase Node.js memory limit: `node --max-old-space-size=8192`
   - Use checkpointing for large simulations
   - Process events in batches

3. **Historical Data Unavailable**

   - Ensure RPC supports archival data
   - Verify block numbers are correct
   - Check if pruning affects required blocks

4. **Fork Failures**
   - Verify RPC endpoint accessibility
   - Check network connectivity
   - Ensure sufficient disk space

### Performance Tips

1. **Batch Processing**: Process events in batches to improve performance
2. **Checkpointing**: Save state periodically during long simulations
3. **Parallel Processing**: Use multiple networks simultaneously where possible
4. **Memory Management**: Monitor memory usage and implement cleanup

## Next Steps

After completing this setup, you can proceed to:

1. Implement the simulation script for rewards calculation
2. Add database helpers for event processing
3. Create score calculation and Random Sampling helpers
4. Build the sequential event loop logic
5. Implement export builders for output JSONs

## Support

For issues or questions:

1. Check the troubleshooting section above
2. Review the test output for specific error messages
3. Verify environment variables and RPC endpoints
4. Ensure all prerequisites are met
