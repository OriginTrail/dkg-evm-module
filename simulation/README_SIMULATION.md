# DKG V8.0 to V8.1 Simulation Setup

This document explains how to configure and use the hardhat simulation environment for replaying historical rewards from the V8.0 to V8.1 period.

## ⚠️ Before You Start

### Required Files & Configuration

1. **Database Files**: Ensure you have the transaction database files:

   ```bash
   # Required in project root:
   ./decoded_transactions_base_mainnet.db      # For Base chain
   ./decoded_transactions_neuroweb_mainnet.db  # For Neuroweb chain (if available)
   ./decoded_transactions_gnosis_mainnet.db    # For Gnosis chain (if available)
   ```

2. **Environment Variables**: Configure RPC endpoints in `.env`:

   ```bash
   # Required for Base (archival node with historical data)
   RPC_BASE_MAINNET=https://your-base-mainnet-archival-rpc-url

   # Optional for other chains
   RPC_NEUROWEB_MAINNET=https://your-neuroweb-mainnet-rpc-url
   RPC_GNOSIS_MAINNET=https://your-gnosis-mainnet-rpc-url
   ```

3. **Dependencies**: Install all packages:
   ```bash
   npm install
   ```

### Important Notes

- **RPC Requirements**: Your RPC endpoint MUST support archival data for blocks 24,450,127+ on Base
- **Database Path**: The simulation script currently hardcodes `./decoded_transactions_base_mainnet.db`
- **Chain Selection**: To run other chains, update the `dbPath` variable in `simulation/historical-rewards-simulation.ts`
- **Disk Space**: Forked nodes can use 1-2GB of space during operation
- **Memory**: Consider increasing Node.js memory: `node --max-old-space-size=8192`

### ⚠️ Critical Checks

**Before running the simulation:**

1. ✅ Database file exists in project root
2. ✅ RPC endpoint supports historical blocks (test with `eth_getBlockByNumber` for block 24189831)
3. ✅ Sufficient disk space (2GB+ recommended)
4. ✅ Stable internet connection (will download historical state)

### 🚨 Warning Signs to Watch For

**If you see these during setup, STOP and fix before proceeding:**

- **Database not found**: `Error: ENOENT: no such file or directory` → Check database file location
- **RPC returns null**: Block 24277327 returns `null` → Your RPC doesn't support archival data
- **Environment variable missing**: `RPC_BASE_MAINNET environment variable not set` → Check `.env` file
- **Port conflicts**: `address already in use` → Kill existing processes or use different port
- **Module not found**: `Cannot find module` → Run `npm install`
- **Fork fails immediately**: Connection errors → Check RPC endpoint and network connectivity

### 🔍 Verify Setup

**Test your RPC endpoint:**

```bash
# Test if your RPC supports the required historical block
curl -X POST $RPC_BASE_MAINNET \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_getBlockByNumber","params":["0x1754C7F", false],"id":1}'

# Should return block data for 24277327, not null
```

**Check database file:**

```bash
# Verify database exists and is readable
ls -la decoded_transactions_base_mainnet.db

# Quick database check (requires sqlite3)
sqlite3 decoded_transactions_base_mainnet.db "SELECT COUNT(*) FROM enriched_events_withoutNodeStakeUpdated;"
# Should show 513 transactions
```

**Test foundation components:**

```bash
# Test without network (database only)
npx hardhat test-simulation-foundation --config hardhat.simulation.config.ts --network hardhat
```

## 🚀 Quick Start

```bash
# Terminal 1: Start forked node
./simulation/start-forked-nodes.sh base

# Terminal 2: Run simulation
npx hardhat run simulation/historical-rewards-simulation.ts --config hardhat.simulation.config.ts --network localhost
```

## 🧪 Testing & Validation

### **Testing Components**

The simulation includes two main testing approaches:

#### **1. Foundation Testing**

- **`simulation/tests/test-foundation.ts`** - Tests core simulation components
  - Tests database operations
  - Tests mining control
  - Tests time control
  - Tests network setup

#### **2. Contract Validation**

- **`simulation/tests/test-hardhat-setup.ts`** - Validates contract deployments and setup
  - Verifies all contracts are deployed correctly
  - Checks contract functionality and data
  - Validates storage contracts have migration data
  - Tests Hub registry and contract relationships

### **Core Components**

- **`simulation/helpers/db-helpers.ts`** - Database operations and utilities
- **`simulation/helpers/mining-controller.ts`** - Mining and time control (focused on core functionality)
- **`simulation/helpers/blockchain-helpers.ts`** - Contract deployment and verification
- **`simulation/historical-rewards-simulation.ts`** - Main simulation runner

### **How to Run Tests**

