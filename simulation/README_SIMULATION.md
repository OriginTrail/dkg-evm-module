# DKG V8 Tuning Period Rewards Simulation

This document provides a comprehensive guide to setting up, running, and understanding the V8 Tuning period rewards simulation environment. Its purpose is to ensure a smooth handover and to allow any team member to effectively use and maintain this tool.

---

## 1. Overview

### Purpose

The primary goal of this simulation is to accurately replay historical on-chain activity from the DKG v8.0 to v8.1 period (the "V8 Tuning period"). This allows us to validate and calculate delegator rewards and operator fees under the v8.1 contract logic, ensuring correctness before any on-chain distribution.

### Core Functionality

At a high level, the simulation performs the following steps:

1.  **Forks a mainnet chain** at a specific historical block corresponding to the beginning of the v8.0 contract state.
2.  **Deploys the new v8.1 contracts** onto this forked environment.
3.  **Migrates delegator data** to the new v8.1 contracts.
4.  **Replays historical transactions** from a local database, simulating the exact sequence of rewards-relevant events that occurred on-chain.
5.  **Calculates rewards** based on the v8.1 logic after replaying all relevant activity.
6.  **Exports the results** to JSON and CSV files for analysis and use in the rewards distribution contracts.

### Supported Chains

The simulation is configured to run against the following networks:

- Base Mainnet
- Gnosis Mainnet
- Neuroweb Mainnet

## 2. Prerequisites

Before running the simulation, ensure your local environment is correctly configured.

### Environment Variables

The simulation requires RPC endpoints for the chains you intend to simulate. These must be **archival nodes** to access the required historical state.

1.  Create a `.env` file in the project root if it doesn't already exist.
2.  Add the following variables, pointing to your archival node providers:

    ```bash
    # Required for Base Mainnet
    RPC_BASE_MAINNET=https://your-base-mainnet-archival-rpc-url

    # Required for Gnosis Mainnet
    RPC_GNOSIS_MAINNET=https://your-gnosis-mainnet-archival-rpc-url

    # Required for Neuroweb Mainnet
    RPC_NEUROWEB_MAINNET=https://your-neuroweb-mainnet-rpc-url
    ```

### Database Files