#### **Option 1: Database-Only Tests (Quick)**

```bash
npx hardhat test-simulation-foundation --network hardhat
```

**Tests:** ✅ Database operations only

#### **Option 2: Full Test Suite (Comprehensive)**

```bash
# Terminal 1: Start forked node
./simulation/start-forked-nodes.sh base

# Terminal 2: Run all tests
npx hardhat test-simulation-foundation --config hardhat.simulation.config.ts --network localhost
```

**Tests:** ✅ Database + Mining + Time + Network

#### **Option 3: Contract Validation (Recommended after setup)**

```bash
# Terminal 1: Start forked node
./simulation/start-forked-nodes.sh base

# Terminal 2: Run validation
./simulation/tests/run-hardhat-setup-test.sh
```

**Tests:** ✅ Contract deployments + Functionality + Data validation

### **What Each Test Does**

#### **Database Tests**

- ✅ Loads and queries 513 historical transactions
- ✅ Tests transaction ordering by block
- ✅ Validates database schema
- ✅ Shows transaction statistics

#### **Network Tests** _(requires forked node)_

- ✅ Verifies network connection
- ✅ Checks forked block height
- ✅ Shows account balances
- ✅ Tests chain ID

#### **Mining Tests** _(requires forked node)_

- ✅ Auto-mining disable/enable
- ✅ Manual block mining
- ✅ Block progression validation

#### **Time Tests** _(requires forked node)_

- ✅ EVM time manipulation
- ✅ Timestamp increase validation
- ✅ Time + mining coordination

#### **Contract Validation Tests** _(requires forked node)_

- ✅ Hub registry and contract relationships
- ✅ Token contract functionality and balances
- ✅ Storage contracts (StakingStorage, ProfileStorage, IdentityStorage, etc.)
- ✅ Contract data validation (identities, profiles, staking data)
- ✅ Paranet contracts and registries
- ✅ Random sampling and knowledge collection contracts

### **Expected Test Output**

#### **Database-Only (--network hardhat)**

```
🧪 Testing Simulation Foundation Components
Network: hardhat
Provider: hardhat

🧪 Testing Database Operations...
   Database file: ./decoded_transactions_base_mainnet.db
   ✅ Database loaded successfully
   📊 Total transactions: 513
   📦 Unique blocks: 452
   🔢 Block range: 24,223,289 to 32,075,071
   ✅ Database operations test completed

⚠️  Skipping network tests (running on hardhat network)
   To test mining/network features, run against localhost with forked node

🎯 All foundation tests completed successfully!
```

#### **Full Test Suite (--network localhost)**

```
🧪 Testing Simulation Foundation Components
Network: localhost
Provider: http://127.0.0.1:8545

🧪 Testing Database Operations...
   ✅ Database operations test completed

🧪 Testing Network Setup...
   Chain ID: 8453
   Current Block: 32,075,071
   Block Timestamp: 1734566447
   Available Accounts: 10
   First Account Balance: 10000.0 ETH
   ✅ Network setup test completed

🧪 Testing Mining Control...
   Initial block: 32,075,071
   ✅ Auto-mining control working
   ✅ Manual mining working
   ✅ Mining control test completed

🧪 Testing Time Control...
   Initial timestamp: 1734566447
   ✅ Time control working (increased by 3600 seconds)
   ✅ Time control test completed

🎯 All foundation tests completed successfully!

📋 Summary:
   ✅ Database operations working
   ✅ Network connection working
   ✅ Mining control working
   ✅ Time control working
```

## Overview

The simulation setup allows you to:

- Fork mainnet chains (Base, Neuroweb, Gnosis) from their V8.0 start blocks
- Replay historical transactions with precise timing control
- Calculate rewards exactly as they would have been in V8.1
- Export results for the V8.1.2 reward distribution contracts

## Configuration Files

### Key Files Created

1. **`constants/simulation-constants.ts`** - Block numbers, timestamps, and chain configurations
2. **`hardhat.simulation.config.ts`** - Specialized hardhat configuration for simulation
3. **`simulation/historical-rewards-simulation.ts`** - Main simulation script
4. **`simulation/helpers/db-helpers.ts`** - Database operations and transaction processing
5. **`simulation/helpers/mining-controller.ts`** - Mining and time control utilities
6. **`simulation/helpers/simulation-helpers.ts`** - Simulation-specific logic (scoring, validation)
7. **`simulation/tests/test-hardhat-setup.ts`** - Contract validation and setup verification
8. **`simulation/start-forked-nodes.sh`** - Helper script to easily start forked nodes

## Simulation Structure

The simulation is organized into modular components with a clear folder structure:

### Folder Organization

```
simulation/
├── helpers/                    # Core helper modules
│   ├── blockchain-helpers.ts   # Contract deployment and verification
│   ├── db-helpers.ts          # Database operations and transaction processing
│   ├── mining-controller.ts   # Mining and time control utilities
│   ├── simulation-helpers.ts  # Simulation-specific logic (scoring, validation)
│   └── constants.ts           # Configuration values and constants
├── tests/                     # Testing and validation scripts
│   ├── test-foundation.ts     # Foundation testing (database, mining, time)
│   ├── test-hardhat-setup.ts  # Contract validation and setup verification
│   └── run-hardhat-setup-test.sh  # Validation script runner
├── start-forked-nodes.sh      # Helper script to start forked nodes
├── historical-rewards-simulation.ts  # Main simulation script
└── README_SIMULATION.md       # This documentation
```

### Component Responsibilities

- **`HistoricalRewardsSimulation`** - Main simulation class in `simulation/historical-rewards-simulation.ts`
- **`SimulationDatabase`** - Database operations in `simulation/helpers/db-helpers.ts`
- **`MiningController`** - Mining and time control in `simulation/helpers/mining-controller.ts`
- **`ContractValidator`** - Contract validation in `simulation/tests/test-hardhat-setup.ts`
- **Simulation Helpers** - Scoring calculations and validation in `simulation/helpers/simulation-helpers.ts`
- **Constants** - Configuration values in `simulation/helpers/constants.ts`

Each component is focused on a specific responsibility, making the code easy to review and maintain.

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
| Base Mainnet     | 24,450,127       | 32,076,123       |
| Neuroweb Mainnet | 7,237,897        | 9,819,203        |
| Gnosis Mainnet   | 37,713,034       | 40,781,172       |

## Usage

### Method 1: Running Forked Node in Terminal (Recommended)

This approach lets you run a forked node in the terminal and connect to it from scripts:

#### Start Forked Nodes

**Using the Helper Script (Recommended):**

```bash
# Start Base mainnet fork
./simulation/start-forked-nodes.sh base

# Start Neuroweb mainnet fork (different terminal)
./simulation/start-forked-nodes.sh neuroweb

# Start Gnosis mainnet fork (different terminal)
./simulation/start-forked-nodes.sh gnosis
```

**Manual Commands:**

```bash
# Start Base mainnet fork
HARDHAT_FORK_URL=$RPC_BASE_MAINNET HARDHAT_FORK_BLOCK=24277327 npx hardhat node --config hardhat.simulation.config.ts --port 8545

# Start Neuroweb mainnet fork (different terminal)
HARDHAT_FORK_URL=$RPC_NEUROWEB_MAINNET HARDHAT_FORK_BLOCK=7237897 npx hardhat node --config hardhat.simulation.config.ts --port 8546

# Start Gnosis mainnet fork (different terminal)
HARDHAT_FORK_URL=$RPC_GNOSIS_MAINNET HARDHAT_FORK_BLOCK=37713034 npx hardhat node --config hardhat.simulation.config.ts --port 8547
```

#### Connect to Forked Nodes

```bash
# Test foundation components (database helpers, mining control)
npx hardhat test-simulation-foundation --config hardhat.simulation.config.ts --network localhost

# Run the main simulation script against the forked node
npx hardhat run simulation/historical-rewards-simulation.ts --config hardhat.simulation.config.ts --network localhost
```

### Method 2: Test Foundation Components

Test the simulation foundation components:

```bash
# Test database helpers and mining controller against localhost
npx hardhat test-simulation-foundation --config hardhat.simulation.config.ts --network localhost

# Test just database helpers (without network connection)
npx hardhat test-simulation-foundation --config hardhat.simulation.config.ts --network hardhat
```

## Quick Start Commands

### Complete Workflow

**Step 1**: Start forked node (Terminal 1)

```bash
./scripts/start-forked-nodes.sh base
```

**Step 2**: Run simulation (Terminal 2)

```bash
npx hardhat run simulation/historical-rewards-simulation.ts --config hardhat.simulation.config.ts --network localhost
```

### Testing Foundation Components

```bash
# Test foundation components
npx hardhat test-simulation-foundation --config hardhat.simulation.config.ts --network localhost
```

### For Other Chains

**Neuroweb:**

```bash
# Terminal 1
./simulation/start-forked-nodes.sh neuroweb

# Terminal 2 (update dbPath in simulation script to neuroweb database)
npx hardhat run simulation/historical-rewards-simulation.ts --config hardhat.simulation.config.ts --network localhost
```

**Gnosis:**