The simulation replays transactions from pre-populated SQLite databases (Populated from the indexer thorugh Filip's export script).

1.  **CRITICAL**: Before every simulation run, you **must restore the database to its initial state**. The easiest way is to use git: `git restore simulation/db/`.
2.  The required files, which should be present in `simulation/db/`, are:
    - `decoded_transactions_base_mainnet.db`
    - `decoded_transactions_gnosis_mainnet.db`
    - `decoded_transactions_neuroweb_mainnet.db`

### Node.js Dependencies

Install the required project dependencies by running:

```bash
npm install
```

## 3. Quick Start

### 1. Start the Forked Node & Deploy Contracts

The `start-forked-nodes.sh` script is the single command needed for blockchain setup. It automatically handles forking the chain and deploying the necessary v8.1 contracts.

For Base, open a terminal and run:

```bash
# Example for Base Mainnet
sh ./simulation/start-forked-nodes.sh base
```

This script starts the node in the background, runs the deployment scripts, and saves its output to a log file (e.g., `hardhat-Base_Mainnet.log`).

### 2. Run the Simulation

Once the forked node is running (accounts are funded and logs show no issues), open a **new terminal** and execute the simulation script:

```bash
sh ./simulation/run-simulation.sh
```

This will start the main simulation process, which connects to the local forked node. The output is logged to `simulation.log`. You can monitor its progress with `tail -f simulation.log`.

### 3. Stop the Node

After the simulation is complete/stuck, or when you are finished, stop the background Hardhat node:

```bash
sh ./simulation/stop-simulation.sh
```

## 4. The Deployment Process (`deploy/` folder)

When `start-forked-nodes.sh` runs, it triggers the scripts in the `deploy/` directory, which are specifically modified for this simulation environment.

- **Reading Forked State**: The initial script, `000_setup_existing_contracts.ts`, connects to the forked chain, identifies which network it is (Base, Gnosis, etc.) by finding the known Hub address, and reads all the existing v8.0 contracts from its state.
- **Selective v8.1 Deployment**: Subsequent scripts do not redeploy the entire system. Instead, they only deploy the specific v8.1 contracts that are new or have changed (like `Staking`, `Profile`, `RandomSampling`, etc.).
- **Impersonation for Setup**: Some scripts are adjusted to use `impersonateAccount` on the Hub owner. This allows them to perform administrative actions on the forked contracts (like registering the newly deployed v8.1 contracts in the old Hub), which is essential for creating a correctly configured hybrid state.

## 5. How It Works: The Simulation Lifecycle

1.  **Initialization**: The `HistoricalRewardsSimulation` class is instantiated, connecting to the transaction database.

2.  **Contract Setup**: The script fetches the v8.1 contracts that were deployed when the node started. It then calls `migrateDelegators`, which reads all known delegators from the mainnet `DelegatorsInfo` contract and from local JSON files (delegators we found in the v8.0 --> V8.1 migrations), migrating them into the locally deployed `DelegatorsInfo` contract.

3.  **Transaction Replay & Score Finalization**:

    - The script fetches historical transactions chronologically from the database.
    - It uses Hardhat's tools (`impersonateAccount`, `evm_setTime`) to replay each one.
    - **Crucially, it finalizes delegator scores at two key moments using `_prepareForStakeChange`:**
      1.  **At Each Epoch Transition**: When the simulation time crosses into a new epoch, it calls `_prepareForStakeChange` for all nodes and their _currently known_ delegators. This locks in the scores for that epoch based on the state at that exact moment, ensuring future rewards accuracy.
      2.  **After a New Delegator is Migrated**: If a transaction involves migrating a new delegator (via `Migrator` or `MigratorM1V8`), the script immediately calls `_prepareForStakeChange` _for that specific delegator for all previous epochs_. This backfills their scores correctly, ensuring they get credit for their stake even though they appeared later in the simulation. All node stake was migrated from V6 to V8 so doing this makes sense, it doesn't take away rewards from other delegators, it simply ensures the new delegator gets credit where they deserve.

4.  **Final Reward Calculation**:
    - After all transactions are replayed, the script calls `distributeRewards` **only once**. This is done at the end to ensure all delegators (including those added late via migration) are present and the final, settled state of all epochs is used for calculations. This prevents premature claims or incorrect reward allocations.
    - It then exports the results to JSON and CSV files.

## 6. Mining and Timestamp Handling

A critical aspect of the simulation is how it handles time.

- **No Manual Mining**: The simulation relies on Hardhat's default auto-mining behavior.
- **Timestamp Synchronization**: The script attempts to align the forked chain's time with the historical transaction's timestamp using `evm_setTime`.
- **Known Issue**: Sometimes, Hardhat's auto-mined block has a timestamp that is _ahead_ of the historical transaction being processed. The simulation detects this and proceeds with the current (more advanced) Hardhat timestamp. While not ideal, this is mitigated by the logic in `catchUpProofPeriods` and `handleEpochTransitions`, which ensures that score calculations remain correct despite these small timing drifts.

## 7. Code & Project Structure

- **`simulation/`**

  - `historical-rewards-simulation.ts`: The main entry point and orchestrator.
  - **`helpers/`**: Core logic modules.
    - `simulation-constants.ts`: Defines critical constants like chain IDs, fork block numbers, and contract addresses.
    - `db-helpers.ts`: The `SimulationDatabase` class, responsible for all interactions with the SQLite transaction databases.
    - `mining-controller.ts`: A wrapper around Hardhat's RPC methods for controlling time (`evm_setTime`).
    - `blockchain-helpers.ts`: Utilities for blockchain interaction, like impersonating accounts and fetching deployed contracts.
    - `simulation-helpers.ts`: Core business logic for calculating scores, rewards, and handling data migrations.
    - `validation.ts`: Functions used to validate on-chain state against expected values during the replay.
  - **`tests/`**: Older validation scripts, primarily used to verify the initial Hardhat setup.
  - `start-forked-nodes.sh`, `run-simulation.sh`, `stop-simulation.sh`: Control scripts.
  - **`db/`**: Location for the input SQLite database files. **Must be restored before each run.**

- **`deploy/`**: The `hardhat-deploy` scripts in this folder are executed at the beginning of the simulation to set up the v8.1 contract environment.

## 8. Testing and Validation

These tests are primarily for verifying the initial setup. **A forked node must be running.**

#### Foundation Tests

Checks core, non-contract-related components.

1.  Start a forked node: `sh ./simulation/start-forked-nodes.sh base`
2.  In a new terminal, run: `npx hardhat test-simulation-foundation --network localhost`

#### Contract Setup Validation

This script inspects the deployed contracts on the forked node to ensure they are set up correctly.

1.  Start a forked node: `sh ./simulation/start-forked-nodes.sh base`
2.  Run: `npx hardhat test simulation/tests/test-hardhat-setup.ts --network localhost`

## 9. Troubleshooting & Known Issues

- **CRITICAL: Stale Database**: If you restart a simulation, you **MUST** restore the database to its initial state (e.g., `git restore simulation/db/`). Failure to do so will result in skipped transactions and incorrect calculations, as the database tracks processed transactions.

- **Hardhat Node Instability**: Sometimes, the Hardhat forked node can become unstable (e.g., `header timeout` errors).

  - **Solution**: Stop the node (`sh ./simulation/stop-simulation.sh`), restore the database, start the node, and run the simulation again.

- **Timestamp Mismatch (Known Issue)**: As noted in the "Mining and Timestamp Handling" section, the simulation may log warnings about being unable to set the time backwards. This is a known, non-critical issue with a mitigation in place.

- **Error: `listen EADDRINUSE: address already in use :::8545`**
  - **Solution**: Another process is using the port. Use `sh ./simulation/stop-simulation.sh` to kill any lingering Hardhat nodes.