```bash
# Terminal 1
./simulation/start-forked-nodes.sh gnosis

# Terminal 2 (update dbPath in simulation script to gnosis database)
npx hardhat run simulation/historical-rewards-simulation.ts --config hardhat.simulation.config.ts --network localhost
```

## Network Configurations

### Configuration Benefits

**Environment**: All networks use `environment: 'mainnet'` to match the actual mainnet conditions being simulated.

**Accounts**: No account configuration is specified, meaning:

- ✅ All accounts from the forked chain are available
- ✅ Historical account balances are preserved
- ✅ Can impersonate any address that had funds/tokens on the forked block
- ✅ No artificial limitations on account access

**Mining**: Auto-mining is configured (`auto: true` without interval) for precise control over:

- ✅ Deployments can trigger mining automatically
- ✅ Manual control via RPC calls during simulation
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

### Setup Issues (Before Quickstart)

1. **Database File Missing**

   ```bash
   # Error: Cannot find database file
   Error: ENOENT: no such file or directory, open './decoded_transactions_base_mainnet.db'

   # Solution: Ensure database file is in project root
   ls -la *.db
   ```

2. **RPC Endpoint Issues**

   ```bash
   # Error: RPC method unsupported or null response
   Error: ProviderError: rpc method is unsupported

   # Solution: Use archival RPC endpoint that supports historical blocks
   # Test with: curl -X POST $RPC_BASE_MAINNET -H "Content-Type: application/json" \
   #   -d '{"jsonrpc":"2.0","method":"eth_getBlockByNumber","params":["0x170E637", false],"id":1}'
   ```

3. **Environment Variables Not Set**

   ```bash
   # Error: RPC endpoint not configured
   Error: RPC_BASE_MAINNET environment variable not set

   # Solution: Check .env file exists and contains required variables
   cat .env | grep RPC_BASE_MAINNET
   ```

4. **Port Already in Use**

   ```bash
   # Error: Port 8545 already in use
   Error: listen EADDRINUSE: address already in use :::8545

   # Solution: Kill existing process or use different port
   lsof -ti:8545 | xargs kill -9
   ```

5. **Dependencies Not Installed**

   ```bash
   # Error: Cannot find module
   Error: Cannot find module 'better-sqlite3'

   # Solution: Install all dependencies
   npm install
   ```

### Runtime Issues

1. **RPC Rate Limiting**

   - Use paid RPC providers with higher rate limits
   - Implement retry logic with exponential backoff
   - Consider using multiple RPC endpoints

2. **Memory Issues**

   - Increase Node.js memory: `node --max-old-space-size=8192`
   - Process events in smaller batches
   - Use checkpointing for large simulations

3. **Historical Data Unavailable**

   - Ensure RPC supports archival data back to block 24,189,831
   - Verify block numbers are correct for your chain
   - Check if node pruning affects required historical blocks

4. **Fork Failures**
   - Verify RPC endpoint accessibility and stability
   - Check network connectivity and bandwidth
   - Ensure sufficient disk space (2GB+ recommended)

### Performance Tips

1. **Batch Processing**: Process events in batches to improve performance
2. **Checkpointing**: Save state periodically during long simulations
3. **Parallel Processing**: Use multiple networks simultaneously where possible
4. **Memory Management**: Monitor memory usage and implement cleanup

## 🔧 Development Notes

- **Database file must exist:** `./decoded_transactions_base_mainnet.db`
- **Forked node required** for network/mining/time tests
- **Test order matters:** Database → Network → Mining → Time
- **Comprehensive logging** for easy debugging
- **Graceful error handling** with clear error messages

## 🧹 Files Removed During Cleanup

- ❌ `test.js` - Redundant standalone test (functionality moved to test-foundation.ts)
- ❌ `mining-controller.validateMiningControl()` - Moved to test-foundation.ts
- ❌ Various scattered test functions - Consolidated into single test suite

## Next Steps

The simulation foundation is now complete! Next steps:

1. ✅ **Database helpers** - Complete (transaction loading, batch processing)
2. ✅ **Mining controller** - Complete (auto-mining control, time manipulation)
3. ✅ **Foundation testing** - Complete (validation scripts working)
4. 🔄 **Main simulation logic** - Implement in `runSimulation()` method:
   - Load transactions in chronological order
   - Set up initial state at V8.0
   - Replay transactions with proper timing
   - Calculate rewards after each proof period
   - Generate final report
5. 🔄 **Score calculation helpers** - Add Random Sampling and reward calculation
6. 🔄 **Export builders** - Create output JSON formatters for V8.1.2 distribution

## Support

For issues or questions:

1. Check the troubleshooting section above
2. Review the test output for specific error messages
3. Verify environment variables and RPC endpoints
4. Ensure all prerequisites are met
